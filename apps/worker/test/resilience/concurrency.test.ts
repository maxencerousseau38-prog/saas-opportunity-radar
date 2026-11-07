// S7.5a — concurrent requests (F10–F11): identical requests create one job;
// concurrency, daily quota and hourly rate limit hold exactly under bursts
// (the S7.2 advisory lock and atomic counters), with the right refusal.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DbError, jobsRepo } from "@sor/database";
import { available, db, hash, withLimits, workspace } from "./harness";

const suite = available ? describe : describe.skip;
const CSV = "name,website_url\nBurst Co,https://burst.test/";

function importRequest(ws: { id: string; user: string }, key: string, requestHash = hash()) {
  return jobsRepo.requestJob(db(), {
    kind: "catalog_import",
    workspaceId: ws.id,
    requestedBy: ws.user,
    idempotencyKey: key,
    requestHash,
    payload: { csv: CSV, row_count: 1 } as never,
  });
}

async function burst(n: number, make: (i: number) => Promise<unknown>) {
  const results = await Promise.allSettled(Array.from({ length: n }, (_, i) => make(i)));
  const accepted = results.filter((r) => r.status === "fulfilled").length;
  const refusals = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) =>
      r.reason instanceof DbError ? `${r.reason.code}:${r.reason.limit ?? ""}` : "other",
    );
  return { accepted, refusals };
}

async function jobCount(workspaceId: string) {
  const { count } = await db()
    .from("job_executions")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  return count;
}

suite("concurrent requests", () => {
  it("F10: 20 identical concurrent requests create exactly one job; a changed payload is a conflict", async () => {
    const ws = await workspace();
    const key = `same-${randomUUID()}`;
    const body = hash();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => importRequest(ws, key, body)),
    );
    expect(new Set(results.map((r) => r.jobId)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await jobCount(ws.id)).toBe(1);
    const conflict = await importRequest(ws, key, hash()).catch((e: unknown) => e);
    expect((conflict as DbError).code).toBe("IDEMPOTENCY_CONFLICT");
  }, 30_000);

  it("F11a: a burst of 10 different requests admits exactly the concurrency limit (3)", async () => {
    const ws = await workspace();
    const r = await burst(10, (i) => importRequest(ws, `conc-${i}-${randomUUID()}`));
    expect(r.accepted).toBe(3);
    expect(r.refusals).toEqual(Array(7).fill("LIMIT_EXCEEDED:concurrent_jobs"));
    expect(await jobCount(ws.id)).toBe(3);
  }, 30_000);

  it("F11b: the daily quota holds exactly under a burst", async () => {
    const restore = await withLimits({
      max_concurrent_jobs_per_workspace: "100",
      workspace_max_jobs_per_day: "5",
    });
    try {
      const ws = await workspace();
      const r = await burst(10, (i) => importRequest(ws, `day-${i}-${randomUUID()}`));
      expect(r.accepted).toBe(5);
      expect(r.refusals).toEqual(Array(5).fill("LIMIT_EXCEEDED:daily_jobs"));
      expect(await jobCount(ws.id)).toBe(5);
    } finally {
      await restore();
    }
  }, 30_000);

  it("F11c: the hourly per-user rate limit holds exactly under a burst of 40", async () => {
    const restore = await withLimits({ max_concurrent_jobs_per_workspace: "100" });
    try {
      const ws = await workspace();
      const r = await burst(40, (i) => importRequest(ws, `rate-${i}-${randomUUID()}`));
      expect(r.accepted).toBe(30);
      expect(r.refusals).toEqual(Array(10).fill("RATE_LIMITED:job_posts"));
      expect(await jobCount(ws.id)).toBe(30);
    } finally {
      await restore();
    }
  }, 30_000);
});
