// Queue consumer (Implementation Blueprint §11 "Worker loop"): read →
// validate envelope → claim with a lease → heartbeat (extends lease and
// visibility, surfaces cancellation) → handler → finish / retry / dead letter.
import { JobEnvelopeSchema } from "@sor/contracts";
import { isLeaseLost, jobsRepo, type DbClient } from "@sor/database";
import { JobError, backoffSeconds, classifyError } from "@sor/domain";

export type JobRow = jobsRepo.JobRow;

export interface HandlerContext {
  job: JobRow;
  /** Aborted when the lease is lost or the worker stops. */
  signal: AbortSignal;
  /** True once a cancellation was requested (seen by the heartbeat). */
  cancelRequested(): boolean;
  /** Wall-clock deadline of the job. */
  deadline: Date;
}

export interface HandlerOutcome {
  state: "completed" | "partial" | "cancelled";
  terminalReason: "completed" | "partial" | "cancelled" | "budget_exhausted";
  result: Record<string, unknown>;
  usage?: Record<string, unknown>;
}

export type JobHandler = (ctx: HandlerContext) => Promise<HandlerOutcome>;

export type Log = (entry: Record<string, unknown>) => void;

export interface WorkerOptions {
  db: DbClient;
  workerId: string;
  handlers: Partial<Record<jobsRepo.JobKind, JobHandler>>;
  leaseSeconds: number;
  heartbeatSeconds: number;
  concurrency: number;
  jobTimeoutSeconds: number;
  backoff?: { baseSeconds: number; capSeconds: number; random?: () => number };
  log: Log;
}

export class Worker {
  private stopped = false;
  private readonly controller = new AbortController();

  constructor(private readonly options: WorkerOptions) {}

  stop(): void {
    this.stopped = true;
    this.controller.abort();
  }

  /** One polling cycle; returns the number of messages read. */
  async tick(): Promise<number> {
    const { db, concurrency, leaseSeconds } = this.options;
    const messages = await jobsRepo.workerRead(db, concurrency, leaseSeconds);
    await Promise.all(messages.map((m) => this.process(m)));
    return messages.length;
  }

  async run(pollIntervalMs: number, orphanSweepSeconds = 300): Promise<void> {
    let lastSweep = 0;
    while (!this.stopped) {
      try {
        if (Date.now() - lastSweep > orphanSweepSeconds * 1000) {
          lastSweep = Date.now();
          const requeued = await jobsRepo.workerRequeueOrphans(this.options.db, orphanSweepSeconds);
          if (requeued > 0)
            this.options.log({ level: "warn", msg: "orphan jobs requeued", count: requeued });
        }
        const read = await this.tick();
        if (read === 0) await sleep(pollIntervalMs, this.controller.signal);
      } catch (err) {
        this.options.log({
          level: "error",
          msg: "worker cycle failed",
          error: classifyError(err).code,
        });
        await sleep(pollIntervalMs, this.controller.signal);
      }
    }
  }

  async process(message: jobsRepo.QueueMessage): Promise<void> {
    const { db, workerId, leaseSeconds, heartbeatSeconds, log } = this.options;
    const envelope = JobEnvelopeSchema.safeParse(message.message);
    if (!envelope.success) {
      await jobsRepo.workerFinishPoison(db, message.msg_id, "envelope_schema_invalid");
      log({ level: "warn", msg: "poison message archived", message_id: message.msg_id });
      return;
    }
    const job = await jobsRepo.workerClaim(
      db,
      envelope.data.job_execution_id,
      workerId,
      leaseSeconds,
    );
    if (!job) return; // finished, leased elsewhere, or not yet due
    const base = {
      job_execution_id: job.id,
      job_kind: job.job_kind,
      attempt: job.attempt_count,
      workspace_id: job.workspace_id,
    };
    if (job.job_kind !== envelope.data.kind) {
      await this.finish(
        job,
        "failed",
        "failed",
        "ENVELOPE_KIND_MISMATCH",
        "queue message kind differs from the job",
      );
      return;
    }
    const handler = this.options.handlers[job.job_kind];
    if (!handler) {
      await this.finish(job, "failed", "failed", "NO_HANDLER", `no handler for ${job.job_kind}`);
      return;
    }

    const lease = new AbortController();
    const signal = AbortSignal.any([lease.signal, this.controller.signal]);
    let cancelRequested = Boolean(job.cancel_requested_at);
    let leaseLost = false;
    const beat = setInterval(() => {
      jobsRepo
        .workerHeartbeat(db, { jobId: job.id, workerId, leaseSeconds, messageId: message.msg_id })
        .then((cancel) => {
          cancelRequested = cancelRequested || cancel;
        })
        .catch((err: unknown) => {
          if (isLeaseLost(err)) {
            leaseLost = true;
            lease.abort();
          }
        });
    }, heartbeatSeconds * 1000);

    log({ level: "info", msg: "job started", ...base });
    try {
      const outcome = await handler({
        job,
        signal,
        cancelRequested: () => cancelRequested,
        deadline: new Date(Date.now() + this.options.jobTimeoutSeconds * 1000),
      });
      clearInterval(beat);
      if (leaseLost) return;
      await jobsRepo.workerFinish(db, {
        jobId: job.id,
        workerId,
        state: outcome.state,
        terminalReason: outcome.terminalReason,
        result: outcome.result as never,
        ...(outcome.usage ? { usage: outcome.usage as never } : {}),
      });
      log({
        level: "info",
        msg: "job finished",
        ...base,
        state: outcome.state,
        terminal_reason: outcome.terminalReason,
      });
    } catch (err) {
      clearInterval(beat);
      if (leaseLost || isLeaseLost(err)) {
        log({ level: "warn", msg: "lease lost; another worker owns the job", ...base });
        return;
      }
      const c = classifyError(err);
      if (c.class === "budget") {
        await this.finish(job, "partial", "budget_exhausted", c.code, c.message);
      } else if (c.class === "cancelled") {
        await this.finish(job, "cancelled", "cancelled", c.code, c.message);
      } else if (c.retryable && job.attempt_count < job.max_attempts) {
        const delay = backoffSeconds(job.attempt_count, this.options.backoff ?? {});
        await jobsRepo.workerRetry(db, {
          jobId: job.id,
          workerId,
          delaySeconds: delay,
          errorCode: c.code,
          errorMessage: c.message,
        });
        log({
          level: "warn",
          msg: "job will be retried",
          ...base,
          error_code: c.code,
          delay_seconds: delay,
        });
      } else {
        await this.finish(
          job,
          c.retryable ? "dead_letter" : "failed",
          c.retryable ? "dead_letter" : "failed",
          c.code,
          c.message,
        );
        log({ level: "error", msg: "job failed", ...base, error_code: c.code });
      }
    }
  }

  private async finish(
    job: JobRow,
    state: jobsRepo.JobState,
    reason: jobsRepo.TerminalReason,
    code: string | null,
    message: string | null,
  ): Promise<void> {
    await jobsRepo.workerFinish(this.options.db, {
      jobId: job.id,
      workerId: this.options.workerId,
      state,
      terminalReason: reason,
      errorCode: code,
      errorMessage: message,
    });
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

export { JobError };
