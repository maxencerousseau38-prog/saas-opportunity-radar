import { describe, expect, it } from "vitest";
import type { DbClient } from "@sor/database";
import { JobError } from "@sor/domain";
import { Worker, type HandlerOutcome, type JobHandler } from "../runtime";

/** In-memory stand-in for the worker RPCs (behaviour is pgTAP-tested on the real stack). */
function fakeDb(jobs: Array<Record<string, unknown>>) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  let messages: Array<{ msg_id: number; read_ct: number; message: unknown }> = [];
  const db = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      const job = jobs.find((j) => j.id === args.p_job_id);
      switch (fn) {
        case "sor_worker_read": {
          const out = messages;
          messages = [];
          return { data: out, error: null };
        }
        case "sor_worker_claim":
          if (!job || !["queued", "retrying"].includes(job.state as string))
            return { data: [], error: null };
          job.state = "running";
          job.attempt_count = (job.attempt_count as number) + 1;
          return { data: [{ ...job }], error: null };
        case "sor_worker_finish":
          if (!job || job.state !== "running")
            return { data: null, error: { code: "55000", message: "LEASE_LOST" } };
          job.state = args.p_state;
          job.terminal_reason = args.p_terminal_reason;
          job.result = args.p_result;
          return { data: null, error: null };
        case "sor_worker_retry":
          if (job) job.state = "retrying";
          return { data: null, error: null };
        case "sor_worker_heartbeat":
          return { data: false, error: null };
        default:
          return { data: null, error: null };
      }
    },
  } as unknown as DbClient;
  return {
    db,
    calls,
    send: (message: unknown, id = messages.length + 1) =>
      messages.push({ msg_id: id, read_ct: 1, message }),
  };
}

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const envelope = { schema_version: "job.v1", kind: "product_enrichment", job_execution_id: JOB_ID };
const newJob = () => ({
  id: JOB_ID,
  job_kind: "product_enrichment",
  state: "queued",
  attempt_count: 0,
  max_attempts: 3,
  workspace_id: null,
  cancel_requested_at: null,
  payload: {},
});

function worker(db: DbClient, handler: JobHandler) {
  return new Worker({
    db,
    workerId: "w1",
    handlers: { product_enrichment: handler },
    leaseSeconds: 30,
    heartbeatSeconds: 10,
    concurrency: 2,
    jobTimeoutSeconds: 60,
    backoff: { baseSeconds: 1, capSeconds: 10, random: () => 0 },
    log: () => undefined,
  });
}

const ok: HandlerOutcome = {
  state: "completed",
  terminalReason: "completed",
  result: { evidence: 2 },
};

describe("worker runtime", () => {
  it("archives poison messages without claiming anything", async () => {
    const f = fakeDb([newJob()]);
    f.send({ hello: "world" });
    await worker(f.db, async () => ok).tick();
    expect(f.calls.map((c) => c.fn)).toEqual(["sor_worker_read", "sor_worker_finish_poison"]);
  });

  it("claims, runs and finishes a job with its result", async () => {
    const jobs = [newJob()];
    const f = fakeDb(jobs);
    f.send(envelope);
    await worker(f.db, async () => ok).tick();
    expect(jobs[0]).toMatchObject({
      state: "completed",
      terminal_reason: "completed",
      result: { evidence: 2 },
    });
  });

  it("does nothing on a duplicate delivery of a finished job", async () => {
    const jobs = [{ ...newJob(), state: "completed" }];
    const f = fakeDb(jobs);
    let ran = false;
    f.send(envelope);
    await worker(f.db, async () => {
      ran = true;
      return ok;
    }).tick();
    expect(ran).toBe(false);
  });

  it("retries transient failures with backoff", async () => {
    const jobs = [newJob()];
    const f = fakeDb(jobs);
    f.send(envelope);
    await worker(f.db, async () => {
      throw Object.assign(new Error("upstream"), { status: 503 });
    }).tick();
    expect(jobs[0]?.state).toBe("retrying");
    expect(f.calls.find((c) => c.fn === "sor_worker_retry")?.args).toMatchObject({
      p_delay_seconds: 1,
      p_error_code: "HTTP_503",
    });
  });

  it("fails permanent errors without retry, and dead-letters exhausted transient ones", async () => {
    const jobs = [newJob()];
    const f = fakeDb(jobs);
    f.send(envelope);
    await worker(f.db, async () => {
      throw new JobError("permanent", "EXCLUDED_SUBJECT", "excluded");
    }).tick();
    expect(jobs[0]).toMatchObject({ state: "failed", terminal_reason: "failed" });

    const last = [{ ...newJob(), attempt_count: 2 }];
    const g = fakeDb(last);
    g.send(envelope);
    await worker(g.db, async () => {
      throw new Error("network");
    }).tick();
    expect(last[0]).toMatchObject({ state: "dead_letter", terminal_reason: "dead_letter" });
  });

  it("ends a job as partial when a budget is exhausted", async () => {
    const jobs = [newJob()];
    const f = fakeDb(jobs);
    f.send(envelope);
    await worker(f.db, async () => {
      throw new JobError("budget", "BUDGET_EXHAUSTED", "cost");
    }).tick();
    expect(jobs[0]).toMatchObject({ state: "partial", terminal_reason: "budget_exhausted" });
  });

  it("fails a job whose kind has no handler", async () => {
    const jobs = [{ ...newJob(), job_kind: "catalog_import" }];
    const f = fakeDb(jobs);
    f.send({ ...envelope, kind: "catalog_import" });
    await worker(f.db, async () => ok).tick();
    expect(f.calls.find((c) => c.fn === "sor_worker_finish")?.args).toMatchObject({
      p_state: "failed",
      p_error_code: "NO_HANDLER",
    });
  });
});
