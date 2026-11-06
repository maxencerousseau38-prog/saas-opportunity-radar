// Ports of the discovery_run pipeline (Implementation Blueprint §6.1–6.8).
// The worker implements them with @sor/database and @sor/data-sources; the
// engine stays testable with in-memory ports and the fake provider.
import type {
  CatalogFilters,
  DiscoveryChannels,
  DiscoveryDepth,
  DiscoveryLead,
  SourceDocument,
  SourceReportEntry,
  SourceStoragePolicy,
} from "@sor/contracts";
import type { ConnectorOutcome, SourceConnector } from "@sor/data-sources";
import type { AIGateway, UsageRecord } from "@sor/ai-gateway";
import type { FitFacts, IdentityCandidate, IdentityLookup } from "@sor/domain";
import type { StepMeta, StepRecord, StepRunResult } from "../enrichment/types";

export interface DiscoveryRunInput {
  id: string;
  title: string;
  prompt: string;
  explicitFilters: CatalogFilters;
  channels: DiscoveryChannels;
  depth: DiscoveryDepth;
  maxResults: number;
}

/** State of a discovery source in the registry (the `sources` row is the gate). */
export interface SourceState {
  sourceKey: string;
  /** integration_status = 'integrated' and is_enabled. */
  enabled: boolean;
  termsUrl: string | null;
  storagePolicy: SourceStoragePolicy;
}

/** A visible catalog product used as a rebound seed. */
export interface SeedProduct {
  id: string;
  name: string;
  websiteUrl: string;
}

export type DiscoveryStageName =
  | "planning"
  | "searching"
  | "extracting"
  | "resolving_identity"
  | "enriching"
  | "verifying"
  | "classifying_exclusion"
  | "filtering"
  | "ranking"
  | "persisting";

/** Payload of `sor_discovery_upsert_candidate` (M8). */
export interface CandidatePayload {
  identity: {
    outcome: "new" | "matched_existing" | "needs_review";
    product_id?: string;
    company_id?: string | null;
    possible_duplicate_of_product_id?: string | null;
  };
  snapshot_id: string;
  product: {
    name: string;
    canonical_url: string | null;
    domain: string | null;
    tagline: string | null;
    description: string | null;
    company_name: string | null;
    country_code: string | null;
    employee_min: number | null;
    employee_max: number | null;
    founder_led: boolean | null;
    category_slugs: string[];
  };
  exclusion: {
    status: "eligible" | "excluded" | "needs_review";
    rule_set_version: string;
    matched_rules: unknown[];
    incidental_mentions: unknown[];
  };
  fit: {
    rules_version: string;
    fit_score: number | null;
    fit_coverage: number | null;
    breakdown: Record<string, unknown>;
    missing_information: string[];
  };
  confidence_score: number;
  recommendation_reason: string;
  review_status: "pending" | "rejected";
  rejection_reason: string | null;
  provenance: Array<Record<string, unknown>>;
}

export interface CandidateWriteResult {
  candidate_id: string;
  product_id: string;
  identity_decision: "new" | "matched_existing" | "needs_review";
  is_new_to_catalog: boolean;
  exclusion_status: "eligible" | "excluded" | "needs_review";
  review_status: "pending" | "rejected" | "needs_review";
}

export interface RunSummaryPayload {
  leads_found: number;
  candidates_found: number;
  duplicates_removed: number;
  sources_report: SourceReportEntry[];
  limitations: Array<{ code: string; detail: string }>;
  error_summary: string | null;
}

export interface DiscoveryPorts {
  loadRun(): Promise<DiscoveryRunInput>;
  sourceStates(): Promise<SourceState[]>;
  /** A search connector for an integrated and enabled source, else null. */
  searchConnector(sourceKey: string, maxRequests: number): SourceConnector | null;
  /** Usage of a search connector after the search (requests, limits, errors). */
  searchUsage?(
    sourceKey: string,
  ): { requests: number; limitsReached: string[]; errors: string[] } | null;
  fetchOfficialPage(url: string): Promise<ConnectorOutcome<SourceDocument>>;
  recordSnapshot(doc: SourceDocument): Promise<string>;
  /** Records a search lead under its source's storage policy; null if not recorded. */
  recordLead(lead: DiscoveryLead): Promise<string | null>;
  loadSeeds(args: {
    productIds: string[];
    categorySlugs: string[];
    max: number;
  }): Promise<SeedProduct[]>;
  identityLookup(candidate: IdentityCandidate): Promise<IdentityLookup>;
  catalogFacts(productId: string): Promise<FitFacts | null>;
  /** Known, user-visible category slugs among `slugs`, plus their parent slugs. */
  categoryClosure(slugs: string[]): Promise<{ known: string[]; withParents: string[] }>;
  setStage(stage: DiscoveryStageName): Promise<void>;
  savePlan(args: {
    interpretedFilters: CatalogFilters;
    queryPlan: unknown;
    limitations: Array<{ code: string; detail: string }>;
  }): Promise<void>;
  upsertCandidate(payload: CandidatePayload): Promise<CandidateWriteResult>;
  finalize(summary: RunSummaryPayload): Promise<void>;
  step<T>(
    meta: StepMeta,
    run: (stepId: string) => Promise<StepRunResult<T>>,
  ): Promise<StepRecord<T>>;
  gateway: AIGateway;
  remainingAiBudgetUsd(): number;
  recordUsage(stepId: string, usage: UsageRecord): Promise<void>;
  stopReason(): "cancelled" | "budget" | null;
  now(): Date;
  signal: AbortSignal;
}

export interface DiscoveryOutcome {
  state: "completed" | "partial" | "cancelled";
  terminalReason: "completed" | "partial" | "cancelled" | "budget_exhausted";
  summary: RunSummaryPayload & {
    candidates: CandidateWriteResult[];
    warnings: string[];
  };
}
