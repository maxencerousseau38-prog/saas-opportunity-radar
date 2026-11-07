// Persisted agent steps (Implementation Blueprint §5.5): one row per
// (job, agent, step); a completed step with the same input hash is reused.
import { createHash } from "node:crypto";
import { jobsRepo, type DbClient, type Json } from "@sor/database";
import type { StepMeta, StepRecord, StepRunResult } from "@sor/discovery-engine";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/**
 * `signal` is the job's signal: an output produced while the job is being
 * aborted (shutdown, lost lease, cancellation) is never stored as a
 * completed step, so the next attempt runs that step again instead of
 * reusing a result truncated by the abort.
 */
export function stepRunner(
  db: DbClient,
  job: { id: string; attempt_count: number; lease_owner: string | null },
  signal?: AbortSignal,
) {
  return async function step<T>(
    meta: StepMeta,
    run: (stepId: string) => Promise<StepRunResult<T>>,
  ): Promise<StepRecord<T>> {
    const existing = await jobsRepo.getStep(db, job.id, meta.agentKey, meta.stepKey);
    if (
      existing &&
      existing.state === "completed" &&
      existing.input_hash === meta.inputHash &&
      existing.output_json !== null
    ) {
      return { output: existing.output_json as T, stepId: existing.id, reused: true };
    }
    // Atomic (S7.5b): only the lease owner of this attempt can start the
    // step, and a row owned by a newer attempt is never reset. A worker that
    // froze past its lease stops here with LEASE_LOST (scenario F6).
    const stepId = await jobsRepo.startStep(db, {
      jobId: job.id,
      workerId: job.lease_owner ?? "",
      attempt: job.attempt_count,
      agentKey: meta.agentKey,
      stepKey: meta.stepKey,
      contractVersion: meta.contractVersion,
      promptVersion: meta.promptVersion,
      inputHash: meta.inputHash,
    });
    try {
      const res = await run(stepId);
      if (signal?.aborted) {
        throw Object.assign(new Error("step interrupted by the job abort"), {
          code: "STEP_ABORTED",
        });
      }
      await jobsRepo.completeStep(db, stepId, {
        attempt: job.attempt_count,
        output: res.output as unknown as NonNullable<Json>,
        outputHash: hash(res.output),
        warnings: res.warnings ?? [],
        provider: res.model?.provider ?? null,
        model: res.model?.name ?? null,
        inputTokens: res.model?.inputTokens ?? null,
        outputTokens: res.model?.outputTokens ?? null,
        costUsd: res.model?.costUsd ?? null,
        latencyMs: res.model?.latencyMs ?? null,
      });
      return { output: res.output, stepId, reused: false };
    } catch (err) {
      const e = err as { code?: unknown; message?: unknown };
      await jobsRepo.failStep(
        db,
        stepId,
        job.attempt_count,
        typeof e.code === "string" ? e.code : "STEP_FAILED",
        typeof e.message === "string" ? e.message : "step failed",
      );
      throw err;
    }
  };
}
