// Pain point runs on the local Supabase stack (CI job "worker-integration"):
// CSV feedback import → run request → worker (fake provider) → clusters with
// statistics, history, gaps and eligible hypotheses; problems reused by a
// second run; run state follows its job (cancellation included).
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createServiceClient, jobsRepo, painRepo, type DbClient } from "@sor/database";
import { AIGateway, FAKE_MODELS, FakeProvider } from "@sor/ai-gateway";
import { fakePainPointHandlers } from "@sor/pain-point-engine";
import { Worker } from "../../src/runtime";
import { feedbackImportHandler } from "../../src/handlers/imports";
import { painPointRunHandler } from "../../src/handlers/pain";
import { limitsLoader } from "../../src/main";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const run = url && secretKey ? describe : describe.skip;
const SALT = "integration-salt-0123456789abcdef0123";
let db: DbClient;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hash = () => randomUUID().replace(/-/g, "").padEnd(64, "0");

async function workspace(): Promise<{ id: string; user: string }> {
  const { data, error } = await db.auth.admin.createUser({
    email: `pain-${randomUUID()}@demo.test`,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("no user");
  const id = randomUUID();
  await db.from("workspaces").insert({ id, name: "Pain", created_by: data.user.id }).throwOnError();
  await db
    .from("workspace_members")
    .insert({ workspace_id: id, user_id: data.user.id, role: "owner" })
    .throwOnError();
  return { id, user: data.user.id };
}

async function product(name: string): Promise<{ id: string; slug: string }> {
  const id = randomUUID();
  const slug = `${name.toLowerCase()}-${id.slice(0, 8)}`;
  await db
    .from("saas_products")
    .insert({ id, name, slug, record_status: "active", exclusion_status: "eligible" })
    .throwOnError();
  return { id, slug };
}

function makeWorker() {
  const limits = limitsLoader(db, 0);
  const gateway = new AIGateway({
    provider: new FakeProvider(fakePainPointHandlers),
    models: FAKE_MODELS,
  });
  return new Worker({
    db,
    workerId: `pain-${randomUUID().slice(0, 8)}`,
    handlers: {
      feedback_import: feedbackImportHandler({ db, authorHashSecret: SALT, limits }),
      pain_point_run: painPointRunHandler({ db, gateway, limits }),
    },
    leaseSeconds: 5,
    heartbeatSeconds: 1,
    concurrency: 2,
    jobTimeoutSeconds: 60,
    backoff: { baseSeconds: 1, capSeconds: 2, random: () => 0 },
    log: () => undefined,
  });
}

async function waitFor(jobId: string, worker: Worker) {
  for (let i = 0; i < 80; i++) {
    await worker.tick();
    const { data } = await db.from("job_executions").select("*").eq("id", jobId).single();
    if (data && ["completed", "partial", "failed", "cancelled", "dead_letter"].includes(data.state))
      return data;
    await sleep(250);
  }
  throw new Error(`job ${jobId} did not finish`);
}

run("pain point runs on the local Supabase stack", () => {
  beforeAll(() => {
    db = createServiceClient({ url: url as string, secretKey: secretKey as string });
  });

  it("imports feedback, clusters problems with statistics and generates eligible hypotheses", async () => {
    const ws = await workspace();
    const alpha = await product("Alpha");
    const beta = await product("Beta");
    const worker = makeWorker();
    const csv = [
      "product_slug,source_url,source_name,published_at,rating,rating_scale_max,text,author_reference,author_company",
      `${alpha.slug},https://reviews.test/a1,Survey,2026-09-01T00:00:00Z,2,5,The CSV export times out on big accounts.,ann@example.com,Shop A`,
      `${alpha.slug},https://reviews.test/a2,Survey,2026-09-03T00:00:00Z,2,5,CSV export keeps timing out for us.,bob@example.com,`,
      `${beta.slug},https://reviews.test/b1,Survey,2026-09-05T00:00:00Z,1,5,Our CSV export times out every time.,cat@example.com,Shop C`,
      `${beta.slug},https://reviews.test/b2,Survey,2026-09-06T00:00:00Z,5,5,Great product and we love it.,dan@example.com,`,
    ].join("\n");
    const imported = await jobsRepo.requestJob(db, {
      kind: "feedback_import",
      workspaceId: ws.id,
      requestedBy: ws.user,
      idempotencyKey: `pain-import-${randomUUID()}`,
      requestHash: hash(),
      payload: {
        csv,
        row_count: 4,
        rights_declaration: {
          storage: "excerpt",
          author_reference_storage_permitted: true,
          declared_basis: "Our own customer survey export",
        },
      } as never,
    });
    expect((await waitFor(imported.jobId, worker)).state).toBe("completed");

    const requested = await painRepo.requestRun(db, {
      workspaceId: ws.id,
      requestedBy: ws.user,
      idempotencyKey: `pain-run-${randomUUID()}`,
      requestHash: hash(),
      title: "Exports",
      scopeType: "product_set",
      productIds: [alpha.id, beta.id],
      categoryId: null,
      parameters: { max_feedback_items: 100 },
    });
    const job = await waitFor(requested.jobId, worker);
    expect(job.state).toBe("completed");
    const { data: runRow } = await db
      .from("pain_point_runs")
      .select("*")
      .eq("id", requested.runId)
      .single();
    expect(runRow).toMatchObject({
      status: "completed",
      feedback_considered: 4,
      clusters_created: 1,
      algorithm_version: "cluster-1",
    });
    expect(runRow?.started_at).not.toBeNull();

    const { data: clusters } = await db
      .from("pain_point_clusters")
      .select("*")
      .eq("run_id", requested.runId);
    expect(clusters).toHaveLength(1);
    expect(clusters?.[0]).toMatchObject({
      problem_category: "performance",
      feedback_count: 3,
      distinct_author_count: 3,
      distinct_author_count_status: "verified",
      distinct_company_count: 2,
      distinct_company_count_status: "estimated",
      affected_product_count: 2,
      review_status: "machine_proposed",
    });
    const { count: snapshots } = await db
      .from("pain_point_cluster_snapshots")
      .select("*", { count: "exact", head: true })
      .eq("cluster_id", clusters?.[0]?.id as string);
    expect(snapshots).toBe(1);
    const { data: opps } = await db
      .from("generated_opportunities")
      .select("*")
      .eq("created_from_run_id", requested.runId);
    expect(opps?.every((o) => o.exclusion_status === "eligible" && o.is_hypothesis)).toBe(true);
    const { count: usage } = await db
      .from("provider_usage")
      .select("*", { count: "exact", head: true })
      .eq("job_execution_id", requested.jobId)
      .eq("provider", "fake");
    expect(usage).toBeGreaterThan(0);

    // A second run over the same feedback reuses the extracted problems.
    const { count: before } = await db
      .from("feedback_problems")
      .select("*", { count: "exact", head: true })
      .in("product_id", [alpha.id, beta.id]);
    const second = await painRepo.requestRun(db, {
      workspaceId: ws.id,
      requestedBy: ws.user,
      idempotencyKey: `pain-run-${randomUUID()}`,
      requestHash: hash(),
      title: "Exports again",
      scopeType: "product_set",
      productIds: [alpha.id, beta.id],
      categoryId: null,
      parameters: {},
    });
    const secondJob = await waitFor(second.jobId, worker);
    expect(secondJob.state).toBe("completed");
    expect(
      secondJob.result as { problems_extracted: number; problems_reused: number },
    ).toMatchObject({
      problems_extracted: 0,
    });
    const { count: after } = await db
      .from("feedback_problems")
      .select("*", { count: "exact", head: true })
      .in("product_id", [alpha.id, beta.id]);
    expect(after).toBe(before);
  });

  it("a cancelled job cancels its run", async () => {
    const ws = await workspace();
    const alpha = await product("Gamma");
    const requested = await painRepo.requestRun(db, {
      workspaceId: ws.id,
      requestedBy: ws.user,
      idempotencyKey: `pain-run-${randomUUID()}`,
      requestHash: hash(),
      title: "To cancel",
      scopeType: "product",
      productIds: [alpha.id],
      categoryId: null,
      parameters: {},
    });
    await jobsRepo.cancelJob(db, { jobId: requested.jobId, workspaceId: ws.id, actor: ws.user });
    const { data } = await db
      .from("pain_point_runs")
      .select("status, completed_at")
      .eq("id", requested.runId)
      .single();
    expect(data?.status).toBe("cancelled");
    expect(data?.completed_at).not.toBeNull();
  });
});
