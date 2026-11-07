// Step ownership guards (S7.5a, scenario F6): a worker that froze past its
// lease cannot start, complete or fail a step owned by a newer attempt; the
// refusal is a lost lease, which the worker handles without retry or failure.
import { describe, expect, it } from "vitest";
import type { DbClient } from "../clients";
import { isLeaseLost } from "../errors";
import { assertAttemptCurrent, completeStep, failStep } from "../repositories/jobs";

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
  it("lets the current attempt of a running job go on", async () => {
    const { db } = fakeDb({ state: "running", attempt_count: 2 });
    await expect(assertAttemptCurrent(db, "job", 2)).resolves.toBeUndefined();
  });

  it("stops a stale attempt (newer attempt or finished job) as a lost lease", async () => {
    for (const row of [
      { state: "running", attempt_count: 3 },
      { state: "completed", attempt_count: 2 },
      null,
    ]) {
      const err = await assertAttemptCurrent(fakeDb(row).db, "job", 2).catch((e: unknown) => e);
      expect(isLeaseLost(err)).toBe(true);
    }
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
