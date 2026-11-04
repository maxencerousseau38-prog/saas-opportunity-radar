// Persisted agent steps (Implementation Blueprint §5.5): one row per
// (job, agent, step); a completed step with the same input hash is reused.
import { createHash } from "node:crypto";
import { jobsRepo, type DbClient, type Json } from "@sor/database";
import type { StepMeta, StepRecord, StepRunResult } from "@sor/discovery-engine";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function stepRunner(db: DbClient, job: { id: string; attempt_count: number }) {
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
    const stepId = await jobsRepo.startStep(db, {
      jobId: job.id,
      agentKey: meta.agentKey,
      stepKey: meta.stepKey,
      contractVersion: meta.contractVersion,
      promptVersion: meta.promptVersion,
      inputHash: meta.inputHash,
      attempt: job.attempt_count,
    });
    try {
      const res = await run(stepId);
      await jobsRepo.completeStep(db, stepId, {
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
        typeof e.code === "string" ? e.code : "STEP_FAILED",
        typeof e.message === "string" ? e.message : "step failed",
      );
      throw err;
    }
  };
}
