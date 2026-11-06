// pain_point_run handler: implements the Pain Point Engine's ports with the
// database and the AI gateway (Implementation Blueprint §7). The run's status
// follows its job (M6 trigger); this handler writes results and counters.
import { jobsRepo, painRepo, type DbClient, type Json } from "@sor/database";
import type { AIGateway } from "@sor/ai-gateway";
import type { ExtractedProblem } from "@sor/contracts";
import { JobError } from "@sor/domain";
import {
  P3_AGENT_KEY,
  runPainPointRun,
  type PainPorts,
  type StoredProblem,
} from "@sor/pain-point-engine";
import type { HandlerContext, HandlerOutcome } from "../runtime";
import { stepRunner } from "./steps";

export interface PainDeps {
  db: DbClient;
  gateway: AIGateway;
  limits: () => Promise<Record<string, number>>;
}

type JsonValue = NonNullable<Json>;

function toStored(row: painRepo.FeedbackProblemRow): StoredProblem {
  return {
    id: row.id,
    feedbackId: row.feedback_id,
    productId: row.product_id,
    is_primary: row.is_primary,
    problem_statement: row.problem_statement,
    problem_category: row.problem_category,
    feature_concerned: row.feature_concerned,
    user_profile: row.user_profile,
    severity: row.severity,
    declared_frequency: row.declared_frequency,
    operational_consequence: row.operational_consequence,
    workaround: row.workaround,
    desired_solution: row.desired_solution,
    switching_intent: row.switching_intent,
    vendor_response: row.vendor_response,
    resolution_status: row.resolution_status,
    confidence: Number(row.confidence),
  };
}

/** Shared AI budget of one job (a nested pain run spends the analysis budget). */
export interface JobBudget {
  remaining(): number;
  spend(usd: number): void;
  spent(): number;
}
export function jobBudget(maxUsd: number): JobBudget {
  let spent = 0;
  return {
    remaining: () => Math.max(0, maxUsd - spent),
    spend: (usd) => {
      spent += usd;
    },
    spent: () => spent,
  };
}

type LoadedRun = NonNullable<Awaited<ReturnType<typeof painRepo.loadRun>>>;

/** The Pain Point Engine's ports for one run, inside the given job. */
export function painPorts(
  deps: Pick<PainDeps, "db" | "gateway">,
  ctx: HandlerContext,
  loaded: LoadedRun,
  budget: JobBudget,
): PainPorts {
  const { db } = deps;
  const runId = loaded.run.id;
  const params = loaded.run.parameters as { max_feedback_items?: number };
  return {
    loadRun: async () => ({
      id: loaded.run.id,
      workspaceId: loaded.run.workspace_id,
      title: loaded.run.title,
      maxFeedbackItems: params.max_feedback_items ?? 500,
      products: loaded.products,
    }),
    loadFeedback: async (productIds, limit) =>
      (await painRepo.loadFeedback(db, productIds, limit)).map((f) => ({
        id: f.id,
        productId: f.product_id,
        text: f.text,
        publishedAt: f.published_at,
        authorReferenceHash: f.author_reference_hash,
        authorCompanyReference: f.author_company_reference,
        isNearDuplicateOf: f.is_near_duplicate_of,
        evidenceId: f.evidence_id,
        evidence: {
          sourceRecordId: f.source_record_id,
          reliabilityLevel: f.reliability_level,
          verificationStatus: f.verification_status,
          datedAt: f.dated_at,
          inOpenConflict: f.in_open_conflict,
        },
      })),
    markDuplicates: async (pairs) => {
      await painRepo.markDuplicates(db, pairs);
    },
    existingProblems: async (feedbackId, contract, prompt) => {
      const rows = await painRepo.existingProblems(db, feedbackId, contract, prompt, P3_AGENT_KEY);
      return rows === null ? null : rows.map(toStored);
    },
    saveProblems: async (feedbackId, stepId, contract, prompt, problems: ExtractedProblem[]) =>
      (
        await painRepo.saveProblems(db, {
          feedbackId,
          stepId,
          contractVersion: contract,
          promptVersion: prompt,
          problems: problems as unknown as JsonValue,
        })
      ).map(toStored),
    loadEmbeddings: (ids, model) => painRepo.loadEmbeddings(db, ids, model),
    saveEmbeddings: async (rows) => {
      await painRepo.saveEmbeddings(db, rows);
    },
    saveClusters: async (clusters) => {
      await painRepo.saveClusters(db, runId, clusters as unknown as JsonValue);
    },
    saveInsights: async (gaps, opportunities) => {
      await painRepo.saveInsights(
        db,
        runId,
        gaps as unknown as JsonValue,
        opportunities as unknown as JsonValue,
      );
    },
    updateRun: (patch) =>
      painRepo.updateRun(db, runId, patch as Parameters<typeof painRepo.updateRun>[2]),
    step: stepRunner(db, ctx.job, ctx.signal),
    gateway: deps.gateway,
    remainingAiBudgetUsd: () => budget.remaining(),
    recordUsage: async (stepId, u) => {
      if (u.outcome !== "budget_refused")
        budget.spend(u.reportedCostUsd ?? u.estimatedCostUsd ?? 0);
      await jobsRepo.recordProviderUsage(db, {
        workspace_id: ctx.job.workspace_id,
        job_execution_id: ctx.job.id,
        agent_step_run_id: stepId,
        provider: u.provider,
        model: u.model,
        operation: u.operation,
        input_tokens: u.inputTokens,
        output_tokens: u.outputTokens,
        estimated_cost_usd: u.estimatedCostUsd,
        reported_cost_usd: u.reportedCostUsd,
        latency_ms: u.latencyMs,
        outcome: u.outcome,
      });
    },
    stopReason: () =>
      ctx.cancelRequested() ? "cancelled" : Date.now() > ctx.deadline.getTime() ? "budget" : null,
    now: () => new Date(),
    signal: ctx.signal,
  };
}

export function painPointRunHandler(deps: PainDeps) {
  return async (ctx: HandlerContext): Promise<HandlerOutcome> => {
    const { db } = deps;
    const runId = (ctx.job.payload as { run_id?: string }).run_id;
    if (!runId) throw new JobError("permanent", "VALIDATION_ERROR", "payload without run_id");
    const loaded = await painRepo.loadRun(db, runId);
    if (!loaded || loaded.run.workspace_id !== ctx.job.workspace_id)
      throw new JobError("permanent", "NOT_FOUND", "pain point run not found");
    const limits = await deps.limits();
    const budget = jobBudget(limits.ai_max_cost_usd_per_job ?? 0);
    const ports = painPorts(deps, ctx, loaded, budget);

    const outcome = await runPainPointRun(ports);
    return {
      state: outcome.state,
      terminalReason: outcome.terminalReason,
      result: { run_id: runId, ...outcome.summary },
      usage: { ai_cost_usd: budget.spent() },
    };
  };
}
