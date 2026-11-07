// S7.5a — AI provider faults (F1–F3): transient failures are retried with
// completed steps reused; a lasting outage ends in dead letter without any
// invented output and opens the monitoring alerts; a slow provider times out
// and is retried. Simulated provider only (no network, no cost).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { D5_AGENT_KEY, D6_AGENT_KEY } from "@sor/discovery-engine";
import { monitorOnce } from "../../src/monitor";
import {
  available,
  cancelOpenJobs,
  db,
  expectInvariants,
  makeWorker,
  product,
  requestEnrichment,
  ScriptedProvider,
  startSite,
  waitFor,
  withLimits,
  workspace,
  type Site,
} from "./harness";

const suite = available ? describe : describe.skip;

suite("AI provider faults", () => {
  let site: Site;
  beforeAll(async () => {
    site = await startSite();
  });
  afterAll(async () => {
    await cancelOpenJobs();
    await site.close();
  });

  it("F1: a transient outage is retried; the completed extraction step is reused", async () => {
    const ws = await workspace();
    const productId = await product(site.port);
    const provider = new ScriptedProvider({ [D6_AGENT_KEY]: ["transient", "transient"] });
    const { worker } = makeWorker({ provider, port: site.port });
    const { jobId } = await requestEnrichment(ws, productId);
    const j = await waitFor(jobId, worker);
    expect(j).toMatchObject({ state: "completed", attempt_count: 3 });
    expect(provider.count(D5_AGENT_KEY)).toBe(1); // reused by attempts 2 and 3
    expect(provider.count(D6_AGENT_KEY)).toBe(3);
    const { data: usage } = await db()
      .from("provider_usage")
      .select("outcome")
      .eq("job_execution_id", jobId);
    expect(usage?.filter((u) => u.outcome === "provider_error")).toHaveLength(2);
    await expectInvariants(jobId, productId);
  }, 60_000);

  it("F2: a lasting outage ends in dead letter, invents nothing and opens the alerts", async () => {
    const restore = await withLimits({ ops_alert_min_provider_calls: "3" });
    try {
      const ws = await workspace();
      const productId = await product(site.port);
      const provider = new ScriptedProvider({}, { [D6_AGENT_KEY]: "transient" });
      const { worker } = makeWorker({ provider, port: site.port });
      const { jobId } = await requestEnrichment(ws, productId);
      const j = await waitFor(jobId, worker);
      expect(j).toMatchObject({ state: "dead_letter", terminal_reason: "dead_letter" });
      expect(j.attempt_count).toBe(j.max_attempts);
      expect(provider.count(D6_AGENT_KEY)).toBe(j.max_attempts);
      // Nothing applied: no verification step completed, no verified evidence.
      const { data: steps } = await db()
        .from("agent_step_runs")
        .select("agent_key, state")
        .eq("job_execution_id", jobId);
      expect(steps?.some((s) => s.agent_key === D6_AGENT_KEY && s.state === "completed")).toBe(
        false,
      );
      expect(steps?.some((s) => s.agent_key === "enrichment_apply")).toBe(false);
      const { count } = await db()
        .from("evidence_items")
        .select("id", { count: "exact", head: true })
        .eq("product_id", productId)
        .eq("verification_status", "verified");
      expect(count).toBe(0);
      await expectInvariants(jobId, productId);

      // Monitoring (S7.3) reports the outage.
      const result = await monitorOnce(db(), () => undefined);
      const keys = result.alerts.map((a) => a.key);
      expect(keys).toContain("dead_letters");
      expect(keys).toContain("provider_error_rate:fake");
      expect(result.alerts.find((a) => a.key === "dead_letters")?.details.job_ids).toContain(jobId);
    } finally {
      await restore();
    }
  }, 60_000);

  it("F3: a provider slower than its timeout is cut off, recorded and retried", async () => {
    const ws = await workspace();
    const productId = await product(site.port);
    const provider = new ScriptedProvider({ [D6_AGENT_KEY]: [{ slowMs: 3000 }] });
    const { worker } = makeWorker({ provider, port: site.port, modelTimeoutMs: 400 });
    const { jobId } = await requestEnrichment(ws, productId);
    const started = Date.now();
    const j = await waitFor(jobId, worker);
    expect(j).toMatchObject({ state: "completed", attempt_count: 2 });
    // The slow call did not hold the job for its full 3 s.
    expect(Date.now() - started).toBeLessThan(10_000);
    const { data: usage } = await db()
      .from("provider_usage")
      .select("outcome")
      .eq("job_execution_id", jobId);
    expect(usage?.map((u) => u.outcome)).toContain("timeout");
    await expectInvariants(jobId, productId);
  }, 60_000);
});
