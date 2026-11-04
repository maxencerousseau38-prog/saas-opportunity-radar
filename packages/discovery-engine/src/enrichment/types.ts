// Ports of the product_enrichment pipeline (D5 Enrichment + D6 Evidence
// Verifier, Implementation Blueprint §6.6–6.7). The worker implements them
// with @sor/database and @sor/data-sources; the engine stays testable.
import type { SourceDocument } from "@sor/contracts";
import type { ConnectorOutcome } from "@sor/data-sources";
import type { AIGateway, UsageRecord } from "@sor/ai-gateway";

export interface FetchedSnapshot {
  snapshot_id: string;
  url: string;
  title: string | null;
  text: string;
  retrieved_at: string;
  published_at: string | null;
  links: string[];
}

export interface ProductContext {
  id: string;
  name: string;
  website_url: string;
  company_id: string | null;
  primary_category_slugs: string[];
  tagline: string | null;
  short_description: string | null;
  description: string | null;
}

/** The currently selected claim of a field (from catalog_field_provenance). */
export interface ExistingClaim {
  field_key: string;
  value: unknown;
  evidence_id: string;
  verification_status: "unverified" | "verified" | "needs_review" | "rejected" | "stale";
  fact_status: "confirmed" | "estimated" | "declared" | "unknown";
  reliability_level: 1 | 2 | 3 | 4;
  observed_at: string;
}

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

export interface EnrichmentPorts {
  loadProduct(): Promise<ProductContext>;
  loadExistingClaims(): Promise<ExistingClaim[]>;
  /** Runs a step once per (job, agent, step); a completed step with the same input hash is reused. */
  step<T>(
    meta: StepMeta,
    run: (stepId: string) => Promise<StepRunResult<T>>,
  ): Promise<StepRecord<T>>;
  fetchDocument(url: string): Promise<ConnectorOutcome<SourceDocument>>;
  recordSnapshot(doc: SourceDocument): Promise<string>;
  applyPlan(
    stepId: string,
    plan: EnrichmentPlan,
  ): Promise<{ status: string; evidence_count?: number }>;
  gateway: AIGateway;
  remainingAiBudgetUsd(): number;
  recordUsage(stepId: string, usage: UsageRecord): Promise<void>;
  /** Checked between steps (heartbeat-surfaced cancellation, wall-clock budget). */
  stopReason(): "cancelled" | "budget" | null;
  maxPages: number;
  maxAgeDays: number;
  now(): Date;
  signal: AbortSignal;
}

export interface PlanEvidence {
  key: string;
  company_scope: boolean;
  source_snapshot_id: string;
  claim_type: string;
  claim_text: string;
  claim_value: Record<string, unknown>;
  evidence_type: "official_statement" | "pricing_evidence";
  fact_status: "confirmed" | "estimated" | "declared";
  monetization_signal: string | null;
  reliability_level: 1;
  verification_status: "verified" | "needs_review" | "stale";
  verified_at: string | null;
  published_at: string | null;
  observed_at: string;
}

export interface EnrichmentPlan {
  evidence: PlanEvidence[];
  product_fields: Record<string, { value: unknown; evidence_key: string; fact_status: string }>;
  company_fields: Record<string, { value: unknown; evidence_key: string; fact_status: string }>;
  features: Array<{
    name: string;
    is_primary: boolean;
    availability: "available";
    evidence_key: string;
  }>;
  integrations: Array<{
    name: string;
    integration_category: string;
    availability: "available";
    evidence_key: string;
  }>;
  pricing_plans: Array<Record<string, unknown> & { evidence_key: string }>;
  conflicts: Array<{ field_key: string; a?: string; a_id?: string; b?: string; b_id?: string }>;
  exclusion: {
    status: string;
    rule_set_version: string;
    matched_rules: unknown[];
    incidental_mentions: unknown[];
  };
}

export interface EnrichmentSummary {
  pages_fetched: number;
  pages_failed: Array<{ url: string; status: string; reason: string }>;
  claims_proposed: number;
  verified: number;
  needs_review: number;
  rejected: number;
  stale: number;
  fields_updated: string[];
  unknown_fields: string[];
  conflicts: number;
  exclusion_status: string | null;
  provider: string | null;
  warnings: string[];
}

export interface EnrichmentOutcome {
  state: "completed" | "partial" | "cancelled";
  terminalReason: "completed" | "partial" | "cancelled" | "budget_exhausted";
  summary: EnrichmentSummary;
}
