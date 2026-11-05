// Ports of the opportunity_analysis pipeline (Implementation Blueprint §8.1).
// The worker implements them with @sor/database; the engine stays testable
// with in-memory ports. Engines exchange only persisted artifacts: customer
// voice clusters come from the Pain Point Engine through `customerVoice()`.
import type { AIGateway, UsageRecord } from "@sor/ai-gateway";
import type { IndexedEvidence } from "@sor/domain";

export interface StepMeta {
  agentKey: string;
  stepKey: string;
  contractVersion: string;
  promptVersion: string | null;
  inputHash: string;
}

export interface StepRunResult<T> {
  output: T;
  warnings?: string[];
  model?: {
    provider: string;
    name: string;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
    latencyMs?: number;
  };
}

export interface StepRecord<T> {
  output: T;
  stepId: string;
  reused: boolean;
}

export type ScopeRole =
  | "subject"
  | "set_member"
  | "category_member"
  | "cluster_product"
  | "opportunity_source"
  | "competitor";

export interface ScopeProduct {
  id: string;
  name: string;
  slug: string;
  role: ScopeRole;
  /** Still active and eligible now (the scope was frozen at request time). */
  visible: boolean;
  websiteUrl: string | null;
  primaryCategorySlugs: string[];
}

export interface AnalysisContext {
  id: string;
  workspaceId: string;
  subjectType:
    "product" | "product_set" | "category" | "pain_point_cluster" | "generated_opportunity";
  subjectSnapshot: Record<string, unknown>;
  depth: "quick" | "standard" | "deep";
  targetMarket: string;
  context: Record<string, unknown>;
  options: {
    analyze_competitors: boolean;
    analyze_customer_reviews: boolean;
    analyze_local_market: boolean;
    generate_validation_plan: boolean;
  };
  thresholds: { minScore: number; minWtp: number };
  scope: ScopeProduct[];
}

/** A candidate evidence item of the scope, with what agents may see of it. */
export interface CandidateEvidence extends IndexedEvidence {
  productId: string | null;
  companyId: string | null;
  categoryId: string | null;
  claimType: string;
  /** Untrusted text extracted from a source. */
  claimText: string;
  evidenceType: string;
  factStatus: string;
  sourceUrl: string | null;
  sourceName: string | null;
}

/** Customer voice from persisted Pain Point clusters (deterministic P7 statistics). */
export interface VoiceCluster {
  clusterId: string;
  name: string;
  problemCategory: string;
  frequencyLabel: string;
  feedbackCount: number;
  affectedProductCount: number;
  distinctAuthorCount: number | null;
  distinctAuthorCountStatus: string;
  distinctCompanyCount: number | null;
  distinctCompanyCountStatus: string;
  productDistribution: Array<{ product_id: string; feedback_count: number }>;
  resolutionBreakdown: Record<string, number>;
  workarounds: string[];
  /** Evidence items of the cluster's feedback (in the analysis scope). */
  evidenceIds: string[];
}

export interface CustomerVoiceData {
  /** The pain point run the clusters come from (reused or run for this analysis). */
  runId: string | null;
  reusedRun: boolean;
  clusters: VoiceCluster[];
  relevantSourceCount: number;
  distinctAuthorCount: number | null;
  limitations: Array<Record<string, unknown>>;
}

export interface DimensionRow {
  dimension_key: string;
  assessment_status: "assessed" | "insufficient_evidence";
  rating: number | null;
  explanation: string;
  missing_information: string[];
  proposed_by_step_id: string | null;
  evidence: Array<{ evidence_id: string; support_type: string }>;
}

export interface FindingRow {
  id: string;
  finding_type: string;
  title: string;
  description: string;
  priority: number;
  confidence: number;
  is_hypothesis: boolean;
  severity: "critical" | "major" | "minor" | null;
  is_substantiated: boolean | null;
  dimension_key: string | null;
  source_agent: string;
  recommendation: string | null;
  evidence: Array<{ evidence_id: string; support_type: string; relevance_score?: number }>;
}

/** Payload of the final atomic write (public.sor_analysis_finalize). */
export interface FinalResult {
  dimensions: DimensionRow[];
  findings: FindingRow[];
  score: {
    score_total: number | null;
    provisional_points: number;
    score_coverage: number;
    willingness_to_pay_score: number | null;
    confidence_score: number;
    decision_band: string | null;
  };
  verdict: "build_candidate" | "validate_first" | "reject";
  verdict_reasons: unknown[];
  executive_summary: string;
  report: Record<string, unknown>;
  limitations: Array<Record<string, unknown>>;
}

export interface OpportunityPorts {
  loadAnalysis(): Promise<AnalysisContext>;
  /** Visible evidence of the scope products, their companies and categories (never rejected). */
  loadCandidateEvidence(): Promise<CandidateEvidence[]>;
  /** Adds evidence to the analysis evidence index (the database checks the scope). */
  addToIndex(stepId: string | null, evidenceIds: string[]): Promise<void>;
  /** Clusters of the Pain Point Engine covering the scope (reused, or run P1–P7 for it). */
  customerVoice(): Promise<CustomerVoiceData>;
  /** Evidence metadata for IDs outside the candidate list (cluster feedback evidence). */
  loadEvidence(ids: string[]): Promise<CandidateEvidence[]>;
  finalize(result: FinalResult): Promise<void>;
  markNeedsReview(limitations: Array<Record<string, unknown>>): Promise<void>;
  /** Runs a step once per (job, agent, step); a completed step with the same input hash is reused. */
  step<T>(
    meta: StepMeta,
    run: (stepId: string) => Promise<StepRunResult<T>>,
  ): Promise<StepRecord<T>>;
  gateway: AIGateway;
  remainingAiBudgetUsd(): number;
  recordUsage(stepId: string | null, usage: UsageRecord): Promise<void>;
  /** Checked between steps (cancellation, wall-clock budget). */
  stopReason(): "cancelled" | "budget" | null;
  now(): Date;
  signal: AbortSignal;
}

export type AnalysisStage =
  | "resolving_subject"
  | "building_evidence_index"
  | "product_research"
  | "market_research"
  | "customer_voice"
  | "competitor_research"
  | "localization"
  | "feasibility_wtp"
  | "dimension_assessment"
  | "scoring"
  | "red_team"
  | "verdict"
  | "report"
  | "completed";

export interface AnalysisSummary {
  stage: AnalysisStage;
  evidence_indexed: number;
  agents_failed: string[];
  provider: string | null;
  warnings: string[];
}

export interface AnalysisOutcome {
  state: "completed" | "partial" | "cancelled";
  terminalReason: "completed" | "partial" | "cancelled" | "budget_exhausted";
  needsReview: boolean;
  summary: AnalysisSummary;
}
