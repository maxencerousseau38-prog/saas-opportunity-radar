// opportunity_analysis and report_export handlers (Implementation Blueprint
// §8, §10, §11): implement the Opportunity Engine's ports with the database
// and the AI gateway. The analysis status follows its job (M7 trigger); this
// handler writes the evidence index and the final result through the M7 RPCs.
import { analysisRepo, jobsRepo, painRepo, type DbClient, type Json } from "@sor/database";
import type { AIGateway } from "@sor/ai-gateway";
import { CLUSTER_ALGORITHM_VERSION, JobError } from "@sor/domain";
import { PROBLEM_EXTRACTION_CONTRACT_VERSION } from "@sor/contracts";
import {
  renderMarkdown,
  runOpportunityAnalysis,
  subjectName,
  type AnalysisContext,
  type CustomerVoiceData,
  type OpportunityPorts,
  type ScopeRole,
} from "@sor/opportunity-engine";
import { P3_PROMPT_VERSION, runPainPointRun } from "@sor/pain-point-engine";
import type { HandlerContext, HandlerOutcome } from "../runtime";
import { jobBudget, painPorts } from "./pain";
import { stepRunner } from "./steps";

export interface AnalysisDeps {
  db: DbClient;
  gateway: AIGateway;
  limits: () => Promise<Record<string, number>>;
}

type JsonValue = NonNullable<Json>;

/** Feedback considered by a nested pain point run, by analysis depth. */
const VOICE_FEEDBACK_CAP = { quick: 100, standard: 300, deep: 500 } as const;

export function opportunityAnalysisHandler(deps: AnalysisDeps) {
  return async (ctx: HandlerContext): Promise<HandlerOutcome> => {
    const { db } = deps;
    const analysisId = (ctx.job.payload as { analysis_id?: string }).analysis_id;
    if (!analysisId)
      throw new JobError("permanent", "VALIDATION_ERROR", "payload without analysis_id");
    const loaded = await analysisRepo.loadAnalysis(db, analysisId);
    if (!loaded || loaded.analysis.workspace_id !== ctx.job.workspace_id)
      throw new JobError("permanent", "NOT_FOUND", "analysis not found");
    const { analysis: row, scope } = loaded;
    const limits = await deps.limits();
    const budget = jobBudget(limits.ai_max_cost_usd_per_job ?? 0);
    const userContext = row.user_context as {
      context?: Record<string, unknown>;
      options?: Partial<AnalysisContext["options"]>;
      build_thresholds?: { min_score?: number; min_wtp?: number };
    };
    const depth = row.analysis_depth as AnalysisContext["depth"];
    const analysis: AnalysisContext = {
      id: row.id,
      workspaceId: row.workspace_id,
      subjectType: row.subject_type,
      subjectSnapshot: row.subject_snapshot as Record<string, unknown>,
      depth,
      targetMarket: row.target_market,
      context: userContext.context ?? {},
      options: {
        analyze_competitors: userContext.options?.analyze_competitors ?? true,
        analyze_customer_reviews: userContext.options?.analyze_customer_reviews ?? true,
        analyze_local_market: userContext.options?.analyze_local_market ?? true,
        generate_validation_plan: userContext.options?.generate_validation_plan ?? true,
      },
      thresholds: {
        minScore: Math.max(75, userContext.build_thresholds?.min_score ?? 75),
        minWtp: Math.max(10, userContext.build_thresholds?.min_wtp ?? 10),
      },
      scope: scope.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        role: p.role as ScopeRole,
        visible: p.visible,
        websiteUrl: p.websiteUrl,
        primaryCategorySlugs: p.primaryCategorySlugs,
      })),
    };
    const visibleIds = scope.filter((p) => p.visible).map((p) => p.id);
    const stopReason = () =>
      ctx.cancelRequested() ? "cancelled" : Date.now() > ctx.deadline.getTime() ? "budget" : null;

    const customerVoice = async (): Promise<CustomerVoiceData> => {
      const limitations: Array<Record<string, unknown>> = [];
      let runId = await analysisRepo.findCoveringPainRun(db, {
        workspaceId: row.workspace_id,
        productIds: visibleIds,
        algorithmVersion: CLUSTER_ALGORITHM_VERSION,
        extractorContract: PROBLEM_EXTRACTION_CONTRACT_VERSION,
        extractorPrompt: P3_PROMPT_VERSION,
      });
      const reusedRun = runId !== null;
      if (runId) {
        limitations.push({ code: "pain_point_run_reused", run_id: runId });
      } else {
        // §8.4: no covering run → P1–P7 for the scope inside this job (same budgets).
        runId = await analysisRepo.ensurePainRun(db, row.id, VOICE_FEEDBACK_CAP[depth]);
        const run = await painRepo.loadRun(db, runId);
        if (!run) throw new JobError("permanent", "NOT_FOUND", "pain point run not found");
        const outcome = await runPainPointRun(painPorts(deps, ctx, run, budget), {
          through: "statistics",
        });
        if (outcome.state !== "cancelled")
          await analysisRepo.finishPainRun(
            db,
            row.id,
            outcome.state === "completed" ? "completed" : "partial",
          );
        limitations.push({ code: "pain_point_run_created", run_id: runId });
      }
      const voice = await analysisRepo.voiceClusters(db, runId, visibleIds);
      limitations.push({ code: "review_sample_not_representative" });
      return {
        runId,
        reusedRun,
        clusters: voice.clusters,
        relevantSourceCount: voice.relevantSourceCount,
        distinctAuthorCount: voice.distinctAuthorCount,
        limitations,
      };
    };

    const ports: OpportunityPorts = {
      loadAnalysis: async () => analysis,
      loadCandidateEvidence: () => analysisRepo.candidateEvidence(db, scope),
      addToIndex: (stepId, ids) => analysisRepo.addEvidence(db, row.id, stepId, ids),
      customerVoice,
      loadEvidence: (ids) => analysisRepo.loadEvidenceByIds(db, ids),
      finalize: (result) => analysisRepo.finalize(db, row.id, result as unknown as JsonValue),
      markNeedsReview: (limitations) =>
        analysisRepo.markNeedsReview(db, row.id, limitations as unknown as JsonValue),
      step: stepRunner(db, ctx.job),
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
      stopReason,
      now: () => new Date(),
      signal: ctx.signal,
    };

    const outcome = await runOpportunityAnalysis(ports);
    return {
      state: outcome.state,
      terminalReason: outcome.terminalReason,
      result: { analysis_id: row.id, needs_review: outcome.needsReview, ...outcome.summary },
      usage: { ai_cost_usd: budget.spent() },
    };
  };
}

/** report_export: JSON or Markdown rendering of a stored report (PD-18 A). */
export function reportExportHandler(deps: { db: DbClient }) {
  return async (ctx: HandlerContext): Promise<HandlerOutcome> => {
    const payload = ctx.job.payload as { analysis_id?: string; format?: "json" | "markdown" };
    if (!payload.analysis_id || (payload.format !== "json" && payload.format !== "markdown"))
      throw new JobError("permanent", "VALIDATION_ERROR", "invalid export payload");
    const loaded = await analysisRepo.loadAnalysis(deps.db, payload.analysis_id);
    if (!loaded || loaded.analysis.workspace_id !== ctx.job.workspace_id)
      throw new JobError("permanent", "NOT_FOUND", "analysis not found");
    const a = loaded.analysis;
    if (!a.report_json) throw new JobError("permanent", "INVALID_STATE", "analysis without report");
    const title = `Analyse d’opportunité — ${subjectName({ subjectSnapshot: a.subject_snapshot as Record<string, unknown> })}`;
    const date = (a.completed_at ?? a.created_at).slice(0, 10);
    const base = `analyse-${a.id.slice(0, 8)}-${date}`;
    const content =
      payload.format === "json"
        ? JSON.stringify(
            {
              analysis_id: a.id,
              title,
              status: a.status,
              verdict: a.verdict,
              score_total: a.score_total,
              provisional_points: a.provisional_points,
              score_coverage: a.score_coverage,
              willingness_to_pay_score: a.willingness_to_pay_score,
              confidence_score: a.confidence_score,
              decision_band: a.decision_band,
              scoring_rules_version: a.scoring_rules_version,
              completed_at: a.completed_at,
              report: a.report_json,
            },
            null,
            2,
          )
        : renderMarkdown(a.report_json as Record<string, unknown>, title);
    const id = await analysisRepo.saveExport(deps.db, {
      jobId: ctx.job.id,
      format: payload.format,
      filename: `${base}.${payload.format === "json" ? "json" : "md"}`,
      contentType: payload.format === "json" ? "application/json" : "text/markdown; charset=utf-8",
      content,
    });
    return {
      state: "completed",
      terminalReason: "completed",
      result: { export_id: id, analysis_id: a.id, format: payload.format, bytes: content.length },
    };
  };
}
