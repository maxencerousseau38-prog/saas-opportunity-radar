// Final report document (Implementation Blueprint §8.10, §9.7; PRD §9) and
// its Markdown export (PD-18 A). The composer's narrative is wrapped with the
// blocks only the server writes: scoring, verdict, reliability, deterministic
// customer-voice statistics, competitor matrix and the evidence index.
import type {
  AnalysisReport,
  CompetitorAnalysis,
  CustomerVoice,
  Localization,
  MarketAnalysis,
  ProductAnalysis,
  RedTeam,
  WtpFeasibility,
} from "@sor/contracts";
import {
  DIMENSIONS,
  confidenceLevel,
  type ScoreResult,
  type ValidatedProposal,
  type VerdictResult,
} from "@sor/domain";
import type { AnalysisContext, CandidateEvidence, CustomerVoiceData, FindingRow } from "./types";

export const REPORT_SCHEMA_VERSION = "analysis-report.v1";

export interface ReportInput {
  analysis: AnalysisContext;
  simulated: boolean;
  score: ScoreResult;
  verdict: VerdictResult;
  dimensions: ValidatedProposal[];
  findings: FindingRow[];
  index: CandidateEvidence[];
  product: ProductAnalysis | null;
  market: MarketAnalysis | null;
  voice: CustomerVoice | null;
  voiceData: CustomerVoiceData | null;
  competitors: CompetitorAnalysis | null;
  localization: Localization | null;
  wtp: WtpFeasibility | null;
  red: RedTeam | null;
  composed: AnalysisReport | null;
  recommendationStatus: "eligible" | "excluded" | "needs_review" | "none";
  limitations: Array<Record<string, unknown>>;
  now: Date;
}

function median(values: string[]): string | null {
  if (values.length === 0) return null;
  const s = [...values].sort();
  return s[Math.floor((s.length - 1) / 2)] ?? null;
}

/** §9.7 "Scoring reliability" block. */
export function reliabilityBlock(
  index: CandidateEvidence[],
  dimensions: ValidatedProposal[],
): Record<string, unknown> {
  const dates = index.map((e) => (e.publishedAt ?? e.observedAt).slice(0, 10));
  const count = (f: (e: CandidateEvidence) => boolean) => index.filter(f).length;
  return {
    sources_used: new Set(index.map((e) => e.sourceRecordId)).size,
    evidence_items: index.length,
    reliability_levels: {
      level_1: count((e) => e.reliabilityLevel === 1),
      level_2: count((e) => e.reliabilityLevel === 2),
      level_3: count((e) => e.reliabilityLevel === 3),
      level_4: count((e) => e.reliabilityLevel === 4),
    },
    information_age: { oldest: dates.length ? [...dates].sort()[0] : null, median: median(dates) },
    fact_status: {
      confirmed: count((e) => e.factStatus === "confirmed"),
      estimated: count((e) => e.factStatus === "estimated"),
      declared: count((e) => e.factStatus === "declared"),
      unknown: count((e) => e.factStatus === "unknown"),
    },
    verified_evidence: count((e) => e.verificationStatus === "verified"),
    missing_information: dimensions
      .filter((d) => d.missingInformation.length > 0)
      .map((d) => ({ dimension_key: d.key, items: d.missingInformation })),
    open_disagreements: count((e) => e.inOpenConflict),
  };
}

export function assembleReport(i: ReportInput): Record<string, unknown> {
  const wtpCounts: Record<string, number> = {};
  for (const w of i.wtp?.wtp_evidence ?? []) wtpCounts[w.category] = w.evidence.length;
  return {
    schema_version: REPORT_SCHEMA_VERSION,
    // Data produced by the simulated provider is never presented as real (CLAUDE.md §12).
    simulated: i.simulated,
    subject: { type: i.analysis.subjectType, snapshot: i.analysis.subjectSnapshot },
    target_market: i.analysis.targetMarket,
    scoring: {
      rules_version: "scoring-1",
      score_total: i.score.scoreTotal,
      provisional_points: i.score.provisionalPoints,
      coverage: i.score.coverage,
      willingness_to_pay_score: i.score.wtpScore,
      confidence: i.score.confidence,
      confidence_level: confidenceLevel(i.score.confidence),
      decision_band: i.score.band,
      verdict: i.verdict.verdict,
      verdict_reasons: i.verdict.reasons,
      thresholds: i.analysis.thresholds,
      dimensions: i.dimensions.map((d) => ({
        dimension_key: d.key,
        weight: DIMENSIONS[d.key],
        assessment_status: d.status,
        rating: d.rating,
        weighted_points: d.rating === null ? null : (d.rating / 5) * DIMENSIONS[d.key],
        explanation: d.explanation,
        missing_information: d.missingInformation,
        evidence: d.evidence,
      })),
    },
    reliability: reliabilityBlock(i.index, i.dimensions),
    narrative: i.composed,
    recommended_product_status: i.recommendationStatus,
    product_analysis: i.product,
    market_analysis: i.market,
    customer_voice: i.voice
      ? {
          ...i.voice,
          pain_point_run_id: i.voiceData?.runId ?? null,
          reused_pain_point_run: i.voiceData?.reusedRun ?? false,
          clusters: (i.voiceData?.clusters ?? []).map((c) => ({
            cluster_id: c.clusterId,
            name: c.name,
            problem_category: c.problemCategory,
            frequency_label: c.frequencyLabel,
            feedback_count: c.feedbackCount,
            affected_product_count: c.affectedProductCount,
            distinct_author_count: c.distinctAuthorCount,
            distinct_author_count_status: c.distinctAuthorCountStatus,
            distinct_company_count: c.distinctCompanyCount,
            distinct_company_count_status: c.distinctCompanyCountStatus,
            product_distribution: c.productDistribution,
            resolution_breakdown: c.resolutionBreakdown,
            workarounds: c.workarounds,
          })),
        }
      : null,
    competitor_analysis: i.competitors,
    localization: i.localization,
    wtp_feasibility: i.wtp ? { ...i.wtp, evidence_count_by_category: wtpCounts } : null,
    red_team: i.red,
    findings: i.findings.map((f) => ({
      id: f.id,
      type: f.finding_type,
      title: f.title,
      description: f.description,
      is_hypothesis: f.is_hypothesis,
      severity: f.severity,
      is_substantiated: f.is_substantiated,
      source_agent: f.source_agent,
      evidence: f.evidence,
    })),
    evidence_index: i.index.map((e) => ({
      evidence_id: e.evidenceId,
      product_id: e.productId,
      claim_type: e.claimType,
      claim_text: e.claimText.slice(0, 500),
      evidence_type: e.evidenceType,
      fact_status: e.factStatus,
      reliability_level: e.reliabilityLevel,
      verification_status: e.verificationStatus,
      monetization_signal: e.monetizationSignal,
      published_at: e.publishedAt,
      observed_at: e.observedAt,
      source_url: e.sourceUrl,
      source_name: e.sourceName,
    })),
    limitations: i.limitations,
    generated_at: i.now.toISOString(),
  };
}

const VERDICT_FR = {
  build_candidate: "BUILD CANDIDATE",
  validate_first: "VALIDATE FIRST",
  reject: "REJECT",
} as const;
const BAND_FR: Record<string, string> = {
  reject: "Rejeter",
  low_potential: "Faible potentiel",
  to_investigate: "À approfondir",
  interesting: "Intéressant",
  priority: "Prioritaire",
};
const LEVEL_FR = { low: "faible", medium: "moyenne", high: "élevée" } as const;

/** §9.7 score line: complete score, or provisional points with coverage (never "/100"). */
export function scoreLine(score: {
  scoreTotal: number | null;
  provisionalPoints: number;
  coverage: number;
  wtpScore: number | null;
  confidence: number;
  band: string | null;
}): string {
  const head =
    score.scoreTotal !== null
      ? `${score.scoreTotal} / 100 · Bande : ${BAND_FR[score.band ?? ""] ?? "—"}`
      : `Provisoire : ${score.provisionalPoints} points sur ${score.coverage} % de couverture`;
  const wtp = score.wtpScore === null ? "WTP non évalué" : `WTP ${score.wtpScore} / 15`;
  return `${head} · ${wtp} · Confiance ${score.confidence} (${LEVEL_FR[confidenceLevel(score.confidence)]})`;
}

export function executiveSummaryText(
  analysis: AnalysisContext,
  composed: AnalysisReport | null,
  score: ScoreResult,
  verdict: VerdictResult,
): string {
  const prefix = composed?.executive_summary.description.text ?? subjectName(analysis);
  return `${prefix.slice(0, 1500)} — ${scoreLine(score)} · ${VERDICT_FR[verdict.verdict]}`;
}

export function subjectName(analysis: Pick<AnalysisContext, "subjectSnapshot">): string {
  const s = analysis.subjectSnapshot as Record<string, Record<string, unknown> | unknown>;
  const pick = (k: string) => (s[k] as Record<string, unknown> | undefined)?.name;
  const products = s.products as Array<{ name: string }> | undefined;
  return String(
    pick("product") ??
      pick("category") ??
      pick("cluster") ??
      pick("generated_opportunity") ??
      (products ? products.map((p) => p.name).join(", ") : "Analyse"),
  );
}

// ---------------------------------------------------------------- Markdown
type Stmt = { text: string; is_hypothesis: boolean; evidence?: Array<{ evidence_id: string }> };
const ref = (s: Stmt) =>
  s.is_hypothesis
    ? " _(hypothèse)_"
    : ` _(preuves : ${(s.evidence ?? []).map((e) => e.evidence_id.slice(0, 8)).join(", ")})_`;
const lines = (title: string, items: Stmt[] | null | undefined) =>
  items && items.length > 0
    ? [`**${title}**`, ...items.map((s) => `- ${s.text}${ref(s)}`), ""]
    : [];

/** Markdown rendering of a stored report (export, PD-18 A). */
export function renderMarkdown(report: Record<string, unknown>, title: string): string {
  const r = report as {
    simulated?: boolean;
    scoring: {
      score_total: number | null;
      provisional_points: number;
      coverage: number;
      willingness_to_pay_score: number | null;
      confidence: number;
      decision_band: string | null;
      verdict: keyof typeof VERDICT_FR;
      verdict_reasons: Array<{ code: string; result: string }>;
      dimensions: Array<{
        dimension_key: string;
        weight: number;
        assessment_status: string;
        rating: number | null;
        weighted_points: number | null;
        missing_information: string[];
      }>;
    };
    reliability: Record<string, unknown>;
    narrative: AnalysisReport | null;
    customer_voice: {
      clusters?: Array<Record<string, unknown>>;
      sample_limitations?: string[];
    } | null;
    competitor_analysis: CompetitorAnalysis | null;
    red_team: RedTeam | null;
    findings: Array<{
      type: string;
      title: string;
      severity: string | null;
      is_substantiated: boolean | null;
    }>;
    evidence_index: Array<{
      evidence_id: string;
      claim_type: string;
      claim_text: string;
      source_url: string | null;
      reliability_level: number;
      verification_status: string;
    }>;
    limitations: Array<Record<string, unknown>>;
    generated_at: string;
  };
  const s = r.scoring;
  const n = r.narrative;
  const out: string[] = [`# ${title}`, ""];
  if (r.simulated)
    out.push(
      "> **Données simulées** : ce rapport a été produit par un fournisseur IA fictif (tests et démonstration). Ce n’est pas un résultat réel.",
      "",
    );
  out.push(
    "## Executive Summary",
    "",
    `**${scoreLine({
      scoreTotal: s.score_total,
      provisionalPoints: s.provisional_points,
      coverage: s.coverage,
      wtpScore: s.willingness_to_pay_score,
      confidence: s.confidence,
      band: s.decision_band,
    })} · ${VERDICT_FR[s.verdict]}**`,
    "",
  );
  if (n) {
    out.push(`${n.executive_summary.description.text}${ref(n.executive_summary.description)}`, "");
    out.push(...lines("Raisons principales", n.executive_summary.main_reasons));
  }
  out.push(
    "## Score par dimension",
    "",
    "| Dimension | Poids | Statut | Note | Points |",
    "|---|---:|---|---:|---:|",
  );
  for (const d of s.dimensions)
    out.push(
      `| ${d.dimension_key} | ${d.weight} | ${d.assessment_status === "assessed" ? "évaluée" : "preuves insuffisantes"} | ${d.rating ?? "—"} | ${d.weighted_points ?? "—"} |`,
    );
  out.push(
    "",
    "**Règles du verdict**",
    ...s.verdict_reasons.map((x) => `- ${x.code} : ${x.result}`),
    "",
  );
  out.push(
    "## Fiabilité du score",
    "",
    "```json",
    JSON.stringify(r.reliability, null, 2),
    "```",
    "",
  );
  if (n) {
    out.push("## Market Analysis", "");
    out.push(
      ...lines("Marché", n.market_analysis.market),
      ...lines("Cible", n.market_analysis.target),
    );
    out.push(
      ...lines("Demande", n.market_analysis.demand),
      ...lines("Tendances", n.market_analysis.trends),
    );
    out.push(...lines("Concurrence", n.market_analysis.competition));
    out.push("## Customer Pain Analysis", "", ...lines("Synthèse", n.customer_pain.narrative));
  }
  if (r.customer_voice?.clusters?.length) {
    out.push(
      "## Cross-Competitor Pain Analysis",
      "",
      "| Cluster | Retours | SaaS | Auteurs distincts | Entreprises distinctes |",
      "|---|---:|---:|---:|---:|",
    );
    for (const c of r.customer_voice.clusters)
      out.push(
        `| ${String(c.name)} | ${String(c.feedback_count)} | ${String(c.affected_product_count)} | ${c.distinct_author_count ?? "inconnu"} (${String(c.distinct_author_count_status)}) | ${c.distinct_company_count ?? "inconnu"} (${String(c.distinct_company_count_status)}) |`,
      );
    out.push("", ...(r.customer_voice.sample_limitations ?? []).map((x) => `- Limite : ${x}`), "");
  }
  if (n) {
    out.push("## Market Gap Analysis", "");
    out.push(...lines("Problèmes communs", n.market_gaps.common_problems));
    out.push(...lines("Besoins mal satisfaits", n.market_gaps.unmet_needs));
    out.push(...lines("Raisons d’échec possibles", n.market_gaps.failure_reasons));
  }
  if (r.competitor_analysis) {
    out.push(
      "## Competitor Analysis",
      "",
      "| Concurrent | Relation | Confiance |",
      "|---|---|---:|",
    );
    for (const c of r.competitor_analysis.competitors)
      out.push(`| ${c.name} | ${c.relationship_type} | ${c.confidence} |`);
    out.push(
      "",
      `Produits exclus ou non visibles omis : ${r.competitor_analysis.omitted_excluded_count}`,
      "",
    );
  }
  if (n) {
    if (n.opportunity_map.length > 0) {
      out.push("## Opportunity Map", "");
      for (const o of n.opportunity_map)
        out.push(
          `${o.priority}. ${o.problem} → ${o.proposed_solution} (${o.customer_segment})${o.is_hypothesis ? " _(hypothèse)_" : ""}`,
        );
      out.push("");
    }
    if (n.recommended_product) {
      const p = n.recommended_product;
      out.push(
        "## Recommended Product _(hypothèse)_",
        "",
        `**${p.name}** — ${p.value_proposition}`,
        "",
      );
      out.push(`- Cible initiale : ${p.initial_target}`, `- Positionnement : ${p.positioning}`);
      out.push(
        `- MVP : ${p.mvp_features.join(" ; ")}`,
        `- Pricing hypothétique : ${p.pricing_hypothesis}`,
        "",
      );
    }
    if (n.validation_plan.length > 0) {
      out.push("## Validation Plan", "");
      for (const v of n.validation_plan)
        out.push(
          `- **${v.type}** : ${v.description} — réussite : ${v.success_threshold} ; abandon : ${v.abandon_threshold}`,
        );
      out.push("");
    }
    out.push("## Risks & Kill Criteria", "");
    out.push(...lines("Raisons de ne pas construire", n.risks.reasons_not_to_build));
  }
  for (const f of r.findings.filter((x) => x.type === "kill_criterion"))
    out.push(
      `- Kill criterion (${f.severity}, ${f.is_substantiated ? "fondé" : "non fondé"}) : ${f.title}`,
    );
  out.push("", "## Final Verdict", "", `**${VERDICT_FR[s.verdict]}**`, "");
  if (n) out.push(...lines("Explication", n.final_verdict_explanation));
  out.push("## Evidence Index", "");
  for (const e of r.evidence_index)
    out.push(
      `- \`${e.evidence_id.slice(0, 8)}\` ${e.claim_type} (fiabilité ${e.reliability_level}, ${e.verification_status}) : ${e.claim_text.replace(/\s+/g, " ").slice(0, 200)}${e.source_url ? ` — ${e.source_url}` : ""}`,
    );
  out.push("", "## Limites", "", ...r.limitations.map((l) => `- ${JSON.stringify(l)}`));
  out.push(
    "",
    `_Généré le ${r.generated_at}. Les scores et le verdict sont calculés par le serveur (règles scoring-1)._`,
    "",
  );
  return out.join("\n");
}
