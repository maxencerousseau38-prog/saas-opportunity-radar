// opportunity_analysis orchestrator (Implementation Blueprint §8.1):
// resolving_subject → building_evidence_index → product_research →
// market_research → customer_voice → competitor_research → localization →
// feasibility_wtp → dimension_assessment → scoring → red_team → verdict →
// report → completed. Every model call is a persisted, keyed step; the
// server (this code + @sor/domain + the database) computes every score,
// confidence and verdict. Agents cite only the analysis evidence index.
import { createHash } from "node:crypto";
import type { z } from "zod";
import {
  AnalysisReportSchema,
  COMPETITOR_ANALYSIS_CONTRACT_VERSION,
  CUSTOMER_VOICE_CONTRACT_VERSION,
  CompetitorAnalysisSchema,
  CustomerVoiceSchema,
  DIMENSION_ASSESSMENT_CONTRACT_VERSION,
  DimensionAssessmentOutputSchema,
  LOCALIZATION_CONTRACT_VERSION,
  LocalizationSchema,
  MARKET_ANALYSIS_CONTRACT_VERSION,
  MarketAnalysisSchema,
  PRODUCT_ANALYSIS_CONTRACT_VERSION,
  ProductAnalysisSchema,
  RED_TEAM_CONTRACT_VERSION,
  REPORT_CONTRACT_VERSION,
  RedTeamSchema,
  WTP_FEASIBILITY_CONTRACT_VERSION,
  WtpFeasibilitySchema,
  type AnalysisReport,
  type CompetitorAnalysis,
  type CustomerVoice,
  type DimensionAssessmentOutput,
  type Localization,
  type MarketAnalysis,
  type ProductAnalysis,
  type RedTeam,
  type WtpFeasibility,
} from "@sor/contracts";
import { GatewayError, type GatewayCallContext, type ModelProfile } from "@sor/ai-gateway";
import {
  classifyExclusion,
  computeScore,
  citationsOutsideIndex,
  decideVerdict,
  isKillCriterionSubstantiated,
  validateProposals,
  type IndexedEvidence,
  type ScoreResult,
  type ValidatedProposal,
  type VerdictResult,
} from "@sor/domain";
import { evidenceLabel, selectEvidenceIndex } from "./evidence-index";
import {
  INSTRUCTIONS,
  O1_AGENT_KEY,
  O2_AGENT_KEY,
  O3_AGENT_KEY,
  O4_AGENT_KEY,
  O5_AGENT_KEY,
  O6_AGENT_KEY,
  O7_AGENT_KEY,
  O8_AGENT_KEY,
  O9_AGENT_KEY,
  PROMPT_VERSIONS,
} from "./prompts";
import { assembleReport, executiveSummaryText } from "./report";
import type {
  AnalysisOutcome,
  AnalysisSummary,
  CandidateEvidence,
  CustomerVoiceData,
  DimensionRow,
  FindingRow,
  OpportunityPorts,
} from "./types";

export const hashOf = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Deterministic UUID (name-based) so that a redelivered job writes the same rows. */
export function stableId(...parts: string[]): string {
  const h = createHash("sha256").update(parts.join("\u0000")).digest("hex");
  const variant = ((parseInt(h[16] as string, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

class StopSignal extends Error {
  constructor(readonly reason: "cancelled" | "budget") {
    super(reason);
  }
}

type AgentKey = keyof typeof PROMPT_VERSIONS;
const isPermanent = (err: unknown) =>
  err instanceof GatewayError && (err.code === "SCHEMA_INVALID" || err.code === "UNKNOWN_CITED_ID");
const isBudget = (err: unknown) => err instanceof GatewayError && err.code === "BUDGET_EXHAUSTED";

/** Every evidence reference of an agent output (keys `evidence` and `examples`). */
export function evidenceRefs(value: unknown): Array<{ evidence_id: string; support_type: string }> {
  if (Array.isArray(value)) return value.flatMap(evidenceRefs);
  if (!value || typeof value !== "object") return [];
  const out: Array<{ evidence_id: string; support_type: string }> = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if ((k === "evidence" || k === "examples") && Array.isArray(v)) {
      for (const r of v as Array<Record<string, unknown>>) {
        if (r && typeof r.evidence_id === "string")
          out.push({
            evidence_id: r.evidence_id,
            support_type: typeof r.support_type === "string" ? r.support_type : "supports",
          });
      }
    } else out.push(...evidenceRefs(v));
  }
  return out;
}

export async function runOpportunityAnalysis(ports: OpportunityPorts): Promise<AnalysisOutcome> {
  const summary: AnalysisSummary = {
    stage: "resolving_subject",
    evidence_indexed: 0,
    agents_failed: [],
    provider: ports.gateway.providerId,
    warnings: [],
  };
  const limitations: Array<Record<string, unknown>> = [];
  let budgetHit = false;
  const checkpoint = () => {
    const reason = ports.stopReason();
    if (reason) throw new StopSignal(reason);
  };

  try {
    // -------------------------------------------------------- resolving_subject
    const analysis = await ports.loadAnalysis();
    const visibleScope = analysis.scope.filter((p) => p.visible);
    if (visibleScope.length < analysis.scope.length)
      limitations.push({
        code: "products_no_longer_visible",
        count: analysis.scope.length - visibleScope.length,
      });
    const productName = new Map(analysis.scope.map((p) => [p.id, p.name]));
    const nameOf = (id: string) => productName.get(id) ?? null;
    if (ports.gateway.providerId === "fake") limitations.push({ code: "simulated_provider" });

    // -------------------------------------------------- building_evidence_index
    summary.stage = "building_evidence_index";
    checkpoint();
    const candidates = await ports.loadCandidateEvidence();
    const selected = selectEvidenceIndex(analysis, candidates, ports.now());
    const indexStep = await ports.step<{ ids: string[] }>(
      {
        agentKey: "O0_evidence_index",
        stepKey: "index:catalog",
        contractVersion: "evidence-index.v1",
        promptVersion: null,
        inputHash: hashOf(selected.map((e) => e.evidenceId)),
      },
      async (stepId) => {
        const ids = selected.map((e) => e.evidenceId);
        await ports.addToIndex(stepId, ids);
        return { output: { ids } };
      },
    );
    const index = new Map<string, CandidateEvidence>(
      candidates
        .filter((e) => indexStep.output.ids.includes(e.evidenceId))
        .map((e) => [e.evidenceId, e]),
    );
    if (index.size === 0) limitations.push({ code: "no_evidence_in_scope" });
    if (candidates.length > index.size)
      limitations.push({ code: "evidence_index_capped", candidates: candidates.length });

    const scopeIds = analysis.scope.map((p) => p.id);
    let clusterIds: string[] = [];
    const allowed = () => [...index.keys(), ...scopeIds, ...clusterIds];
    const untrusted = () =>
      [...index.values()].map((e) => ({
        label: evidenceLabel(e, nameOf),
        ref: e.evidenceId,
        text: e.claimText.slice(0, 600),
      }));
    const subject = {
      type: analysis.subjectType,
      snapshot: analysis.subjectSnapshot,
      target_market: analysis.targetMarket,
      context: analysis.context,
      scope: visibleScope.map((p) => ({ product_id: p.id, name: p.name, role: p.role })),
    };

    /** One agent call as a keyed step; null (with a limitation) on a permanent failure. */
    async function agent<S extends z.ZodTypeAny>(
      key: AgentKey,
      contractVersion: string,
      schema: S,
      profile: Exclude<ModelProfile, "embedding">,
      trusted: Record<string, unknown>,
      stepKey: string = key,
    ): Promise<{ data: z.infer<S>; stepId: string } | null> {
      checkpoint();
      if (budgetHit) return null;
      const promptVersion = PROMPT_VERSIONS[key];
      const ids = allowed();
      try {
        const step = await ports.step<z.infer<S>>(
          {
            agentKey: key,
            stepKey,
            contractVersion,
            promptVersion,
            inputHash: hashOf({
              trusted,
              index: [...index.keys()],
              v: [contractVersion, promptVersion],
            }),
          },
          async (stepId) => {
            const ctx: GatewayCallContext = {
              remainingBudgetUsd: ports.remainingAiBudgetUsd(),
              allowedIds: new Set(ids),
              recordUsage: (u) => ports.recordUsage(stepId, u),
              signal: ports.signal,
            };
            const res = await ports.gateway.generate(
              {
                agentKey: key,
                contractVersion,
                promptVersion,
                systemInstructions: INSTRUCTIONS[key],
                untrustedInputs: untrusted(),
                trustedInput: { ...trusted, subject },
                schema,
                modelProfile: profile,
                maxOutputTokens: 4000,
                timeoutMs: 120_000,
                maxCostUsd: ports.remainingAiBudgetUsd(),
              },
              ctx,
            );
            // Evidence references must point into the index (not to products or clusters).
            const outside = citationsOutsideIndex(evidenceRefs(res.data), index);
            if (outside.length > 0)
              throw new GatewayError("UNKNOWN_CITED_ID", "evidence outside the analysis index");
            return {
              output: res.data as z.infer<S>,
              model: {
                provider: res.provider,
                name: res.model,
                ...(res.usage.inputTokens !== undefined
                  ? { inputTokens: res.usage.inputTokens }
                  : {}),
                ...(res.usage.outputTokens !== undefined
                  ? { outputTokens: res.usage.outputTokens }
                  : {}),
                costUsd: res.usage.reportedCostUsd ?? res.usage.estimatedCostUsd ?? 0,
                latencyMs: res.usage.latencyMs,
              },
            };
          },
        );
        return { data: step.output, stepId: step.stepId };
      } catch (err) {
        if (isBudget(err)) {
          budgetHit = true;
          summary.warnings.push(`ai_budget_exhausted:${key}`);
          limitations.push({ code: "ai_budget_exhausted", agent: key });
          return null;
        }
        if (!isPermanent(err)) throw err;
        summary.agents_failed.push(key);
        limitations.push({ code: "agent_output_rejected", agent: key });
        return null;
      }
    }

    // --------------------------------------------------------- research agents
    summary.stage = "product_research";
    const product = (
      await agent(
        O1_AGENT_KEY,
        PRODUCT_ANALYSIS_CONTRACT_VERSION,
        ProductAnalysisSchema,
        "research",
        {},
      )
    )?.data as ProductAnalysis | undefined;

    summary.stage = "market_research";
    const market = (
      await agent(
        O2_AGENT_KEY,
        MARKET_ANALYSIS_CONTRACT_VERSION,
        MarketAnalysisSchema,
        "research",
        {},
      )
    )?.data as MarketAnalysis | undefined;

    summary.stage = "customer_voice";
    checkpoint();
    let voiceData: CustomerVoiceData | null = null;
    let voice: CustomerVoice | null = null;
    if (!analysis.options.analyze_customer_reviews) {
      limitations.push({ code: "customer_reviews_not_analysed" });
    } else {
      voiceData = await ports.customerVoice();
      limitations.push(...voiceData.limitations);
      clusterIds = voiceData.clusters.map((c) => c.clusterId);
      // The cluster feedback evidence joins the index (scope checked by the database).
      const extra = [...new Set(voiceData.clusters.flatMap((c) => c.evidenceIds))].filter(
        (id) => !index.has(id),
      );
      if (extra.length > 0) {
        const step = await ports.step<{ ids: string[] }>(
          {
            agentKey: "O0_evidence_index",
            stepKey: "index:customer_voice",
            contractVersion: "evidence-index.v1",
            promptVersion: null,
            inputHash: hashOf(extra),
          },
          async (stepId) => {
            await ports.addToIndex(stepId, extra);
            return { output: { ids: extra } };
          },
        );
        for (const e of await ports.loadEvidence(step.output.ids)) index.set(e.evidenceId, e);
      }
      const clusters = voiceData.clusters.map((c) => ({
        cluster_id: c.clusterId,
        name: c.name,
        problem_category: c.problemCategory,
        frequency_label: c.frequencyLabel,
        feedback_count: c.feedbackCount,
        affected_product_count: c.affectedProductCount,
        distinct_author_count: c.distinctAuthorCount,
        distinct_company_count: c.distinctCompanyCount,
        evidence_ids: c.evidenceIds.filter((id) => index.has(id)).slice(0, 10),
      }));
      if (clusters.length === 0) {
        voice = {
          top_problems: [],
          relevant_source_count: voiceData.relevantSourceCount,
          distinct_author_count: voiceData.distinctAuthorCount,
          sample_limitations: [
            "No recurring problem cluster was found in the stored feedback sample.",
          ],
        };
      } else {
        const out = await agent(
          O3_AGENT_KEY,
          CUSTOMER_VOICE_CONTRACT_VERSION,
          CustomerVoiceSchema,
          "research",
          { clusters },
        );
        if (out) {
          const data = out.data as CustomerVoice;
          // Counts are deterministic (P7): the agent's numbers are replaced.
          if (
            data.relevant_source_count !== voiceData.relevantSourceCount ||
            data.distinct_author_count !== voiceData.distinctAuthorCount
          )
            summary.warnings.push("customer_voice_counts_replaced_by_statistics");
          voice = {
            ...data,
            top_problems: data.top_problems.filter((p) => clusterIds.includes(p.cluster_id)),
            relevant_source_count: voiceData.relevantSourceCount,
            distinct_author_count: voiceData.distinctAuthorCount,
          };
        }
      }
    }

    summary.stage = "competitor_research";
    let competitors: CompetitorAnalysis | null = null;
    const omittedBefore = Number(analysis.subjectSnapshot.omitted_excluded_count ?? 0);
    const invisibleCompetitors = analysis.scope.filter(
      (p) => p.role === "competitor" && !p.visible,
    ).length;
    let competitorsExcluded = 0;
    if (!analysis.options.analyze_competitors) {
      limitations.push({ code: "competitors_not_analysed" });
    } else {
      const out = await agent(
        O4_AGENT_KEY,
        COMPETITOR_ANALYSIS_CONTRACT_VERSION,
        CompetitorAnalysisSchema,
        "research",
        {
          known_competitors: visibleScope
            .filter((p) => p.role === "competitor")
            .map((p) => ({ product_id: p.id, name: p.name, website_url: p.websiteUrl })),
        },
      );
      if (out) {
        const data = out.data as CompetitorAnalysis;
        const kept: CompetitorAnalysis["competitors"] = [];
        for (const c of data.competitors) {
          if (c.product_id !== null) {
            // Catalog products: only visible scope products are allowed.
            if (visibleScope.some((p) => p.id === c.product_id)) kept.push(c);
            else competitorsExcluded++;
            continue;
          }
          // §8.10: competitors outside the catalog are classified too.
          const ex = classifyExclusion({
            primaryCategorySlugs: [],
            name: c.name,
            tagline: c.positioning?.text ?? null,
            primaryUseCase: c.target_segment,
            secondaryTexts: [c.feature_overlap ?? ""],
            featureTexts: [],
          });
          if (ex.status === "excluded") competitorsExcluded++;
          else
            kept.push(
              ex.status === "needs_review"
                ? { ...c, name: `${c.name} (à revoir : exclusion permanente)` }
                : c,
            );
        }
        competitors = {
          competitors: kept,
          omitted_excluded_count: omittedBefore + invisibleCompetitors + competitorsExcluded,
        };
      }
    }

    summary.stage = "localization";
    let localization: Localization | null = null;
    if (!analysis.options.analyze_local_market) {
      limitations.push({ code: "local_market_not_analysed" });
    } else {
      localization =
        ((
          await agent(O5_AGENT_KEY, LOCALIZATION_CONTRACT_VERSION, LocalizationSchema, "research", {
            target_market: analysis.targetMarket,
          })
        )?.data as Localization | undefined) ?? null;
    }

    summary.stage = "feasibility_wtp";
    const research = {
      product_analysis: product ?? null,
      market_analysis: market ?? null,
      customer_voice: voice,
      competitor_analysis: competitors,
      localization,
    };
    const wtp =
      ((
        await agent(
          O6_AGENT_KEY,
          WTP_FEASIBILITY_CONTRACT_VERSION,
          WtpFeasibilitySchema,
          "reasoning",
          research,
        )
      )?.data as WtpFeasibility | undefined) ?? null;

    // ---------------------------------------------------- dimension_assessment
    summary.stage = "dimension_assessment";
    const indexed: ReadonlyMap<string, IndexedEvidence> = index;
    let assessment: { output: DimensionAssessmentOutput; stepId: string } | null = null;
    let validated: ValidatedProposal[] | null = null;
    let lastErrors: string[] = [];
    for (const attempt of [1, 2]) {
      const out = await agent(
        O7_AGENT_KEY,
        DIMENSION_ASSESSMENT_CONTRACT_VERSION,
        DimensionAssessmentOutputSchema,
        "reasoning",
        {
          ...research,
          wtp_feasibility: wtp,
          previous_rejection: attempt === 2 ? lastErrors : null,
        },
        `${O7_AGENT_KEY}:${attempt}`,
      );
      if (!out) break;
      const data = out.data as DimensionAssessmentOutput;
      const v = validateProposals(data.proposals, indexed);
      const findingOutside = citationsOutsideIndex(
        data.findings.flatMap((f) => f.evidence),
        indexed,
      );
      if (v.ok && findingOutside.length === 0) {
        validated = v.dimensions;
        assessment = { output: data, stepId: out.stepId };
        summary.warnings.push(...v.warnings);
        break;
      }
      lastErrors = v.ok ? ["FINDING_EVIDENCE_OUTSIDE_INDEX"] : v.errors;
      summary.warnings.push(`dimension_assessment_rejected:${attempt}`);
    }

    if (!validated || !assessment) {
      if (budgetHit) return await finishWithoutScore("budget");
      // §9.2: rejected twice → needs_review, never a score.
      limitations.push({ code: "dimension_assessment_needs_review", errors: lastErrors });
      await ports.markNeedsReview(limitations);
      summary.stage = "completed";
      return { state: "partial", terminalReason: "partial", needsReview: true, summary };
    }

    // ------------------------------------------------------------- scoring
    summary.stage = "scoring";
    const score: ScoreResult = computeScore(validated, ports.now());
    const dimensions: DimensionRow[] = validated.map((d) => ({
      dimension_key: d.key,
      assessment_status: d.status,
      rating: d.rating,
      explanation: d.explanation,
      missing_information: d.missingInformation,
      proposed_by_step_id: assessment!.stepId,
      evidence: d.evidence.map((e) => ({
        evidence_id: e.evidence_id,
        support_type: e.support_type,
      })),
    }));
    const findings: FindingRow[] = [];
    let excludedFindings = 0;
    assessment.output.findings.forEach((f, i) => {
      if (f.type === "kill_criterion") {
        summary.warnings.push("kill_criterion_from_assessor_ignored"); // O8 owns kill criteria
        return;
      }
      let title = f.title;
      if (f.type === "opportunity") {
        const ex = classifyExclusion({
          primaryCategorySlugs: [],
          name: f.title,
          tagline: null,
          primaryUseCase: f.description.slice(0, 300),
          secondaryTexts: [],
          featureTexts: [],
        });
        if (ex.status === "excluded") {
          excludedFindings++;
          return;
        }
        if (ex.status === "needs_review") title = `${f.title} (à revoir : exclusion)`.slice(0, 200);
      }
      findings.push({
        id: stableId(analysis.id, "O7", String(i)),
        finding_type: f.type,
        title,
        description: f.description,
        priority: f.priority,
        confidence: f.confidence,
        is_hypothesis: f.is_hypothesis,
        severity: null,
        is_substantiated: null,
        dimension_key: f.dimension_key,
        source_agent: O7_AGENT_KEY,
        recommendation: null,
        evidence: f.evidence.map((e) => ({
          evidence_id: e.evidence_id,
          support_type: e.support_type,
          ...(e.relevance_score !== undefined ? { relevance_score: e.relevance_score } : {}),
        })),
      });
    });

    // ------------------------------------------------------------- red_team
    summary.stage = "red_team";
    const scoring = {
      score_total: score.scoreTotal,
      provisional_points: score.provisionalPoints,
      coverage: score.coverage,
      wtp_score: score.wtpScore,
      confidence: score.confidence,
      band: score.band,
    };
    const red =
      ((
        await agent(O8_AGENT_KEY, RED_TEAM_CONTRACT_VERSION, RedTeamSchema, "verification", {
          ...research,
          wtp_feasibility: wtp,
          scoring,
          dimensions: dimensions.map((d) => ({
            key: d.dimension_key,
            status: d.assessment_status,
            rating: d.rating,
            explanation: d.explanation,
          })),
          findings: findings.map((f) => ({ type: f.finding_type, title: f.title })),
        })
      )?.data as RedTeam | undefined) ?? null;
    if (!red) limitations.push({ code: "red_team_unavailable" });
    const killCriteria: Array<{
      severity: "critical" | "major" | "minor";
      substantiated: boolean;
    }> = [];
    (red?.kill_criteria ?? []).forEach((k, i) => {
      const supporting = k.evidence
        .filter((e) => e.support_type === "supports")
        .map((e) => indexed.get(e.evidence_id))
        .filter((e): e is IndexedEvidence => e !== undefined);
      const substantiated = isKillCriterionSubstantiated(supporting);
      killCriteria.push({ severity: k.severity, substantiated });
      findings.push({
        id: stableId(analysis.id, "O8:kill", String(i)),
        finding_type: "kill_criterion",
        title: k.criterion.slice(0, 200),
        description: k.explanation.slice(0, 3000),
        priority: k.severity === "critical" ? 1 : k.severity === "major" ? 2 : 3,
        confidence: red!.confidence,
        is_hypothesis: supporting.length === 0,
        severity: k.severity,
        is_substantiated: substantiated,
        dimension_key: null,
        source_agent: O8_AGENT_KEY,
        recommendation: null,
        evidence: k.evidence.map((e) => ({
          evidence_id: e.evidence_id,
          support_type: e.support_type,
        })),
      });
    });
    (red?.strongest_counterarguments ?? []).forEach((c, i) => {
      const supports = c.evidence.some((e) => e.support_type === "supports");
      findings.push({
        id: stableId(analysis.id, "O8:risk", String(i)),
        finding_type: "risk",
        title: c.argument.slice(0, 200),
        description: c.argument,
        priority: 2,
        confidence: red!.confidence,
        is_hypothesis: !supports,
        severity: null,
        is_substantiated: null,
        dimension_key: null,
        source_agent: O8_AGENT_KEY,
        recommendation: null,
        evidence: c.evidence.map((e) => ({
          evidence_id: e.evidence_id,
          support_type: e.support_type,
        })),
      });
    });

    // -------------------------------------------------------------- verdict
    summary.stage = "verdict";
    const dimension = (k: string) => validated!.find((d) => d.key === k)!;
    const demandSources = new Set(
      dimension("customer_demand").supporting.map((e) => e.sourceRecordId),
    );
    const gateInputs = (recommendationExcluded: boolean) => ({
      score,
      demand: {
        rating: dimension("customer_demand").rating,
        distinctSourceRecords: demandSources.size,
      },
      differentiation: {
        rating: dimension("competitive_differentiation").rating,
        hasEvidencedGapFinding: findings.some(
          (f) =>
            (f.finding_type === "opportunity" || f.finding_type === "competitor_gap") &&
            !f.is_hypothesis &&
            f.evidence.some((e) => e.support_type === "supports"),
        ),
      },
      index: [...index.values()],
      killCriteria,
      recommendationExcludedOrUnderReview: recommendationExcluded,
      // Without a red-team result the verdict can only be stricter (§9.6 rule 8).
      redTeamRecommendation: red ? red.recommended_verdict : ("validate_first" as const),
      thresholds: analysis.thresholds,
    });
    let verdict: VerdictResult = decideVerdict(gateInputs(false));

    // --------------------------------------------------------------- report
    summary.stage = "report";
    let composed: AnalysisReport | null =
      ((
        await agent(O9_AGENT_KEY, REPORT_CONTRACT_VERSION, AnalysisReportSchema, "research", {
          ...research,
          wtp_feasibility: wtp,
          red_team: red,
          scoring,
          verdict: verdict.verdict,
          verdict_reasons: verdict.reasons,
          generate_validation_plan: analysis.options.generate_validation_plan,
        })
      )?.data as AnalysisReport | undefined) ?? null;
    if (!composed) limitations.push({ code: "report_narrative_unavailable" });

    // §8.10: classify the recommendation and the opportunity map before persisting.
    let recommendationStatus: "eligible" | "excluded" | "needs_review" | "none" = "none";
    let excludedMapEntries = 0;
    if (composed) {
      if (!analysis.options.generate_validation_plan)
        composed = { ...composed, validation_plan: [] };
      if (composed.recommended_product) {
        const r = composed.recommended_product;
        recommendationStatus = classifyExclusion({
          primaryCategorySlugs: [],
          name: r.name,
          tagline: r.value_proposition,
          primaryUseCase: r.positioning,
          secondaryTexts: [r.initial_target],
          featureTexts: r.mvp_features,
        }).status;
      }
      const map = composed.opportunity_map.filter((o) => {
        const ex = classifyExclusion({
          primaryCategorySlugs: [],
          name: o.problem,
          tagline: o.proposed_solution,
          primaryUseCase: o.customer_segment,
          secondaryTexts: [o.competitive_advantage],
          featureTexts: [],
        });
        if (ex.status === "excluded") excludedMapEntries++;
        return ex.status !== "excluded";
      });
      composed = { ...composed, opportunity_map: map };
      if (recommendationStatus === "excluded" || recommendationStatus === "needs_review") {
        verdict = decideVerdict(gateInputs(true)); // can only tighten
        composed = { ...composed, recommended_product: null };
      }
    }
    const excludedCount = excludedFindings + excludedMapEntries + competitorsExcluded;
    if (excludedCount > 0)
      limitations.push({ code: "excluded_items_removed", count: excludedCount });
    if (recommendationStatus === "excluded" || recommendationStatus === "needs_review")
      limitations.push({ code: "recommended_product_excluded", status: recommendationStatus });

    const report = assembleReport({
      analysis,
      simulated: ports.gateway.providerId === "fake",
      score,
      verdict,
      dimensions: validated,
      findings,
      index: [...index.values()],
      product: product ?? null,
      market: market ?? null,
      voice,
      voiceData,
      competitors,
      localization,
      wtp,
      red,
      composed,
      recommendationStatus,
      limitations,
      now: ports.now(),
    });
    await ports.finalize({
      dimensions,
      findings,
      score: {
        score_total: score.scoreTotal,
        provisional_points: score.provisionalPoints,
        score_coverage: score.coverage,
        willingness_to_pay_score: score.wtpScore,
        confidence_score: score.confidence,
        decision_band: score.band,
      },
      verdict: verdict.verdict,
      verdict_reasons: verdict.reasons,
      executive_summary: executiveSummaryText(analysis, composed, score, verdict),
      report,
      limitations,
    });
    summary.evidence_indexed = index.size;
    summary.stage = "completed";
    const partial = budgetHit || summary.agents_failed.length > 0;
    return {
      state: partial ? "partial" : "completed",
      terminalReason: budgetHit ? "budget_exhausted" : partial ? "partial" : "completed",
      needsReview: false,
      summary,
    };
  } catch (err) {
    if (err instanceof StopSignal) {
      if (err.reason === "cancelled") {
        return { state: "cancelled", terminalReason: "cancelled", needsReview: false, summary };
      }
      return await finishWithoutScore("budget");
    }
    throw err;
  }

  /** Budget exhausted before a validated assessment: no score, needs review. */
  async function finishWithoutScore(reason: "budget"): Promise<AnalysisOutcome> {
    limitations.push({ code: reason === "budget" ? "budget_exhausted_before_scoring" : reason });
    await ports.markNeedsReview(limitations);
    summary.stage = "completed";
    return { state: "partial", terminalReason: "budget_exhausted", needsReview: true, summary };
  }
}
