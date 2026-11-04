// Implementation Blueprint §4.5 — workspace contracts.
import { z } from "zod";
import { SlugSchema, UUIDSchema } from "./common";
import { BillingModelSchema } from "./catalog";
import { CatalogFiltersSchema, CatalogSortSchema, ConfigurableExclusionSchema } from "./filters";

export const WorkspaceRoleSchema = z.enum(["owner", "admin", "member", "viewer"]);
export const OpportunityStatusSchema = z.enum([
  "discovered",
  "to_research",
  "analyzing",
  "validate",
  "validated",
  "rejected",
  "building",
]);

export const WorkspaceCreateSchema = z.object({ name: z.string().trim().min(1).max(120) }).strict();
export const WorkspaceRenameSchema = WorkspaceCreateSchema;

export const MemberInviteSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(320),
    role: z.enum(["admin", "member", "viewer"]), // owner is never assignable
  })
  .strict();
export const MemberRoleUpdateSchema = z
  .object({ role: z.enum(["admin", "member", "viewer"]) })
  .strict();
export const OwnershipTransferSchema = z.object({ new_owner_user_id: UUIDSchema }).strict();

export const CollectionCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(1000).nullable().default(null),
  })
  .strict();
export const CollectionUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(1000).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Empty patch" });
export const CollectionItemCreateSchema = z
  .object({
    product_id: UUIDSchema.optional(),
    generated_opportunity_id: UUIDSchema.optional(),
    notes: z.string().max(5000).nullable().default(null),
  })
  .strict()
  .refine((v) => (v.product_id === undefined) !== (v.generated_opportunity_id === undefined), {
    message: "Exactly one of product_id or generated_opportunity_id",
  });
export const CollectionItemUpdateSchema = z
  .object({ notes: z.string().max(5000).nullable() })
  .strict();

export const SavedSearchSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    kind: z.enum(["catalog", "discovery"]).default("catalog"),
    search_text: z.string().max(2000).nullable().default(null),
    filters: CatalogFiltersSchema.default(() => CatalogFiltersSchema.parse({})),
    sort_key: CatalogSortSchema.default("relevance"),
    is_pinned: z.boolean().default(false),
  })
  .strict();
export const SavedSearchUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    search_text: z.string().max(2000).nullable().optional(),
    filters: CatalogFiltersSchema.optional(),
    sort_key: CatalogSortSchema.optional(),
    is_pinned: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Empty patch" });

export const ProductStatePatchSchema = z
  .object({
    status: OpportunityStatusSchema.optional(),
    is_favorite: z.boolean().optional(),
    is_hidden: z.boolean().optional(),
    personal_notes: z.string().max(10_000).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Empty patch" });

export const TagCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable()
      .default(null),
  })
  .strict();
export const TagUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable()
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Empty patch" });
export const TagAssignmentSchema = z.object({ product_id: UUIDSchema }).strict();

export const CorrectionReportSchema = z
  .object({
    report_type: z.enum([
      "wrong_category",
      "incorrect_information",
      "suspected_excluded_category",
      "duplicate",
      "other",
    ]),
    field_key: z
      .string()
      .regex(/^[a-z_]{2,60}$/)
      .nullable()
      .default(null),
    message: z.string().trim().min(1).max(2000),
  })
  .strict();

// PRD §14.1 — configurable preferences. Permanent exclusions are not part
// of this schema and cannot be expressed in it.
export const ResearchPreferencesSchema = z
  .object({
    priority_category_slugs: z.array(SlugSchema).max(50).default([]),
    priority_countries: z
      .array(z.string().regex(/^[A-Z]{2}$/))
      .max(50)
      .default(["US"]),
    team_size_max: z.number().int().min(1).max(100_000).nullable().default(20),
    customer_types: z.array(z.enum(["b2b", "b2c", "b2b_b2c"])).default(["b2b"]),
    configurable_exclusions: z.array(ConfigurableExclusionSchema).max(7).default([]),
    billing_models: z.array(BillingModelSchema).max(9).default([]),
    // PRD §14.1: may only make BUILD stricter than PRD §21 (PD-23 A).
    stricter_build_thresholds: z
      .object({
        min_score: z.number().int().min(75).max(100).default(75),
        min_wtp: z.number().int().min(10).max(15).default(10),
      })
      .strict()
      .default(() => ({ min_score: 75, min_wtp: 10 })),
    adaptation_market: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .default("FR"),
  })
  .strict();

// PRD §14.2. Budgets can only lower platform limits.
export const AiPreferencesSchema = z
  .object({
    preferred_profile_overrides: z
      .object({})
      .passthrough()
      .default(() => ({})),
    analysis_mode: z.enum(["quick", "standard", "deep"]).default("deep"),
    min_sources: z.number().int().min(1).max(50).default(3),
    report_language: z.enum(["fr", "en"]).default("fr"),
    max_cost_usd_per_analysis: z.number().positive().nullable().default(null),
  })
  .strict();

export const WorkspaceSettingsPatchSchema = z
  .object({
    research_preferences: ResearchPreferencesSchema.optional(),
    ai_preferences: AiPreferencesSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Empty patch" });

export const OperatorExclusionDecisionSchema = z
  .object({
    decision: z.enum(["eligible", "excluded"]),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();
export const OperatorReportResolutionSchema = z
  .object({
    status: z.enum(["accepted", "rejected"]),
    note: z.string().trim().max(2000).nullable().default(null),
  })
  .strict();

export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;
export type OpportunityStatus = z.infer<typeof OpportunityStatusSchema>;
export type ResearchPreferences = z.infer<typeof ResearchPreferencesSchema>;
export type AiPreferences = z.infer<typeof AiPreferencesSchema>;
export type SavedSearchInput = z.input<typeof SavedSearchSchema>;
export type ProductStatePatch = z.infer<typeof ProductStatePatchSchema>;
