// Fault-injection harness (Sprint 7, S7.5): the fixtures plus the invariants
// every scenario checks (vitest assertions).
import { expect } from "vitest";
import { TERMINAL, db, job } from "./fixtures";

export * from "./fixtures";

/**
 * Invariants of every scenario: bounded attempts, a terminal reason on a
 * terminal job, at most one row per (agent, step), no duplicated evidence.
 */
export async function expectInvariants(jobId: string, productId?: string) {
  const j = await job(jobId);
  expect(j.attempt_count).toBeLessThanOrEqual(j.max_attempts);
  if (TERMINAL.includes(j.state)) expect(j.terminal_reason).not.toBeNull();
  const { data: steps } = await db()
    .from("agent_step_runs")
    .select("agent_key, step_key, state")
    .eq("job_execution_id", jobId);
  const keys = (steps ?? []).map((s) => `${s.agent_key}/${s.step_key}`);
  expect(new Set(keys).size).toBe(keys.length);
  if (productId) {
    const { data: evidence } = await db()
      .from("evidence_items")
      .select("claim_type, claim_text, source_snapshot_id")
      .eq("product_id", productId);
    const sig = (evidence ?? []).map(
      (e) => `${e.claim_type}|${e.claim_text}|${e.source_snapshot_id}`,
    );
    expect(new Set(sig).size).toBe(sig.length);
  }
  return j;
}
