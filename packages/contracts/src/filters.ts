// Implementation Blueprint §4.3 — catalog search and filters.
// AND between groups, OR inside a group, unknown handling chosen per group.
// Permanent exclusions are not representable here (server-side constant).
import { z } from "zod";
import { CountryCodeSchema, ISODateTimeSchema, SlugSchema, UUIDSchema } from "./common";
import {
  BillingModelSchema,
  CustomerTypeSchema,
  IntegrationCategorySchema,
  MaturityStageSchema,
  TechnologyTagSchema,
} from "./catalog";

const UnknownToggle = z.boolean().default(false);

export const RangeSchema = z
  .object({
    min: z.number().int().min(0).optional(),
    max: z.number().int().min(0).optional(),
  })
  .strict()
  .refine((r) => r.min === undefined || r.max === undefined || r.min <= r.max, {
    message: "min must be <= max",
  });

export const TeamSizePresetSchema = z.enum(["1-5", "1-10", "1-20", "20-50", "50-100", "100+"]);
export const AgeBucketSchema = z.enum(["lt_1", "1_2", "2_5", "5_10", "gt_10"]);
// PRD §4.2.G bands, monthly entry price converted to EUR for filtering only.
export const PriceBandSchema = z.enum([
  "free",
  "lt_10",
  "10_30",
  "30_100",
  "100_500",
  "gt_500",
  "custom",
]);
export const CommercialValidationSchema = z.enum([
  "paying_customers_confirmed",
  "customer_reviews",
  "testimonials",
  "case_studies",
  "paid_subscriptions",
  "traction_signals",
  "monetization_unverified",
  "insufficient_data",
]);
export const CompanyProfileSchema = z.enum([
  "founder_led",
  "indie_saas",
  "small_team",
  "independent",
  "funded",
  "bootstrapped",
  "subsidiary_or_group",
  "unknown",
]);
export const OpportunityFilterSchema = z.enum([
  "score_lt_50",
  "score_50_64",
  "score_65_74",
  "score_75_84",
  "score_85_100",
  "wtp_gte_10",
  "low_differentiation",
  "exploitable_competitive_weakness",
  "french_adaptation_potential",
]);
export const CommercialGeographySchema = z.enum([
  "present_us",
  "low_presence_europe",
  "low_presence_france",
  "no_french_version",
  "limited_french_competition",
  "french_adaptation_interesting",
]);
export const ComplaintCategorySchema = z.enum([
  "pricing",
  "ux",
  "missing_features",
  "bugs",
  "support",
  "integrations",
  "performance",
  "documentation",
  "customization",
  "complexity",
]);
/** Normalized extensible key for a catalog SaaS's observed acquisition channel. */
export const AcquisitionChannelSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,59}$/)
  .refine((value) => value !== "unknown", "Use include_unknown for missing channel data");
export const AcquisitionChannelStatusSchema = z.enum(["confirmed", "declared", "estimated"]);
// PRD §4.2.O configurable exclusions.
export const ConfigurableExclusionSchema = z.enum([
  "b2c_only",
  "groups_and_large_companies",
  "free_without_monetization",
  "no_identifiable_activity",
  "too_recent_without_demand_proof",
  "very_technical_devtools",
  "already_analyzed_and_rejected",
]);

export const CatalogFiltersSchema = z
  .object({
    text: z.string().trim().max(500).optional(),
    customer_types: z
      .object({
        values: z.array(CustomerTypeSchema.exclude(["unknown"])).max(3),
        include_unknown: UnknownToggle,
      })
      .strict()
      .optional(),
    team_size: z
      .object({
        presets: z.array(TeamSizePresetSchema).max(6).default([]),
        custom: RangeSchema.optional(),
        include_unknown: UnknownToggle,
      })
      .strict()
      .optional(),
    hq_countries: z
      .object({ values: z.array(CountryCodeSchema).max(50), include_unknown: UnknownToggle })
      .strict()
      .optional(),
    customer_countries: z
      .object({ values: z.array(CountryCodeSchema).max(50), include_unknown: UnknownToggle })
      .strict()
      .optional(),
    france_presence: z
      .object({ value: z.enum(["present", "not_observed"]), include_unknown: UnknownToggle })
      .strict()
      .optional(),
    international_presence: z
      .object({ value: z.boolean(), include_unknown: UnknownToggle })
      .strict()
      .optional(),
    age: z
      .object({
        buckets: z.array(AgeBucketSchema).max(5).default([]),
        founded_year: RangeSchema.optional(),
        include_unknown: UnknownToggle,
      })
      .strict()
      .optional(),
    categories: z
      .object({ slugs: z.array(SlugSchema).min(1).max(50) })
      .strict()
      .optional(),
    billing_models: z
      .object({ values: z.array(BillingModelSchema).max(9), include_unknown: UnknownToggle })
      .strict()
      .optional(),
    price_bands: z
      .object({ values: z.array(PriceBandSchema).max(7), include_unknown: UnknownToggle })
      .strict()
      .optional(),
    maturity: z
      .object({
        values: z.array(MaturityStageSchema.exclude(["unknown"])).max(5),
        include_unknown: UnknownToggle,
      })
      .strict()
      .optional(),
    commercial_validation: z.array(CommercialValidationSchema).max(8).optional(),
    company_profile: z
      .object({ values: z.array(CompanyProfileSchema).max(8), include_unknown: UnknownToggle })
      .strict()
      .optional(),
    opportunity: z.array(OpportunityFilterSchema).max(9).optional(),
    commercial_geography: z.array(CommercialGeographySchema).max(6).optional(),
    technology: z
      .object({
        tags: z.array(TechnologyTagSchema).max(6).default([]),
        integration_categories: z.array(IntegrationCategorySchema).max(7).default([]),
      })
      .strict()
      .optional(),
    complaints: z.array(ComplaintCategorySchema).max(10).optional(),
    acquisition_channels: z
      .object({
        values: z.array(AcquisitionChannelSchema).max(12).default([]),
        statuses: z.array(AcquisitionChannelStatusSchema).max(3).default([]),
        include_unknown: UnknownToggle,
      })
      .strict()
      .optional(),
    configurable_exclusions: z.array(ConfigurableExclusionSchema).max(7).default([]),
    include_hidden: z.boolean().default(false),
  })
  .strict();

export const CatalogSortSchema = z.enum([
  /** "Pour vous": renewed at each opening (rule feed-1, PD-41). */
  "discovery",
  "newest",
  "recently_added",
  "relevance",
  "best_monetization_evidence",
  "smallest_team",
  "oldest",
  "most_recent_activity",
  "least_analyzed",
  "random",
  "ai_potential",
]);

export const CatalogQuerySchema = z
  .object({
    filters: CatalogFiltersSchema.default(() => CatalogFiltersSchema.parse({})),
    sort: CatalogSortSchema.default("relevance"),
    random_seed: z.number().int().min(0).max(2_147_483_647).optional(),
    /**
     * Start of the feed session, as returned by the server on the session's
     * first page (PD-41). Absent: the server starts a new session now.
     */
    feed_started_at: ISODateTimeSchema.optional(),
    limit: z.number().int().min(1).max(100).default(30),
    cursor: z.string().max(1000).optional(),
  })
  .strict();

/**
 * Feed signals of one session (PD-41): cards actually shown on screen and
 * profiles opened from the feed. Only the workspace's own ranking uses them.
 */
export const FeedSignalsRequestSchema = z
  .object({
    feed_started_at: ISODateTimeSchema,
    shown: z.array(UUIDSchema).max(100).default([]),
    opened: z.array(UUIDSchema).max(20).default([]),
  })
  .strict()
  .refine((r) => r.shown.length + r.opened.length > 0, { message: "empty" });

/**
 * Filter groups shipped in the MVP (PD-16 A + J): A, B, C, D, E, F, G, I, J, O.
 * The other groups stay in the contract and ship in Phase 2; the API rejects
 * them rather than ignoring them silently.
 */
export const MVP_UNSUPPORTED_FILTER_KEYS = [
  "customer_countries",
  "france_presence",
  "international_presence",
  "maturity",
  "opportunity",
  "commercial_geography",
  "technology",
  "complaints",
] as const;

/**
 * Sort keys the API refuses. `least_analyzed` is served since S8.3 (real
 * workspace analyses). `ai_potential` stays unavailable: analysis scores come
 * from simulated agents until PD-24, so ranking real SaaS by them would
 * present simulated results as real (S8.3, sprint plan D).
 */
export const UNSUPPORTED_SORT_KEYS = ["ai_potential"] as const;

export type CatalogFilters = z.infer<typeof CatalogFiltersSchema>;
export type CatalogFiltersInput = z.input<typeof CatalogFiltersSchema>;
export type CatalogSort = z.infer<typeof CatalogSortSchema>;
export type CatalogQuery = z.infer<typeof CatalogQuerySchema>;
export type CatalogQueryInput = z.input<typeof CatalogQuerySchema>;
export type FeedSignalsRequest = z.infer<typeof FeedSignalsRequestSchema>;
export type ConfigurableExclusion = z.infer<typeof ConfigurableExclusionSchema>;
