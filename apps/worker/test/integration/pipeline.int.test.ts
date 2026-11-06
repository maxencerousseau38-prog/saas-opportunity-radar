// Integration tests on the local Supabase stack (CI job "worker-integration").
// Real PGMQ, RPCs and RLS; a loopback fixture site stands in for official
// websites (allowed only by this test policy, never in production).
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DbError, createServiceClient, jobsRepo, type DbClient } from "@sor/database";
import { OfficialWebsiteConnector, defaultPolicy, isPublicAddress } from "@sor/data-sources";
import { AIGateway, FAKE_MODELS, FakeProvider } from "@sor/ai-gateway";
import { D5_AGENT_KEY, D6_AGENT_KEY, fakeEnrichmentHandlers } from "@sor/discovery-engine";
import { Worker, type JobHandler } from "../../src/runtime";
import { enrichmentHandler } from "../../src/handlers/enrichment";
import { catalogImportHandler, feedbackImportHandler } from "../../src/handlers/imports";
import { limitsLoader } from "../../src/main";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const run = url && secretKey ? describe : describe.skip;

let db: DbClient;
let server: Server;
let port = 0;
let flakyHits = 0;
const SALT = "integration-salt-0123456789abcdef0123";

const PAGES: Record<string, string> = {
  "/": `<title>Acme Metrics</title><p>Acme Metrics turns ad spend data into clear weekly reports.</p>
        <a href="/pricing">Pricing</a><a href="/features">Features</a>`,
  "/pricing": "<h1>Pricing</h1><p>Starter 19 € / mois</p><p>Growth 49 € / mois</p>",
  "/features": "<h2>Features</h2><ul><li>Weekly reports</li><li>Budget alerts</li></ul>",
};

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function workspace(): Promise<{ id: string; user: string }> {
  const email = `int-${randomUUID()}@demo.test`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("no user");
  const id = randomUUID();
  const user = data.user.id;
  await db.from("workspaces").insert({ id, name: "Integration", created_by: user }).throwOnError();
  await db
    .from("workspace_members")
    .insert({ workspace_id: id, user_id: user, role: "owner" })
    .throwOnError();
  return { id, user };
}

async function product(host: string, path = "/"): Promise<string> {
  const id = randomUUID();
  await db
    .from("saas_products")
    .insert({
      id,
      name: `Acme ${host}`,
      slug: `acme-${host.replace(/[^a-z0-9]/g, "-")}`,
      website_url: `http://${host}:${port}${path}`,
      record_status: "active",
      exclusion_status: "eligible",
    })
    .throwOnError();
  // Catalog products carry their canonical-URL identifier (ADR-002).
  await db
    .from("entity_identifiers")
    .insert({
      product_id: id,
      identifier_type: "canonical_url",
      value_normalized: `http://${host}:${port}${path}`.replace(/\/$/, ""),
      is_primary: true,
    })
    .throwOnError();
  return id;
}

function makeWorker(provider = new FakeProvider(fakeEnrichmentHandlers), workerId = "int-worker") {
  const connector = new OfficialWebsiteConnector({
    policy: defaultPolicy({
      resolve: async (h) => (h.endsWith(".test") ? [{ address: "127.0.0.1", family: 4 }] : []),
      isAddressAllowed: (a) => a === "127.0.0.1" || isPublicAddress(a),
      timeoutMs: 5000,
    }),
    minIntervalMs: 0,
  });
  const limits = limitsLoader(db, 0);
  const gateway = new AIGateway({ provider, models: FAKE_MODELS });
  const handlers: Record<string, JobHandler> = {
    product_enrichment: enrichmentHandler({ db, connector, gateway, limits }),
    catalog_import: catalogImportHandler({ db, limits }),
    feedback_import: feedbackImportHandler({ db, authorHashSecret: SALT, limits }),
  };
  return {
    provider,
    worker: new Worker({
      db,
      workerId,
      handlers,
      leaseSeconds: 2,
      heartbeatSeconds: 0.5,
      concurrency: 5,
      jobTimeoutSeconds: 60,
      backoff: { baseSeconds: 1, capSeconds: 2, random: () => 0 },
      log: () => undefined,
    }),
    handlers,
  };
}

async function waitFor(
  jobId: string,
  worker: Worker,
  states = ["completed", "partial", "failed", "cancelled", "dead_letter"],
) {
  for (let i = 0; i < 60; i++) {
    await worker.tick();
    const { data } = await db.from("job_executions").select("*").eq("id", jobId).single();
    if (data && states.includes(data.state)) return data;
    await sleep(250);
  }
  throw new Error(`job ${jobId} did not finish`);
}

const request = (
  ws: { id: string; user: string },
  kind: jobsRepo.JobKind,
  payload: Record<string, unknown>,
) =>
  jobsRepo.requestJob(db, {
    kind,
    workspaceId: ws.id,
    requestedBy: ws.user,
    idempotencyKey: `int-${randomUUID()}`,
    requestHash: randomUUID().replace(/-/g, "").padEnd(64, "0"),
    payload: payload as never,
  });

run("worker on the local Supabase stack", () => {
  beforeAll(async () => {
    db = createServiceClient({ url: url as string, secretKey: secretKey as string });
    server = createServer((req, res) => {
      const path = (req.url ?? "/").split("?")[0] ?? "/";
      if (path === "/robots.txt") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("User-agent: *\nDisallow: /private\n");
      } else if (path === "/flaky" && flakyHits++ === 0) {
        res.writeHead(503, { "content-type": "text/plain" });
        res.end("busy");
      } else if (path === "/slow") {
        setTimeout(() => {
          res.writeHead(200, { "content-type": "text/html" });
          res.end(PAGES["/"]);
        }, 1500);
      } else {
        const page = PAGES[path] ?? (path === "/flaky" ? PAGES["/"] : undefined);
        res.writeHead(page ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
        res.end(page ?? "missing");
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("enriches a product with traceable evidence, then ignores a duplicate delivery", async () => {
    const ws = await workspace();
    const productId = await product("happy.test");
    const { worker } = makeWorker();
    const { jobId } = await request(ws, "product_enrichment", { product_id: productId });
    const job = await waitFor(jobId, worker);
    expect(job.state).toBe("completed");
    expect(job.result).toMatchObject({ pages_fetched: 3, provider: "fake" });

    const { data: plans } = await db
      .from("pricing_plans")
      .select("plan_name, price_amount, currency, billing_period")
      .eq("product_id", productId)
      .is("superseded_at", null)
      .order("price_amount");
    expect(plans).toEqual([
      { plan_name: "Starter", price_amount: 19, currency: "EUR", billing_period: "month" },
      { plan_name: "Growth", price_amount: 49, currency: "EUR", billing_period: "month" },
    ]);
    const { data: evidence } = await db
      .from("evidence_items")
      .select(
        "id, claim_type, verification_status, monetization_signal, source_snapshot_id, extracted_by_step_id",
      )
      .eq("product_id", productId);
    expect(evidence?.length).toBeGreaterThan(0);
    expect(evidence?.every((e) => e.extracted_by_step_id && e.source_snapshot_id)).toBe(true);
    expect(
      evidence
        ?.filter((e) => e.claim_type === "pricing")
        .every((e) => e.monetization_signal === "paid_plan_available"),
    ).toBe(true);
    const { data: prov } = await db
      .from("catalog_field_provenance")
      .select("field_key")
      .eq("product_id", productId)
      .eq("is_current", true);
    expect(prov?.map((p) => p.field_key)).toContain("short_description");
    const { data: steps } = await db
      .from("agent_step_runs")
      .select("agent_key, state, provider")
      .eq("job_execution_id", jobId);
    expect(steps?.filter((s) => s.agent_key === D5_AGENT_KEY)).toEqual([
      { agent_key: D5_AGENT_KEY, state: "completed", provider: "fake" },
    ]);
    const { data: usage } = await db
      .from("provider_usage")
      .select("outcome")
      .eq("job_execution_id", jobId);
    expect(usage?.every((u) => u.outcome === "ok")).toBe(true);

    // Duplicate delivery of the same envelope: nothing is repeated.
    const before = evidence?.length;
    await worker.process({
      msg_id: 999_999_999,
      read_ct: 2,
      message: { schema_version: "job.v1", kind: "product_enrichment", job_execution_id: jobId },
    });
    const { count } = await db
      .from("evidence_items")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId);
    expect(count).toBe(before);
  });

  it("a killed worker's job is recovered after its lease expires, without repeating work", async () => {
    const ws = await workspace();
    const productId = await product("crash.test");
    const { jobId } = await request(ws, "product_enrichment", { product_id: productId });

    // Worker A claims the job, completes D5, then dies before D6 (no finish, no retry).
    const dying = new FakeProvider({
      ...fakeEnrichmentHandlers,
      [D6_AGENT_KEY]: () => {
        throw Object.assign(new Error("process killed"), { killed: true });
      },
    });
    const a = makeWorker(dying, "int-worker-a");
    const messages = await jobsRepo.workerRead(db, 10, 2);
    expect(
      messages.some((m) => (m.message as { job_execution_id?: string }).job_execution_id === jobId),
    ).toBe(true);
    const claimed = await jobsRepo.workerClaim(db, jobId, "int-worker-a", 2);
    expect(claimed?.attempt_count).toBe(1);
    await expect(
      (a.handlers.product_enrichment as JobHandler)({
        job: claimed as jobsRepo.JobRow,
        signal: new AbortController().signal,
        cancelRequested: () => false,
        deadline: new Date(Date.now() + 60_000),
      }),
    ).rejects.toThrow();
    expect(dying.calls.map((c) => c.agentKey)).toContain(D5_AGENT_KEY);

    // Lease (2 s) and message visibility expire; worker B recovers the job.
    await sleep(2500);
    const b = makeWorker(new FakeProvider(fakeEnrichmentHandlers), "int-worker-b");
    const job = await waitFor(jobId, b.worker);
    expect(job).toMatchObject({ state: "completed", attempt_count: 2 });
    expect(b.provider.calls.map((c) => c.agentKey)).toEqual([D6_AGENT_KEY]); // D5 reused, not repeated
    const { data: steps } = await db
      .from("agent_step_runs")
      .select("agent_key, step_key, attempt, state")
      .eq("job_execution_id", jobId);
    // D5 ran once, during attempt 1, and was reused by attempt 2; apply completed once.
    expect(steps?.filter((st) => st.agent_key === D5_AGENT_KEY)).toEqual([
      { agent_key: D5_AGENT_KEY, step_key: "extract", attempt: 1, state: "completed" },
    ]);
    expect(
      steps?.filter((st) => st.agent_key === "enrichment_apply").map((st) => st.state),
    ).toEqual(["completed"]);
  });

  it("retries a transient upstream failure with backoff", async () => {
    const ws = await workspace();
    flakyHits = 0;
    const productId = await product("flaky.test", "/flaky");
    const { worker } = makeWorker();
    const { jobId } = await request(ws, "product_enrichment", { product_id: productId });
    const job = await waitFor(jobId, worker);
    expect(job).toMatchObject({ state: "completed", attempt_count: 2 });
  });

  it("cancels a running job cooperatively", async () => {
    const ws = await workspace();
    const productId = await product("slow.test", "/slow");
    const { worker } = makeWorker();
    const { jobId } = await request(ws, "product_enrichment", { product_id: productId });
    const ticking = worker.tick();
    await sleep(300);
    expect(await jobsRepo.cancelJob(db, { jobId, workspaceId: ws.id, actor: ws.user })).toBe(
      "running",
    );
    await ticking;
    const { data } = await db
      .from("job_executions")
      .select("state, terminal_reason")
      .eq("id", jobId)
      .single();
    expect(data).toEqual({ state: "cancelled", terminal_reason: "cancelled" });
  });

  it("a SIGTERM drain releases a running job, which another worker completes at once", async () => {
    const ws = await workspace();
    const productId = await product("drain.test", "/slow");
    const a = makeWorker(undefined, "int-worker-drain-a");
    const { jobId } = await request(ws, "product_enrichment", { product_id: productId });
    const ticking = a.worker.tick();
    await sleep(300);
    // Grace shorter than the slow page: the job is aborted and released.
    expect(await a.worker.shutdown(100)).toEqual({ released: 1 });
    await ticking;
    const { data: released } = await db
      .from("job_executions")
      .select("state, attempt_count, last_error_code, lease_owner")
      .eq("id", jobId)
      .single();
    expect(released).toEqual({
      state: "retrying",
      attempt_count: 0,
      last_error_code: "WORKER_SHUTDOWN",
      lease_owner: null,
    });
    // No interrupted step is stored as completed.
    const { data: steps } = await db
      .from("agent_step_runs")
      .select("state")
      .eq("job_execution_id", jobId);
    expect(steps?.every((st) => st.state !== "completed")).toBe(true);

    const b = makeWorker(undefined, "int-worker-drain-b");
    const job = await waitFor(jobId, b.worker);
    expect(job).toMatchObject({ state: "completed", attempt_count: 1 });
  });

  it("imports products and feedback from CSV with per-row results", async () => {
    const ws = await workspace();
    const existing = await product("existing.test");
    const { worker } = makeWorker();
    const csv = [
      "name,website_url,company_name,country_code,employee_min,employee_max,category_slugs,source_url",
      `Imported One,https://imported-one-${randomUUID().slice(0, 8)}.test,Imported Co,FR,2,5,marketing-growth-seo,`,
      "No URL,not-a-url,,,,,,",
      `Existing Again,http://existing.test:${port}/,,,,,,`,
      `Affiliate Hub ${randomUUID().slice(0, 6)},https://aff-${randomUUID().slice(0, 8)}.test,,,,,,`,
    ].join("\n");
    const { jobId } = await request(ws, "catalog_import", { csv, row_count: 4 });
    const job = await waitFor(jobId, worker);
    expect(job.state).toBe("partial");
    const rows = (
      job.result as { rows: Array<{ row: number; status: string; product_id?: string }> }
    ).rows;
    // The standalone word "affiliate" in a name sends the product to review (§5.4 R7).
    expect(rows.map((r) => r.status)).toEqual([
      "created",
      "rejected",
      "matched_existing",
      "created_needs_review",
    ]);
    expect(rows[2]?.product_id).toBe(existing);

    const slug = `acme-existing-test`;
    const feedback = [
      "product_slug,source_url,source_name,published_at,rating,rating_scale_max,text,author_reference,author_company",
      `${slug},https://reviews.test/1,Survey,2026-10-01T00:00:00Z,2,5,Reports are too slow to load,jane@example.com,Shop A`,
      `${slug},https://reviews.test/2,Survey,,1,5,Reports are too  SLOW to load,john@example.com,`,
      `unknown-product,https://reviews.test/3,Survey,,,,Great tool,,`,
    ].join("\n");
    const fb = await request(ws, "feedback_import", {
      csv: feedback,
      row_count: 3,
      rights_declaration: {
        storage: "excerpt",
        author_reference_storage_permitted: true,
        declared_basis: "Our own customer survey export",
      },
    });
    const fbJob = await waitFor(fb.jobId, worker);
    expect((fbJob.result as { rows: Array<{ status: string }> }).rows.map((r) => r.status)).toEqual(
      ["created", "duplicate", "rejected"],
    );
    const { data: stored } = await db
      .from("customer_feedback")
      .select("original_text, author_reference_hash, content_storage_status")
      .eq("product_id", existing);
    expect(stored).toHaveLength(1);
    expect(stored?.[0]?.content_storage_status).toBe("stored_excerpt");
    expect(stored?.[0]?.author_reference_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain("jane@example.com");
  });

  it("rate-limits job requests per user with a retry delay; replays are still answered (S7.2)", async () => {
    // The per-user hourly counter does not depend on the queue (other test
    // files' workers may take these jobs), so this check is deterministic.
    const owner = await workspace();
    const spaces = [owner];
    for (let i = 0; i < 10; i++) {
      const id = randomUUID();
      await db
        .from("workspaces")
        .insert({ id, name: `Quota ${i}`, created_by: owner.user })
        .throwOnError();
      await db
        .from("workspace_members")
        .insert({ workspace_id: id, user_id: owner.user, role: "owner" })
        .throwOnError();
      spaces.push({ id, user: owner.user });
    }
    const csv = "name,website_url\nQuota Co,https://quota.test/";
    const hash = "a".repeat(64);
    const ask = (ws: { id: string; user: string }, key: string) =>
      jobsRepo.requestJob(db, {
        kind: "catalog_import",
        workspaceId: ws.id,
        requestedBy: ws.user,
        idempotencyKey: key,
        requestHash: hash,
        payload: { csv, row_count: 1 } as never,
      });
    // 30 = api_rate_limit_job_posts_per_hour; 3 per workspace stays within
    // max_concurrent_jobs_per_workspace.
    for (let i = 0; i < 30; i++) {
      const res = await ask(spaces[Math.floor(i / 3)]!, `quota-${owner.user}-${i}`);
      expect(res.created).toBe(true);
    }
    const refused = await ask(spaces[10]!, `quota-${owner.user}-30`).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(DbError);
    expect((refused as DbError).code).toBe("RATE_LIMITED");
    expect((refused as DbError).limit).toBe("job_posts");
    expect((refused as DbError).retryAfterSeconds).toBeGreaterThan(0);
    expect((refused as DbError).retryAfterSeconds).toBeLessThanOrEqual(3600);

    const replay = await ask(spaces[0]!, `quota-${owner.user}-0`);
    expect(replay.created).toBe(false);
    const { count } = await db
      .from("job_executions")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", spaces[10]!.id);
    expect(count).toBe(0);
    const usage = (await jobsRepo.workspaceUsage(db, {
      workspaceId: spaces[0]!.id,
      userId: owner.user,
    })) as { my_job_requests_this_hour: number; max_job_requests_per_hour: number };
    expect(usage).toMatchObject({ my_job_requests_this_hour: 30, max_job_requests_per_hour: 30 });
  });
});
