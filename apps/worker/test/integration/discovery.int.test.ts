// Discovery runs on the local Supabase stack (CI job "worker-integration"):
// request → worker (fake provider, SYNTHETIC official pages, no network) →
// candidates and run summary written through the M8 RPCs. Hacker News stays
// disabled in the registry, so the search channel reports it and calls
// nothing. Covers success, unreachable site (partial), crash recovery
// without repeated model calls, duplicate delivery and cancellation.
import { createHash, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createServiceClient, discoveryRepo, jobsRepo, type DbClient } from "@sor/database";
import { AIGateway, FAKE_MODELS, FakeProvider } from "@sor/ai-gateway";
import {
  defaultPolicy,
  failure,
  type ConnectorOutcome,
  type SourceConnector,
} from "@sor/data-sources";
import type { SourceDocument } from "@sor/contracts";
import { D1_AGENT_KEY, D3_AGENT_KEY, fakeDiscoveryHandlers } from "@sor/discovery-engine";
import { Worker, type JobHandler } from "../../src/runtime";
import { discoveryRunHandler } from "../../src/handlers/discovery";
import { limitsLoader } from "../../src/main";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const run = url && secretKey ? describe : describe.skip;
let db: DbClient;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Synthetic official sites (labelled test data, never fetched from the network). */
function siteConnector(
  pages: Record<string, { title: string; text: string } | "unavailable">,
): SourceConnector {
  return {
    sourceKey: "official_website",
    getCapabilities: () => ({
      search: false,
      fetchDocument: true,
      fetchReviews: false,
      officialSource: true,
    }),
    search: async () => failure("not_supported", "no search", false),
    fetchDocument: async (u: string): Promise<ConnectorOutcome<SourceDocument>> => {
      const key = u.replace(/\/+$/, "");
      const page = pages[key];
      if (!page || page === "unavailable") return failure("unavailable", "http_404", false);
      const text = `${page.text}\n(synthetic test page ${randomUUID()})`;
      return {
        status: "ok",
        data: {
          source_key: "official_website",
          canonical_url: key,
          external_id: null,
          title: page.title,
          text,
          published_at: null,
          retrieved_at: new Date().toISOString(),
          content_hash: sha(text),
          fetch_status: "ok",
          http_status: 200,
          storage_permitted: "excerpt",
          metadata: { links: [], external_links: [] },
        },
      };
    },
  };
}

async function workspace(): Promise<{ id: string; user: string }> {
  const { data, error } = await db.auth.admin.createUser({
    email: `discovery-${randomUUID()}@demo.test`,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("no user");
  const id = randomUUID();
  await db
    .from("workspaces")
    .insert({ id, name: "Discovery", created_by: data.user.id })
    .throwOnError();
  await db
    .from("workspace_members")
    .insert({ workspace_id: id, user_id: data.user.id, role: "owner" })
    .throwOnError();
  return { id, user: data.user.id };
}

function makeWorker(
  pages: Parameters<typeof siteConnector>[0],
  provider = new FakeProvider(fakeDiscoveryHandlers),
  workerId = `discovery-${randomUUID().slice(0, 8)}`,
) {
  const limits = limitsLoader(db, 0);
  const gateway = new AIGateway({ provider, models: FAKE_MODELS });
  const handler = discoveryRunHandler({
    db,
    officialSite: siteConnector(pages),
    gateway,
    limits,
    fetchPolicy: defaultPolicy(),
  });
  const worker = new Worker({
    db,
    workerId,
    handlers: { discovery_run: handler },
    leaseSeconds: 2,
    heartbeatSeconds: 1,
    concurrency: 1,
    jobTimeoutSeconds: 120,
    backoff: { baseSeconds: 1, capSeconds: 2, random: () => 0 },
    log: () => undefined,
  });
  return { worker, handler, provider };
}

async function waitFor(jobId: string, worker: Worker) {
  for (let i = 0; i < 120; i++) {
    await worker.tick();
    const { data } = await db.from("job_executions").select("*").eq("id", jobId).single();
    if (data && ["completed", "partial", "failed", "cancelled", "dead_letter"].includes(data.state))
      return data;
    await sleep(250);
  }
  throw new Error(`job ${jobId} did not finish`);
}

const tag = () => randomUUID().slice(0, 8);

async function requestRun(ws: { id: string; user: string }, seedUrls: string[], search = true) {
  return discoveryRepo.requestDiscoveryRun(db, {
    workspaceId: ws.id,
    userId: ws.user,
    idempotencyKey: `int-${randomUUID()}`,
    requestHash: sha(randomUUID()),
    request: {
      title: "Integration",
      prompt: "Find small US marketing analytics SaaS",
      channels: {
        search,
        official_site_rebound: { enabled: false, seed_product_ids: [] },
        seed_urls: seedUrls,
      },
    },
  });
}

run("discovery runs on the local Supabase stack", () => {
  beforeAll(() => {
    db = createServiceClient({ url: url as string, secretKey: secretKey as string });
  });

  it("turns seed URLs into evidence-backed candidates; Hacker News stays disabled", async () => {
    const ws = await workspace();
    const t = tag();
    const metrify = `https://metrify-${t}.example`;
    const affilio = `https://affilio-${t}.example`;
    const { worker } = makeWorker({
      [metrify]: {
        title: `Metrify${t} - Marketing analytics`,
        text: `Metrify${t}\nMarketing analytics dashboards for small SaaS teams.\nPricing: $29 / month`,
      },
      [affilio]: {
        title: `Affilio${t} - Affiliate tracking software`,
        text: `Affilio${t}\nAffiliate tracking software for your affiliate program.`,
      },
    });
    const { runId, jobId } = await requestRun(ws, [`${metrify}/`, affilio]);
    const job = await waitFor(jobId, worker);
    expect(job.state).toBe("completed");

    const runRow = await discoveryRepo.getRun(db, runId);
    expect(runRow).toMatchObject({
      status: "completed",
      candidates_found: 2,
      candidates_retained: 1,
      candidates_rejected: 1,
    });
    expect(runRow?.sources_report).toContainEqual(
      expect.objectContaining({ source_key: "hacker_news", status: "not_enabled" }),
    );
    const { count: hnUsage } = await db
      .from("source_usage_daily")
      .select("source_id, sources!inner(source_key)", { count: "exact", head: true })
      .eq("sources.source_key", "hacker_news");
    expect(hnUsage ?? 0).toBe(0);

    const candidates = await discoveryRepo.listCandidates(db, runId);
    const ok = candidates.find((c) => c.review_status === "pending")!;
    const excluded = candidates.find((c) => c.review_status === "rejected")!;
    expect(excluded).toMatchObject({
      exclusion_status_at_run: "excluded",
      fit_score: null,
      rejection_reason: "permanent_exclusion",
    });
    expect(ok.fit_score).not.toBeNull();
    expect(ok.confidence_score).not.toBeNull();
    const { data: product } = await db
      .from("saas_products")
      .select("record_status, website_url")
      .eq("id", ok.product_id)
      .single();
    expect(product).toEqual({ record_status: "candidate", website_url: metrify });
    const { data: links } = await db
      .from("discovery_candidate_evidence")
      .select("evidence_items(claim_type, reliability_level)")
      .eq("candidate_id", ok.id);
    expect(links).toEqual([
      { evidence_items: { claim_type: "product_exists", reliability_level: 1 } },
    ]);

    // Duplicate delivery of the same envelope: nothing is repeated.
    await worker.process({
      msg_id: 999_999_998,
      read_ct: 2,
      message: { schema_version: "job.v1", kind: "discovery_run", job_execution_id: jobId },
    });
    expect((await discoveryRepo.listCandidates(db, runId)).length).toBe(2);

    // A member accepts the eligible candidate: it becomes visible in Discover.
    await discoveryRepo.reviewCandidate(db, {
      workspaceId: ws.id,
      userId: ws.user,
      candidateId: ok.id,
      decision: "accept",
      reason: null,
      requestId: randomUUID(),
    });
    const { data: accepted } = await db
      .from("saas_products")
      .select("record_status")
      .eq("id", ok.product_id)
      .single();
    expect(accepted?.record_status).toBe("active");
  });

  it("an unreachable site gives a partial run, never an invented candidate", async () => {
    const ws = await workspace();
    const t = tag();
    const good = `https://good-${t}.example`;
    const { worker } = makeWorker({
      [good]: {
        title: `Goodco${t} - Email marketing`,
        text: `Goodco${t}\nEmail marketing for agencies.`,
      },
      [`https://down-${t}.example`]: "unavailable",
    });
    const { runId, jobId } = await requestRun(ws, [good, `https://down-${t}.example`], false);
    const job = await waitFor(jobId, worker);
    expect(job.state).toBe("partial");
    expect((await discoveryRepo.listCandidates(db, runId)).length).toBe(1);
  });

  it("a killed worker's run is recovered after its lease expires, without repeating model calls", async () => {
    const ws = await workspace();
    const t = tag();
    const site = `https://crash-${t}.example`;
    const pages = {
      [site]: { title: `Crashco${t} - Analytics`, text: `Crashco${t}\nAnalytics for shops.` },
    };
    const { runId, jobId } = await requestRun(ws, [site], false);

    // Worker A plans (D1), then dies during extraction (D3).
    const dying = new FakeProvider({
      ...fakeDiscoveryHandlers,
      [D3_AGENT_KEY]: () => {
        throw Object.assign(new Error("process killed"), { killed: true });
      },
    });
    const a = makeWorker(pages, dying, "discovery-worker-a");
    await jobsRepo.workerRead(db, 10, 2);
    const claimed = await jobsRepo.workerClaim(db, jobId, "discovery-worker-a", 2);
    await expect(
      (a.handler as JobHandler)({
        job: claimed as jobsRepo.JobRow,
        signal: new AbortController().signal,
        cancelRequested: () => false,
        deadline: new Date(Date.now() + 60_000),
      }),
    ).rejects.toThrow();
    expect(dying.calls.map((c) => c.agentKey)).toContain(D1_AGENT_KEY);

    await sleep(2500);
    const b = makeWorker(pages, new FakeProvider(fakeDiscoveryHandlers), "discovery-worker-b");
    const job = await waitFor(jobId, b.worker);
    expect(job).toMatchObject({ state: "completed", attempt_count: 2 });
    expect(b.provider.calls.map((c) => c.agentKey)).toEqual([D3_AGENT_KEY]); // D1 reused
    expect((await discoveryRepo.listCandidates(db, runId)).length).toBe(1);
  });

  it("a cancelled job cancels its run", async () => {
    const ws = await workspace();
    const { runId, jobId } = await requestRun(ws, ["https://never.example"], false);
    await jobsRepo.cancelJob(db, { jobId, workspaceId: ws.id, actor: ws.user });
    const { data } = await db.from("discovery_runs").select("status").eq("id", runId).single();
    expect(data?.status).toBe("cancelled");
  });
});
