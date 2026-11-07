// Step ownership guards (S7.5a, scenario F6; atomic start S7.5b): a worker
// that froze past its lease cannot start, complete or fail a step owned by a
// newer attempt; the refusal is a lost lease, which the worker handles
// without retry or failure. The start itself is checked by pgTAP 021.
import { describe, expect, it } from "vitest";
import type { DbClient } from "../clients";
import { isLeaseLost } from "../errors";
import { completeStep, failStep, startStep } from "../repositories/jobs";

/** Minimal PostgREST builder: records filters, answers with `rows`. */
function fakeDb(rows: unknown) {
  const filters: Array<[string, unknown]> = [];
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  Object.assign(builder, {
    select: chain,
    update: chain,
    eq: (col: string, val: unknown) => {
      filters.push([col, val]);
      return builder;
    },
    maybeSingle: async () => ({ data: rows, error: null }),
    then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
  });
  const db = { from: () => builder } as unknown as DbClient;
  return { db, filters };
}

describe("step ownership guards", () => {
  it("starts a step through the atomic RPC with the lease owner and attempt", async () => {
    const calls: Array<[string, unknown]> = [];
    const db = {
      rpc: async (fn: string, args: unknown) => {
        calls.push([fn, args]);
        return { data: "step-1", error: null };
      },
    } as unknown as DbClient;
    const id = await startStep(db, {
      jobId: "job",
      workerId: "w-a",
      attempt: 2,
      agentKey: "agent",
      stepKey: "step",
      contractVersion: "c1",
      promptVersion: null,
      inputHash: "h",
    });
    expect(id).toBe("step-1");
    expect(calls).toEqual([
      [
        "sor_step_start",
        {
          p_job_id: "job",
          p_worker_id: "w-a",
          p_attempt: 2,
          p_agent_key: "agent",
          p_step_key: "step",
          p_contract_version: "c1",
          p_prompt_version: null,
          p_input_hash: "h",
        },
      ],
    ]);
  });

  it("maps a refused start (newer attempt) to a lost lease", async () => {
    const db = {
      rpc: async () => ({
        data: null,
        error: { code: "55000", message: "LEASE_LOST: job taken over by a newer attempt" },
      }),
    } as unknown as DbClient;
    const err = await startStep(db, {
      jobId: "job",
      workerId: "w-a",
      attempt: 1,
      agentKey: "agent",
      stepKey: "step",
      contractVersion: "c1",
      promptVersion: null,
      inputHash: "h",
    }).catch((e: unknown) => e);
    expect(isLeaseLost(err)).toBe(true);
  });

  it("completes a step only while it runs for this attempt", async () => {
    const ok = fakeDb([{ id: "s" }]);
    await completeStep(ok.db, "s", { attempt: 2, output: {}, outputHash: "h", warnings: [] });
    expect(ok.filters).toEqual([
      ["id", "s"],
      ["attempt", 2],
      ["state", "running"],
    ]);
    const taken = fakeDb([]);
    const err = await completeStep(taken.db, "s", {
      attempt: 1,
      output: {},
      outputHash: "h",
      warnings: [],
    }).catch((e: unknown) => e);
    expect(isLeaseLost(err)).toBe(true);
  });

  it("never marks another attempt's step as failed", async () => {
    const f = fakeDb(null);
    await failStep(f.db, "s", 1, "X", "y");
    expect(f.filters).toEqual([
      ["id", "s"],
      ["attempt", 1],
      ["state", "running"],
    ]);
  });
});
