// Ports of the pain_point_run pipeline (Implementation Blueprint §7.1). The
// worker implements them with @sor/database; the engine stays testable with
// in-memory ports.
import type { AIGateway, UsageRecord } from "@sor/ai-gateway";
import type { ExtractedProblem, ProblemCategory } from "@sor/contracts";
import type { QualityEvidence } from "@sor/domain";

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

export interface RunContext {
  id: string;
  workspaceId: string;
  title: string;
  maxFeedbackItems: number;
  products: Array<{
    id: string;
    name: string;
    /** Still active and eligible now (the scope was frozen at request time). */
    visible: boolean;
    totalKnownReviewCount: number | null;
  }>;
}

export interface FeedbackItem {
  id: string;
  productId: string;
  /** Stored text (full or excerpt); null when only a reference may be kept. */
  text: string | null;
  publishedAt: string | null;
  authorReferenceHash: string | null;
  authorCompanyReference: string | null;
  isNearDuplicateOf: string | null;
  evidenceId: string;
  evidence: QualityEvidence;
}

export interface StoredProblem extends ExtractedProblem {
  id: string;
  feedbackId: string;
  productId: string;
}

export interface ClusterRecord {
  id: string;
  name: string;
  description: string;
  problem_category: ProblemCategory;
  target_persona: string | null;
  algorithm_version: string;
  existing_solutions: unknown[];
  members: Array<{
    problem_id: string;
    membership_source: "algorithm" | "verifier";
    membership_confidence: number | null;
    relevance_score: number | null;
    removed?: boolean;
  }>;
  stats: Record<string, unknown>;
}

export interface GapRecord {
  id: string;
  title: string;
  gap_type: string;
  description: string;
  existing_solutions_observed: string[];
  confidence: number;
  cluster_ids: string[];
  evidence: Array<{ evidence_id: string; support_type: string }>;
}

export interface OpportunityRecord {
  id: string;
  name: string;
  description: string;
  problem_statement: string;
  target_persona: string;
  proposed_solution: string;
  value_proposition: string;
  differentiation: string;
  business_model_hypothesis: string | null;
  pricing_hypothesis: string | null;
  technical_feasibility_notes: string | null;
  distribution_hypothesis: string | null;
  validation_needed: string;
  exclusion_status: "eligible" | "needs_review";
  generator_contract_version: string;
  generator_prompt_version: string;
  cluster_ids: string[];
  products: Array<{ product_id: string; role: "evidence_source" | "existing_competitor" }>;
}

export interface RunPatch {
  feedback_considered?: number;
  problems_extracted?: number;
  clusters_created?: number;
  opportunities_generated?: number;
  algorithm_version?: string;
  sources_report?: unknown[];
  limitations?: unknown[];
}

export interface PainPorts {
  loadRun(): Promise<RunContext>;
  /** P1: feedback stored for the given products, most recent first, at most `limit`. */
  loadFeedback(productIds: string[], limit: number): Promise<FeedbackItem[]>;
  markDuplicates(pairs: Array<{ feedback_id: string; duplicate_of: string }>): Promise<void>;
  /**
   * Problems already extracted for this feedback with this extractor version
   * (any earlier run); `null` when it was never extracted.
   */
  existingProblems(
    feedbackId: string,
    contractVersion: string,
    promptVersion: string,
  ): Promise<StoredProblem[] | null>;
  saveProblems(
    feedbackId: string,
    stepId: string,
    contractVersion: string,
    promptVersion: string,
    problems: ExtractedProblem[],
  ): Promise<StoredProblem[]>;
  loadEmbeddings(problemIds: string[], model: string): Promise<Map<string, number[]>>;
  saveEmbeddings(
    rows: Array<{ problem_id: string; model: string; vector: number[] }>,
  ): Promise<void>;
  saveClusters(clusters: ClusterRecord[]): Promise<void>;
  saveInsights(gaps: GapRecord[], opportunities: OpportunityRecord[]): Promise<void>;
  updateRun(patch: RunPatch): Promise<void>;
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

export type PainStage =
  | "collecting"
  | "normalizing"
  | "extracting"
  | "embedding"
  | "clustering"
  | "verifying"
  | "computing_statistics"
  | "identifying_gaps"
  | "generating_opportunities"
  | "classifying_exclusion"
  | "persisting"
  | "completed";

export interface PainSummary {
  stage: PainStage;
  feedback_considered: number;
  feedback_without_text: number;
  near_duplicates: number;
  problems_extracted: number;
  problems_reused: number;
  isolated_complaints: number;
  clusters_created: number;
  gaps_identified: number;
  opportunities_generated: number;
  hypotheses_excluded: number;
  hypotheses_needs_review: number;
  extraction_failures: number;
  injection_suspected: number;
  provider: string | null;
  warnings: string[];
}

export interface PainOutcome {
  state: "completed" | "partial" | "cancelled";
  terminalReason: "completed" | "partial" | "cancelled" | "budget_exhausted";
  summary: PainSummary;
}
