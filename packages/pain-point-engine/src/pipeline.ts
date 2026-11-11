// pain_point_run orchestrator (Implementation Blueprint §7.1–7.4):
// collecting → normalizing → extracting → embedding → clustering → verifying
// → computing_statistics → identifying_gaps → generating_opportunities →
// classifying_exclusion → persisting → completed. Every model call and every
// write is a persisted, keyed step: a resumed job reuses completed steps.
// The engine never scores and never treats complaints as willingness to pay.
import { createHash } from "node:crypto";
import {
  CLUSTER_VERIFICATION_CONTRACT_VERSION,
  ClusterVerificationOutputSchema,
  MARKET_GAP_CONTRACT_VERSION,
  MarketGapOutputSchema,
  OPPORTUNITY_HYPOTHESIS_CONTRACT_VERSION,
  OpportunityHypothesisOutputSchema,
  PROBLEM_EXTRACTION_CONTRACT_VERSION,
  ProblemExtractionOutputSchema,
  type ClusterVerificationOutput,
  type MarketGapOutput,
  type OpportunityHypothesisOutput,
  type ProblemCategory,
  type ProblemExtractionOutput,
} from "@sor/contracts";
import { GatewayError, type GatewayCallContext } from "@sor/ai-gateway";
import {
  CLUSTER_ALGORITHM_VERSION,
  CLUSTER_PARAMS_V1,
  classifyExclusion,
  clusterProblems,
  clusterStatsColumns,
  computeClusterStatistics,
  deduplicate,
  type ClusterMember,
  type ClusterStatistics,
} from "@sor/domain";
import {
  P3_AGENT_KEY,
  P3_INSTRUCTIONS,
  P3_PROMPT_VERSION,
  P4_AGENT_KEY,
  P6_AGENT_KEY,
  P6_INSTRUCTIONS,
  P6_PROMPT_VERSION,
  P8_AGENT_KEY,
  P8_INSTRUCTIONS,
  P8_PROMPT_VERSION,
  P9_AGENT_KEY,
  P9_INSTRUCTIONS,
  P9_PROMPT_VERSION,
} from "./prompts";
import type {
  ClusterRecord,
  FeedbackItem,
  GapRecord,
  OpportunityRecord,
  PainOutcome,
  PainPorts,
  PainSummary,
  StoredProblem,
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

const EMBED_BATCH = 64;
const SAMPLE_STATEMENTS = 5;
const isPermanent = (err: unknown) =>
  err instanceof GatewayError && (err.code === "SCHEMA_INVALID" || err.code === "UNKNOWN_CITED_ID");
const isBudget = (err: unknown) => err instanceof GatewayError && err.code === "BUDGET_EXHAUSTED";

export interface PainRunOptions {
  /**
   * "statistics": P1–P7 only (no gaps, no hypotheses), used by an opportunity
   * analysis whose customer voice has no covering run (Implementation Blueprint §8.4).
   */
  through?: "all" | "statistics";
}

export async function runPainPointRun(
  ports: PainPorts,
  options: PainRunOptions = {},
): Promise<PainOutcome> {
  const statisticsOnly = options.through === "statistics";
  const summary: PainSummary = {
    stage: "collecting",
    feedback_considered: 0,
    feedback_without_text: 0,
    near_duplicates: 0,
    problems_extracted: 0,
    problems_reused: 0,
    isolated_complaints: 0,
    clusters_created: 0,
    gaps_identified: 0,
    opportunities_generated: 0,
    hypotheses_excluded: 0,
    hypotheses_needs_review: 0,
    extraction_failures: 0,
    injection_suspected: 0,
    provider: ports.gateway.providerId,
    warnings: [],
  };
  const limitations: Array<Record<string, unknown>> = [];
  let budgetHit = false;
  const checkpoint = () => {
    const reason = ports.stopReason();
    if (reason) throw new StopSignal(reason);
  };
  const ctx = (stepId: string, allowedIds: Iterable<string>): GatewayCallContext => ({
    remainingBudgetUsd: ports.remainingAiBudgetUsd(),
    allowedIds: new Set(allowedIds),
    recordUsage: (u) => ports.recordUsage(stepId, u),
    signal: ports.signal,
  });
  const modelOf = (res: {
    provider: string;
    model: string;
    usage: {
      inputTokens?: number;
      outputTokens?: number;
      estimatedCostUsd?: number;
      reportedCostUsd?: number;
      latencyMs: number;
    };
  }) => ({
    provider: res.provider,
    name: res.model,
    ...(res.usage.inputTokens !== undefined ? { inputTokens: res.usage.inputTokens } : {}),
    ...(res.usage.outputTokens !== undefined ? { outputTokens: res.usage.outputTokens } : {}),
    costUsd: res.usage.reportedCostUsd ?? res.usage.estimatedCostUsd ?? 0,
    latencyMs: res.usage.latencyMs,
  });

  try {
    // ---------------------------------------------------------- P1 collecting
    const run = await ports.loadRun();
    const visible = run.products.filter((p) => p.visible);
    if (visible.length < run.products.length)
      limitations.push({
        code: "products_no_longer_visible",
        count: run.products.length - visible.length,
      });
    const productName = new Map(run.products.map((p) => [p.id, p.name]));
    const all = await ports.loadFeedback(
      visible.map((p) => p.id),
      run.maxFeedbackItems,
    );
    summary.feedback_considered = all.length;
    const withText = all.filter(
      (f): f is FeedbackItem & { text: string } => !!f.text && f.text.trim().length > 0,
    );
    summary.feedback_without_text = all.length - withText.length;
    if (summary.feedback_without_text > 0)
      limitations.push({
        code: "feedback_without_stored_text",
        count: summary.feedback_without_text,
      });
    if (all.length >= run.maxFeedbackItems)
      limitations.push({ code: "feedback_cap_reached", max_feedback_items: run.maxFeedbackItems });
    limitations.push({ code: "review_sample_not_representative" });

    // ---------------------------------------------------------- P2 normalizing
    summary.stage = "normalizing";
    checkpoint();
    const dedup = deduplicate(
      withText.map((f) => ({
        id: f.id,
        productId: f.productId,
        text: f.text,
        publishedAt: f.publishedAt,
        authorReferenceHash: f.authorReferenceHash,
      })),
    );
    const duplicates = new Set<string>([
      ...withText.filter((f) => f.isNearDuplicateOf).map((f) => f.id),
      ...dedup.duplicateOf.keys(),
    ]);
    summary.near_duplicates = duplicates.size;
    const newPairs = [...dedup.duplicateOf.entries()]
      .filter(([id]) => !withText.find((f) => f.id === id)?.isNearDuplicateOf)
      .map(([feedback_id, duplicate_of]) => ({ feedback_id, duplicate_of }));
    if (newPairs.length > 0) await ports.markDuplicates(newPairs);
    const canonical = withText.filter((f) => !duplicates.has(f.id));

    // ---------------------------------------------------------- P3 extracting
    summary.stage = "extracting";
    const problems: StoredProblem[] = [];
    for (const f of canonical) {
      checkpoint();
      if (budgetHit) break;
      const reused = await ports.existingProblems(
        f.id,
        PROBLEM_EXTRACTION_CONTRACT_VERSION,
        P3_PROMPT_VERSION,
      );
      if (reused) {
        problems.push(...reused);
        summary.problems_reused += reused.length;
        continue;
      }
      try {
        const step = await ports.step<{ problems: StoredProblem[]; injection: boolean }>(
          {
            agentKey: P3_AGENT_KEY,
            stepKey: `extract:${f.id}`,
            contractVersion: PROBLEM_EXTRACTION_CONTRACT_VERSION,
            promptVersion: P3_PROMPT_VERSION,
            inputHash: hashOf({
              text: f.text,
              v: [PROBLEM_EXTRACTION_CONTRACT_VERSION, P3_PROMPT_VERSION],
            }),
          },
          async (stepId) => {
            const res = await ports.gateway.generate(
              {
                agentKey: P3_AGENT_KEY,
                contractVersion: PROBLEM_EXTRACTION_CONTRACT_VERSION,
                promptVersion: P3_PROMPT_VERSION,
                systemInstructions: P3_INSTRUCTIONS,
                untrustedInputs: [
                  { label: "customer feedback", ref: f.id, text: f.text.slice(0, 8000) },
                ],
                trustedInput: { feedback_id: f.id, product: productName.get(f.productId) ?? null },
                schema: ProblemExtractionOutputSchema,
                modelProfile: "fast_extraction",
                maxOutputTokens: 2000,
                timeoutMs: 60_000,
                maxCostUsd: ports.remainingAiBudgetUsd(),
              },
              ctx(stepId, [f.id]),
            );
            const out: ProblemExtractionOutput = res.data;
            if (out.feedback_id !== f.id)
              throw new GatewayError("UNKNOWN_CITED_ID", "feedback id mismatch");
            const saved = await ports.saveProblems(
              f.id,
              stepId,
              PROBLEM_EXTRACTION_CONTRACT_VERSION,
              P3_PROMPT_VERSION,
              out.problems,
            );
            return {
              output: { problems: saved, injection: out.injection_suspected },
              warnings: out.injection_suspected ? ["injection_suspected"] : [],
              model: modelOf(res),
            };
          },
        );
        problems.push(...step.output.problems);
        summary.problems_extracted += step.output.problems.length;
        if (step.output.injection) summary.injection_suspected++;
      } catch (err) {
        if (isBudget(err)) {
          budgetHit = true;
          summary.warnings.push("ai_budget_exhausted_during_extraction");
          break;
        }
        if (!isPermanent(err)) throw err;
        summary.extraction_failures++;
      }
    }
    if (summary.extraction_failures > 0)
      limitations.push({ code: "feedback_not_extracted", count: summary.extraction_failures });

    // ---------------------------------------------------------- P4 embedding
    summary.stage = "embedding";
    checkpoint();
    const embeddingModel = ports.gateway.modelFor("embedding");
    const vectors = await ports.loadEmbeddings(
      problems.map((p) => p.id),
      embeddingModel,
    );
    const missing = problems.filter((p) => !vectors.has(p.id));
    for (let i = 0; i < missing.length && !budgetHit; i += EMBED_BATCH) {
      checkpoint();
      const batch = missing.slice(i, i + EMBED_BATCH);
      try {
        const step = await ports.step<{ vectors: number[][] }>(
          {
            agentKey: P4_AGENT_KEY,
            stepKey: `embed:${hashOf(batch.map((p) => p.id)).slice(0, 16)}`,
            contractVersion: "embedding.v1",
            promptVersion: null,
            inputHash: hashOf({ ids: batch.map((p) => p.id), model: embeddingModel }),
          },
          async (stepId) => {
            const res = await ports.gateway.embed(
              batch.map((p) => `${p.problem_category}: ${p.problem_statement}`),
              {
                remainingBudgetUsd: ports.remainingAiBudgetUsd(),
                recordUsage: (u) => ports.recordUsage(stepId, u),
                signal: ports.signal,
              },
            );
            await ports.saveEmbeddings(
              batch.map((p, k) => ({
                problem_id: p.id,
                model: res.model,
                vector: res.vectors[k] as number[],
              })),
            );
            return { output: { vectors: res.vectors } };
          },
        );
        batch.forEach((p, k) => vectors.set(p.id, step.output.vectors[k] as number[]));
      } catch (err) {
        if (!isBudget(err)) throw err;
        budgetHit = true;
        summary.warnings.push("ai_budget_exhausted_during_embedding");
      }
    }

    // ---------------------------------------------------------- P5 clustering
    summary.stage = "clustering";
    checkpoint();
    const embedded = problems.filter((p) => vectors.has(p.id));
    const clustering = clusterProblems(
      embedded.map((p) => ({
        problemId: p.id,
        category: p.problem_category,
        vector: vectors.get(p.id) as number[],
      })),
      CLUSTER_PARAMS_V1,
    );
    summary.isolated_complaints = clustering.isolated.length;
    const problemById = new Map(problems.map((p) => [p.id, p]));
    const feedbackById = new Map(withText.map((f) => [f.id, f]));

    // ---------------------------------------------------------- P6 verifying
    summary.stage = "verifying";
    interface Draft {
      ref: string;
      category: ProblemCategory;
      memberIds: string[];
      removedIds: string[];
      name: string;
      description: string;
      persona: string | null;
      coherent: boolean | null;
      verifierConfidence: number | null;
    }
    const drafts: Draft[] = [];
    const fallbackName = (ids: string[]) =>
      (problemById.get(ids[0] as string)?.problem_statement ?? "Problem").slice(0, 120);
    for (const group of clustering.clusters) {
      checkpoint();
      const ref = stableId(run.id, "cluster", group.category, ...group.problemIds);
      let verification: ClusterVerificationOutput | null = null;
      if (!budgetHit) {
        try {
          const step = await ports.step<ClusterVerificationOutput>(
            {
              agentKey: P6_AGENT_KEY,
              stepKey: `verify:${ref}`,
              contractVersion: CLUSTER_VERIFICATION_CONTRACT_VERSION,
              promptVersion: P6_PROMPT_VERSION,
              inputHash: hashOf(group.problemIds),
            },
            async (stepId) => {
              const res = await ports.gateway.generate(
                {
                  agentKey: P6_AGENT_KEY,
                  contractVersion: CLUSTER_VERIFICATION_CONTRACT_VERSION,
                  promptVersion: P6_PROMPT_VERSION,
                  systemInstructions: P6_INSTRUCTIONS,
                  untrustedInputs: group.problemIds.map((id) => ({
                    label: "problem statement",
                    ref: id,
                    text: problemById.get(id)?.problem_statement ?? "",
                  })),
                  trustedInput: {
                    cluster_ref: ref,
                    problem_category: group.category,
                    problem_ids: group.problemIds,
                  },
                  schema: ClusterVerificationOutputSchema,
                  modelProfile: "verification",
                  maxOutputTokens: 2000,
                  timeoutMs: 60_000,
                  maxCostUsd: ports.remainingAiBudgetUsd(),
                },
                ctx(stepId, group.problemIds),
              );
              return { output: res.data, model: modelOf(res) };
            },
          );
          verification = step.output;
        } catch (err) {
          if (isBudget(err)) {
            budgetHit = true;
            summary.warnings.push("ai_budget_exhausted_during_verification");
          } else if (!isPermanent(err)) throw err;
          else summary.warnings.push(`cluster_not_verified:${ref}`);
        }
      }
      const members = new Set(group.problemIds);
      const outliers = (verification?.outlier_problem_ids ?? []).filter((id) => members.has(id));
      let remaining = group.problemIds.filter((id) => !outliers.includes(id));
      // Splits proposed by the verifier are applied (never merges); each problem goes to one part.
      const parts: Array<{ name: string; ids: string[] }> = [];
      for (const split of verification?.split_proposal ?? []) {
        const ids = split.problem_ids.filter((id) => remaining.includes(id));
        if (ids.length >= CLUSTER_PARAMS_V1.minSize && ids.length < remaining.length) {
          parts.push({ name: split.name || fallbackName(ids), ids: [...ids].sort() });
          remaining = remaining.filter((id) => !ids.includes(id));
        }
      }
      const base: Omit<Draft, "ref" | "memberIds" | "removedIds" | "name"> = {
        category: group.category as ProblemCategory,
        description:
          verification?.proposed_description ??
          `${remaining.length} similar ${group.category} problems`,
        persona: verification?.target_persona ?? null,
        coherent: verification ? verification.is_coherent : null,
        verifierConfidence: verification?.confidence ?? null,
      };
      if (remaining.length >= CLUSTER_PARAMS_V1.minSize)
        drafts.push({
          ...base,
          ref,
          memberIds: remaining,
          removedIds: outliers,
          name: verification?.proposed_name ?? fallbackName(remaining),
        });
      else summary.isolated_complaints += remaining.length;
      for (const part of parts)
        drafts.push({
          ...base,
          ref: stableId(ref, "split", ...part.ids),
          memberIds: part.ids,
          removedIds: [],
          name: part.name.slice(0, 200),
          description: `${part.ids.length} problems split from "${verification?.proposed_name ?? fallbackName(part.ids)}"`,
        });
      summary.isolated_complaints += outliers.length;
    }

    // ---------------------------------------------------------- P7 statistics
    summary.stage = "computing_statistics";
    checkpoint();
    const scope = visible.map((p) => ({
      productId: p.id,
      totalKnownReviewCount: p.totalKnownReviewCount,
    }));
    const memberOf = (id: string): ClusterMember | null => {
      const p = problemById.get(id);
      const f = p ? feedbackById.get(p.feedbackId) : undefined;
      if (!p || !f) return null;
      return {
        problemId: p.id,
        feedbackId: f.id,
        productId: f.productId,
        authorReferenceHash: f.authorReferenceHash,
        authorCompanyReference: f.authorCompanyReference,
        publishedAt: f.publishedAt,
        severity: p.severity,
        resolutionStatus: p.resolution_status,
        isDuplicate: false,
        evidence: f.evidence,
      };
    };
    const clusters: Array<ClusterRecord & { _stats: ClusterStatistics; _evidence: string[] }> =
      drafts.map((d) => {
        const members = d.memberIds.map(memberOf).filter((m): m is ClusterMember => m !== null);
        const stats = computeClusterStatistics(members, scope, {
          verifierCoherent: d.coherent,
          now: ports.now(),
        });
        return {
          id: d.ref,
          name: d.name.slice(0, 200),
          description: d.description.slice(0, 3000),
          problem_category: d.category,
          target_persona: d.persona,
          algorithm_version: CLUSTER_ALGORITHM_VERSION,
          existing_solutions: [],
          members: [
            ...d.memberIds.map((id) => ({
              problem_id: id,
              membership_source: "algorithm" as const,
              membership_confidence: d.verifierConfidence,
              relevance_score: null,
            })),
            ...d.removedIds.map((id) => ({
              problem_id: id,
              membership_source: "verifier" as const,
              membership_confidence: d.verifierConfidence,
              relevance_score: null,
              removed: true,
            })),
          ],
          stats: clusterStatsColumns(stats),
          _stats: stats,
          _evidence: members
            .map((m) => feedbackById.get(m.feedbackId)?.evidenceId)
            .filter((e): e is string => !!e),
        };
      });
    await ports.step(
      {
        agentKey: "P7_statistics",
        stepKey: "persist-clusters",
        contractVersion: CLUSTER_ALGORITHM_VERSION,
        promptVersion: null,
        inputHash: hashOf(clusters.map((c) => [c.id, c.members])),
      },
      async () => {
        await ports.saveClusters(
          clusters.map((c): ClusterRecord => {
            const record: ClusterRecord & { _stats?: unknown; _evidence?: unknown } = { ...c };
            delete record._stats;
            delete record._evidence;
            return record;
          }),
        );
        return { output: { cluster_ids: clusters.map((c) => c.id) } };
      },
    );
    summary.clusters_created = clusters.length;

    const clusterBrief = clusters.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      problem_category: c.problem_category,
      frequency_label: c._stats.frequencyLabel,
      feedback_count: c._stats.feedbackCount,
      distinct_author_count: c._stats.distinctAuthorCount,
      distinct_author_count_status: c._stats.distinctAuthorCountStatus,
      affected_products: c._stats.productDistribution.map((p) => ({
        product_id: p.product_id,
        name: productName.get(p.product_id) ?? null,
        count: p.count,
        relative_frequency: p.relative_frequency,
      })),
      resolution_breakdown: c._stats.resolutionBreakdown,
      evidence_ids: [...new Set(c._evidence)].slice(0, 10),
    }));
    const samples = clusters.flatMap((c) =>
      c.members
        .filter((m) => !m.removed)
        .slice(0, SAMPLE_STATEMENTS)
        .map((m) => ({
          label: `problem of cluster ${c.id}`,
          ref: m.problem_id,
          text: problemById.get(m.problem_id)?.problem_statement ?? "",
        })),
    );
    const clusterIds = new Set(clusters.map((c) => c.id));
    const evidenceIds = new Set(clusters.flatMap((c) => c._evidence));
    const productIds = new Set(visible.map((p) => p.id));

    // ---------------------------------------------------------- P8 gaps
    summary.stage = "identifying_gaps";
    let gaps: GapRecord[] = [];
    if (statisticsOnly) limitations.push({ code: "gaps_and_hypotheses_not_requested" });
    if (clusters.length > 0 && !budgetHit && !statisticsOnly) {
      checkpoint();
      try {
        const step = await ports.step<MarketGapOutput>(
          {
            agentKey: P8_AGENT_KEY,
            stepKey: "gaps",
            contractVersion: MARKET_GAP_CONTRACT_VERSION,
            promptVersion: P8_PROMPT_VERSION,
            inputHash: hashOf(clusterBrief),
          },
          async (stepId) => {
            const res = await ports.gateway.generate(
              {
                agentKey: P8_AGENT_KEY,
                contractVersion: MARKET_GAP_CONTRACT_VERSION,
                promptVersion: P8_PROMPT_VERSION,
                systemInstructions: P8_INSTRUCTIONS,
                untrustedInputs: samples,
                trustedInput: { clusters: clusterBrief },
                schema: MarketGapOutputSchema,
                modelProfile: "reasoning",
                maxOutputTokens: 4000,
                timeoutMs: 120_000,
                maxCostUsd: ports.remainingAiBudgetUsd(),
              },
              ctx(stepId, [
                ...clusterIds,
                ...evidenceIds,
                ...samples.map((s) => s.ref),
                ...productIds,
              ]),
            );
            return { output: res.data, model: modelOf(res) };
          },
        );
        for (const g of step.output.gaps) {
          const cids = g.cluster_ids.filter((id) => clusterIds.has(id));
          const scopeEvidence = new Set(
            clusters.filter((c) => cids.includes(c.id)).flatMap((c) => c._evidence),
          );
          const ev = g.evidence.filter((e) => scopeEvidence.has(e.evidence_id));
          if (cids.length === 0 || ev.length === 0) {
            summary.warnings.push(`gap_dropped_without_scoped_evidence:${g.title.slice(0, 60)}`);
            continue;
          }
          gaps.push({
            id: stableId(run.id, "gap", g.title, ...cids),
            title: g.title,
            gap_type: g.gap_type,
            description: g.description,
            existing_solutions_observed: g.existing_solutions_observed,
            confidence: g.confidence,
            cluster_ids: cids,
            evidence: ev.map((e) => ({ evidence_id: e.evidence_id, support_type: e.support_type })),
          });
        }
      } catch (err) {
        if (isBudget(err)) {
          budgetHit = true;
          summary.warnings.push("ai_budget_exhausted_during_gaps");
        } else if (!isPermanent(err)) throw err;
        else summary.warnings.push("gaps_not_identified");
        gaps = [];
      }
    }
    summary.gaps_identified = gaps.length;

    // ---------------------------------------------------------- P9 opportunities + exclusion
    summary.stage = "generating_opportunities";
    const opportunities: OpportunityRecord[] = [];
    if (clusters.length > 0 && !budgetHit && !statisticsOnly) {
      checkpoint();
      try {
        const step = await ports.step<OpportunityHypothesisOutput>(
          {
            agentKey: P9_AGENT_KEY,
            stepKey: "opportunities",
            contractVersion: OPPORTUNITY_HYPOTHESIS_CONTRACT_VERSION,
            promptVersion: P9_PROMPT_VERSION,
            inputHash: hashOf({ clusterBrief, gaps: gaps.map((g) => g.id) }),
          },
          async (stepId) => {
            const res = await ports.gateway.generate(
              {
                agentKey: P9_AGENT_KEY,
                contractVersion: OPPORTUNITY_HYPOTHESIS_CONTRACT_VERSION,
                promptVersion: P9_PROMPT_VERSION,
                systemInstructions: P9_INSTRUCTIONS,
                untrustedInputs: samples,
                trustedInput: {
                  clusters: clusterBrief,
                  gaps: gaps.map((g) => ({
                    title: g.title,
                    gap_type: g.gap_type,
                    cluster_ids: g.cluster_ids,
                  })),
                  scope_products: visible.map((p) => ({ product_id: p.id, name: p.name })),
                },
                schema: OpportunityHypothesisOutputSchema,
                modelProfile: "reasoning",
                maxOutputTokens: 6000,
                timeoutMs: 120_000,
                maxCostUsd: ports.remainingAiBudgetUsd(),
              },
              ctx(stepId, [
                ...clusterIds,
                ...productIds,
                ...evidenceIds,
                ...samples.map((s) => s.ref),
              ]),
            );
            return { output: res.data, model: modelOf(res) };
          },
        );
        summary.stage = "classifying_exclusion";
        for (const h of step.output.hypotheses) {
          const sources = h.source_cluster_ids.filter((id) => clusterIds.has(id));
          if (sources.length === 0) {
            summary.warnings.push(`hypothesis_dropped_without_cluster:${h.name.slice(0, 60)}`);
            continue;
          }
          // Permanent exclusion (§5.4): deterministic; an LLM flag can only escalate to review.
          const exclusion = classifyExclusion({
            primaryCategorySlugs: [],
            name: h.name,
            tagline: h.value_proposition,
            primaryUseCase: h.primary_use_case,
            secondaryTexts: [h.description, h.proposed_solution, h.problem_statement],
            featureTexts: [],
            llmCorePurposeFlag: h.core_purpose_flag,
          });
          if (exclusion.status === "excluded") {
            summary.hypotheses_excluded++;
            summary.warnings.push(`hypothesis_excluded:${h.name.slice(0, 60)}`);
            continue;
          }
          if (exclusion.status === "needs_review") summary.hypotheses_needs_review++;
          const evidenceProducts = new Set(
            clusters
              .filter((c) => sources.includes(c.id))
              .flatMap((c) => c._stats.productDistribution.map((p) => p.product_id)),
          );
          opportunities.push({
            id: stableId(run.id, "opportunity", h.name, ...sources),
            name: h.name,
            description: h.description,
            problem_statement: h.problem_statement,
            target_persona: h.target_persona,
            proposed_solution: h.proposed_solution,
            value_proposition: h.value_proposition,
            differentiation: h.differentiation,
            business_model_hypothesis: h.business_model_hypothesis,
            pricing_hypothesis: h.pricing_hypothesis,
            technical_feasibility_notes: h.technical_feasibility_notes,
            distribution_hypothesis: h.distribution_hypothesis,
            validation_needed: h.validation_needed,
            exclusion_status: exclusion.status,
            generator_contract_version: OPPORTUNITY_HYPOTHESIS_CONTRACT_VERSION,
            generator_prompt_version: P9_PROMPT_VERSION,
            cluster_ids: sources,
            products: [
              ...[...evidenceProducts].map((id) => ({
                product_id: id,
                role: "evidence_source" as const,
              })),
              ...h.existing_competitor_product_ids
                .filter((id) => productIds.has(id))
                .map((id) => ({ product_id: id, role: "existing_competitor" as const })),
            ],
          });
        }
      } catch (err) {
        if (isBudget(err)) {
          budgetHit = true;
          summary.warnings.push("ai_budget_exhausted_during_opportunities");
        } else if (!isPermanent(err)) throw err;
        else summary.warnings.push("opportunities_not_generated");
      }
    }

    // ---------------------------------------------------------- persisting
    summary.stage = "persisting";
    checkpoint();
    await ports.step(
      {
        agentKey: "P9_persist",
        stepKey: "persist-insights",
        contractVersion: OPPORTUNITY_HYPOTHESIS_CONTRACT_VERSION,
        promptVersion: null,
        inputHash: hashOf({ g: gaps.map((g) => g.id), o: opportunities.map((o) => o.id) }),
      },
      async () => {
        await ports.saveInsights(gaps, opportunities);
        return { output: { gaps: gaps.length, opportunities: opportunities.length } };
      },
    );
    summary.opportunities_generated = opportunities.length;
    if (budgetHit) limitations.push({ code: "ai_budget_exhausted" });
    await ports.updateRun({
      feedback_considered: summary.feedback_considered,
      problems_extracted: summary.problems_extracted + summary.problems_reused,
      clusters_created: summary.clusters_created,
      opportunities_generated: summary.opportunities_generated,
      algorithm_version: CLUSTER_ALGORITHM_VERSION,
      sources_report: [
        {
          source: "customer_feedback",
          considered: summary.feedback_considered,
          without_stored_text: summary.feedback_without_text,
          near_duplicates: summary.near_duplicates,
          isolated_complaints: summary.isolated_complaints,
          hypotheses_excluded: summary.hypotheses_excluded,
        },
      ],
      limitations,
    });
    summary.stage = "completed";
    const partial = budgetHit || summary.extraction_failures > 0;
    return {
      state: partial ? "partial" : "completed",
      terminalReason: budgetHit ? "budget_exhausted" : partial ? "partial" : "completed",
      summary,
    };
  } catch (err) {
    if (err instanceof StopSignal) {
      await ports.updateRun({
        limitations: [...limitations, { code: `stopped_${err.reason}`, stage: summary.stage }],
      });
      return err.reason === "cancelled"
        ? { state: "cancelled", terminalReason: "cancelled", summary }
        : { state: "partial", terminalReason: "budget_exhausted", summary };
    }
    throw err;
  }
}
