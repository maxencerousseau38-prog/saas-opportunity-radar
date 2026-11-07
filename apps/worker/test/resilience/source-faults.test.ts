// S7.5b — source faults (F9): slow sites, HTTP 500 and cut connections on
// the official site during enrichment and discovery. A transient failure is
// retried while attempts remain; on the last attempt it is recorded with its
// reason and the job ends `partial` with what was really fetched: never a
// substituted page or candidate, never a stuck job. Loopback fixture site
// only (no network).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { discoveryRepo } from "@sor/database";
import { D5_AGENT_KEY } from "@sor/discovery-engine";
import {
  available,
  cancelOpenJobs,
  db,
  expectInvariants,
  makeWorker,
  product,
  requestDiscovery,
  requestEnrichment,
  ScriptedProvider,
  startSite,
  waitFor,
  withLimits,
  workspace,
  type Site,
  type SiteFault,
} from "./harness";

const suite = available ? describe : describe.skip;

async function hostOf(productId: string): Promise<string> {
  const { data } = await db()
    .from("saas_products")
    .select("website_url")
    .eq("id", productId)
    .single();
  return new URL(data!.website_url as string).hostname;
}

async function evidenceCount(productId: string): Promise<number> {
  const { count } = await db()
    .from("evidence_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);
  return count ?? 0;
}

interface Summary {
  pages_failed?: Array<{ url: string; status: string; reason: string }>;
  warnings?: string[];
}

suite("source faults", () => {
  let site: Site;
  let restore: () => Promise<void>;
  beforeAll(async () => {
    site = await startSite();
    // Three attempts keep every scenario short; the rule is the same at five.
    restore = await withLimits({ job_max_attempts: "3" });
  });
  afterAll(async () => {
    await cancelOpenJobs();
    await restore();
    await site.close();
  });

  const cases: Array<{ name: string; path: string; fault: SiteFault; reason: string }> = [
    {
      name: "HTTP 500 on the pricing page",
      path: "/pricing",
      fault: "http500",
      reason: "http_500",
    },
    { name: "a slow pricing page", path: "/pricing", fault: { slowMs: 3000 }, reason: "timeout" },
  ];
  for (const c of cases) {
    it(`F9 enrichment: ${c.name} → partial with the reason; the home page result is kept`, async () => {
      const ws = await workspace();
      const productId = await product(site.port);
      const host = await hostOf(productId);
      site.fault(host, c.path, c.fault);
      const provider = new ScriptedProvider({});
      const { worker } = makeWorker({ provider, port: site.port, fetchTimeoutMs: 800 });
      const { jobId } = await requestEnrichment(ws, productId);
      const j = await waitFor(jobId, worker);
      expect(j).toMatchObject({ state: "partial", terminal_reason: "partial", attempt_count: 3 });
      const summary = j.result as Summary;
      expect(summary.pages_failed).toEqual([
        {
          url: expect.stringContaining(`${host}:${site.port}${c.path}`),
          status: "error",
          reason: c.reason,
        },
      ]);
      // The home page was fetched once and its extraction reused by every attempt.
      expect(site.hits.get(`${host} /`)).toBe(1);
      expect(provider.count(D5_AGENT_KEY)).toBe(1);
      // Evidence only from what was really fetched: no pricing plan invented.
      expect(await evidenceCount(productId)).toBeGreaterThan(0);
      const { count: plans } = await db()
        .from("pricing_plans")
        .select("id", { count: "exact", head: true })
        .eq("product_id", productId);
      expect(plans ?? 0).toBe(0);
      await expectInvariants(jobId, productId);
    }, 60_000);
  }

  it("F9 enrichment: the connection to the home page is cut → partial, nothing extracted", async () => {
    const ws = await workspace();
    const productId = await product(site.port);
    const host = await hostOf(productId);
    site.fault(host, "/", "reset");
    const provider = new ScriptedProvider({});
    const { worker } = makeWorker({ provider, port: site.port, fetchTimeoutMs: 800 });
    const { jobId } = await requestEnrichment(ws, productId);
    const j = await waitFor(jobId, worker);
    expect(j).toMatchObject({ state: "partial", terminal_reason: "partial", attempt_count: 3 });
    const summary = j.result as Summary;
    expect(summary.warnings).toContain("official_site_unreachable");
    expect(summary.pages_failed).toEqual([
      {
        url: expect.stringContaining(`${host}:${site.port}`),
        status: "error",
        reason: "network_error",
      },
    ]);
    expect(provider.calls).toHaveLength(0); // no page, so no model call
    expect(await evidenceCount(productId)).toBe(0);
    await expectInvariants(jobId, productId);
  }, 60_000);

  it("F9 discovery: failing seed sites are reported, only the healthy one becomes a candidate", async () => {
    const ws = await workspace();
    const t = randomUUID().slice(0, 8);
    const healthy = `res-ok-${t}.test`;
    const down = `res-down-${t}.test`;
    const cut = `res-cut-${t}.test`;
    site.fault(down, "/", "http500");
    site.fault(cut, "/", "reset");
    const provider = new ScriptedProvider({});
    const { worker } = makeWorker({ provider, port: site.port, fetchTimeoutMs: 800 });
    const seeds = [healthy, down, cut].map((h) => `http://${h}:${site.port}/`);
    const { runId, jobId } = await requestDiscovery(ws, seeds);
    const j = await waitFor(jobId, worker);
    expect(j).toMatchObject({ state: "partial", terminal_reason: "partial", attempt_count: 3 });
    const warnings = (j.result as Summary).warnings ?? [];
    expect(warnings).toContain(`lead_unreachable:${down}:error:http_500`);
    expect(warnings).toContain(`lead_unreachable:${cut}:error:network_error`);
    const run = await discoveryRepo.getRun(db(), runId);
    expect(run).toMatchObject({ status: "partial", candidates_found: 1 });
    const candidates = await discoveryRepo.listCandidates(db(), runId);
    expect(candidates).toHaveLength(1);
    await expectInvariants(jobId);
  }, 90_000);
});
