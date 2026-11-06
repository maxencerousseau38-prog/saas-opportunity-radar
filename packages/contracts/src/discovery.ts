// Discovery Engine contracts (Implementation Blueprint §4.6, §4.9 "D1", §6;
// PD-28; docs/DATA_SOURCES.md). The fit score is not in any AI contract: it
// is computed by `@sor/domain` (§6.8). No field can express or remove a
// permanent exclusion.
import { z } from "zod";
import {
  HttpUrlSchema,
  ISODateTimeSchema,
  SlugSchema,
  SnapshotRefSchema,
  UUIDSchema,
} from "./common";
import { BillingModelSchema } from "./catalog";
import { MonetizationSignalSchema, SourceStoragePolicySchema } from "./evidence";
import { CatalogFiltersSchema } from "./filters";

export const DISCOVERY_ORCHESTRATOR_VERSION = "discovery-run.v1";
export const QUERY_PLAN_CONTRACT_VERSION = "d1.query-plan.v1";
export const CANDIDATE_EXTRACTION_CONTRACT_VERSION = "d3.candidate-extraction.v1";

const SourceKeySchema = z.string().regex(/^[a-z0-9_]{2,60}$/);

export const DiscoveryDepthSchema = z.enum(["standard", "deep"]);
export type DiscoveryDepth = z.infer<typeof DiscoveryDepthSchema>;

/**
 * Where leads may come from (PD-28, approved 6 Nov 2026). A channel is used
 * only if its source is integrated and enabled; otherwise the run reports it
 * as not available. [ASSUMPTION] extension of §4.6: the user can switch a
 * channel off for a run and give rebound seeds and a seed URL list.
 */
export const DiscoveryChannelsSchema = z
  .object({
    /** Search channel: integrated search connectors (Hacker News official API). */
    search: z.boolean().default(true),
    /** Controlled rebound from catalogued products' official websites. */
    official_site_rebound: z
      .object({
        enabled: z.boolean().default(true),
        /** Explicit seeds; empty = products of the requested categories (server-chosen). */
        seed_product_ids: z.array(UUIDSchema).max(20).default([]),
      })
      .strict()
      .default(() => ({ enabled: true, seed_product_ids: [] })),
    /** Product URLs supplied by the user (seed list, PD-28 "import CSV"). */
    seed_urls: z.array(HttpUrlSchema).max(100).default([]),
  })
  .strict();

export const DiscoveryRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    prompt: z.string().trim().min(3).max(2000),
    // Explicit filters reuse the catalog filter contract (no exclusion removal).
    filters: CatalogFiltersSchema.default(() => CatalogFiltersSchema.parse({})),
    max_results: z.number().int().min(1).max(100).default(30),
    depth: DiscoveryDepthSchema.default("standard"),
    channels: DiscoveryChannelsSchema.default(() => DiscoveryChannelsSchema.parse({})),
    rerun_of_run_id: UUIDSchema.optional(),
  })
  .strict()
  .refine(
    (r) =>
      r.channels.search ||
      r.channels.official_site_rebound.enabled ||
      r.channels.seed_urls.length > 0,
    {
      path: ["channels"],
      message: "At least one discovery channel is needed",
    },
  );
export type DiscoveryRequest = z.infer<typeof DiscoveryRequestSchema>;
export type DiscoveryRequestInput = z.input<typeof DiscoveryRequestSchema>;

/** D1 Query Planner output (§4.9). No exclusion field: the server appends them. */
export const QueryPlanSchema = z
  .object({
    interpreted_intent: z.string().trim().min(1).max(1000),
    mandatory_constraints: z.array(z.string().trim().min(1).max(300)).max(20),
    optional_preferences: z.array(z.string().trim().min(1).max(300)).max(20),
    category_slugs: z.array(SlugSchema).max(10),
    /** Filters inferred from the prompt; explicit user filters outrank them. */
    inferred_filters: CatalogFiltersSchema,
    queries_by_source: z
      .array(
        z
          .object({
            source_key: SourceKeySchema,
            queries: z.array(z.string().trim().min(2).max(200)).min(1).max(10),
          })
          .strict(),
      )
      .max(10),
    max_candidates: z.number().int().min(1).max(100),
  })
  .strict();
export type QueryPlan = z.infer<typeof QueryPlanSchema>;

export const LeadChannelSchema = z.enum(["search", "official_site_rebound", "seed_url"]);

/**
 * D2 output (deterministic): a pointer to a possible product. A lead is never
 * a candidate: the candidate exists only once its own official site has been
 * fetched and cited by D3 (docs/DATA_SOURCES.md).
 */
export const DiscoveryLeadSchema = z
  .object({
    source_key: SourceKeySchema,
    channel: LeadChannelSchema,
    lead_url: HttpUrlSchema,
    title: z.string().max(500).nullable(),
    external_id: z.string().max(200).nullable(),
    /** Page that gave the lead (HN item page, rebound page); null for a seed URL. */
    source_reference_url: HttpUrlSchema.nullable(),
    published_at: ISODateTimeSchema.nullable(),
    retrieved_at: ISODateTimeSchema,
    /** Rebound only: the catalogued product whose site mentions the lead. */
    via_product_id: UUIDSchema.nullable(),
    /** The planned query that produced the lead (search channel only). */
    query: z.string().max(200).nullable(),
    storage_policy: SourceStoragePolicySchema,
  })
  .strict();
export type DiscoveryLead = z.infer<typeof DiscoveryLeadSchema>;

/** D3 output: candidates cite the snapshots they were extracted from (§4.6). */
export const ExtractedCandidateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    official_url: HttpUrlSchema.nullable(), // null => candidate goes to review
    tagline: z.string().max(300).nullable(),
    description: z.string().max(5000).nullable(),
    company_name: z.string().max(200).nullable(),
    country_code: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    employee_min: z.number().int().min(0).nullable(),
    employee_max: z.number().int().min(0).nullable(),
    founder_led: z.boolean().nullable(),
    proposed_category_slugs: z.array(SlugSchema).max(10),
    proposed_primary_use_case: z.string().max(300).nullable(), // input to the exclusion classifier
    core_purpose_flag: z.enum(["affiliate_or_partner", "not_affiliate_or_partner", "unknown"]), // R10
    billing_models: z.array(BillingModelSchema).max(9),
    monetization_signal: MonetizationSignalSchema,
    citations: z.array(SnapshotRefSchema).min(1).max(30),
  })
  .strict()
  .refine(
    (c) => c.employee_min === null || c.employee_max === null || c.employee_min <= c.employee_max,
    { path: ["employee_max"], message: "employee_min must be <= employee_max" },
  );
export type ExtractedCandidate = z.infer<typeof ExtractedCandidateSchema>;

export const CandidateExtractionOutputSchema = z
  .object({
    candidates: z.array(ExtractedCandidateSchema).max(50),
    ignored_mentions: z
      .array(
        z
          .object({
            name: z.string().max(200),
            reason: z.enum(["insufficient_identity", "not_a_product", "generic_mention", "other"]),
          })
          .strict(),
      )
      .max(100),
    injection_suspected: z.boolean(), // source text contained instructions
  })
  .strict();
export type CandidateExtractionOutput = z.infer<typeof CandidateExtractionOutputSchema>;

export const DiscoveryRunStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "partial",
  "failed",
  "cancelled",
  "needs_review",
]);

/** Orchestrator stages (§6.1), persisted one by one. */
export const DiscoveryStageSchema = z.enum([
  "planning",
  "searching",
  "extracting",
  "resolving_identity",
  "enriching",
  "verifying",
  "classifying_exclusion",
  "filtering",
  "ranking",
  "persisting",
]);

/** One entry of `discovery_runs.sources_report` (PRD §6.3 "Gestion des sources"). */
export const SourceReportEntrySchema = z
  .object({
    source_key: SourceKeySchema,
    channel: LeadChannelSchema,
    status: z.enum([
      "consulted",
      "not_enabled",
      "not_supported",
      "unavailable",
      "rate_limited",
      "error",
      "budget_exhausted",
    ]),
    requests: z.number().int().min(0),
    leads: z.number().int().min(0),
    limits_reached: z.array(z.string().max(200)).max(10),
    errors: z.array(z.string().max(300)).max(10),
    terms_url: HttpUrlSchema.nullable(),
    storage_policy: SourceStoragePolicySchema,
  })
  .strict();
export type SourceReportEntry = z.infer<typeof SourceReportEntrySchema>;

export const CandidateReviewSchema = z
  .object({
    decision: z.enum(["accept", "reject"]),
    reason: z.string().max(1000).nullable().default(null),
  })
  .strict();
export type CandidateReview = z.infer<typeof CandidateReviewSchema>;
