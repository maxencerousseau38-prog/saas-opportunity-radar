// Implementation Blueprint §4.11 (error codes) and §10 (DTOs). DTOs are the
// public API shapes; database rows are never returned as such.
import { z } from "zod";
import { FactStatusSchema, ISODateTimeSchema, UUIDSchema } from "./common";
import {
  BillingModelSchema,
  CustomerTypeSchema,
  ExclusionStatusSchema,
  PricingStatusSchema,
} from "./catalog";
import { OpportunityStatusSchema, WorkspaceRoleSchema } from "./workspace";

export const ApiErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "IDEMPOTENCY_CONFLICT",
  "INVALID_STATE",
  "EXCLUDED_SUBJECT",
  "EVIDENCE_SCOPE_VIOLATION",
  "RATE_LIMITED",
  "LIMIT_EXCEEDED",
  "UPSTREAM_UNAVAILABLE",
  "INTERNAL_ERROR",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const API_ERROR_HTTP_STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  IDEMPOTENCY_CONFLICT: 409,
  INVALID_STATE: 409,
  EXCLUDED_SUBJECT: 422,
  EVIDENCE_SCOPE_VIOLATION: 422,
  RATE_LIMITED: 429,
  LIMIT_EXCEEDED: 429,
  UPSTREAM_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

/** A displayed catalog value with its provenance (PRD §5.3). Unknown = null + "unknown". */
export const SourcedValueSchema = <T extends z.ZodType>(value: T) =>
  z
    .object({
      value: value.nullable(),
      fact_status: FactStatusSchema,
      verified_at: ISODateTimeSchema.nullable(),
      evidence_ids: z.array(UUIDSchema),
    })
    .strict();

export const CategoryRefSchema = z
  .object({ slug: z.string(), name: z.string(), is_primary: z.boolean() })
  .strict();

export const ProductAcquisitionChannelSchema = z
  .object({
    channel_key: z.string(),
    channel_category: z.string(),
    role: z.enum(["primary", "secondary"]),
    status: FactStatusSchema,
    confidence: z.number().min(0).max(100).nullable(),
    observed_at: ISODateTimeSchema,
    source_url: z.string().url(),
    source_name: z.string().nullable(),
    evidence_id: UUIDSchema,
    /** Excerpt stating the channel is the main one (primary only; ADR-017 §3). */
    role_rationale: z.string().nullable(),
    /** Method and indices of an estimate. */
    inference_rationale: z.string().nullable(),
    confidence_method: z.string().nullable(),
    confidence_reasons: z.array(z.string()),
  })
  .strict();

const SorAssetPath = /^\/api\/v1\/catalog\/assets\/[0-9a-f-]{36}$/;

export const ProductVisualAssetSchema = z
  .object({
    asset_type: z.enum([
      "official_hero",
      "product_screenshot",
      "official_illustration",
      // PD-38: displayed by reference (no copy stored by SOR).
      "licensed_image",
      "publisher_share_image",
    ]),
    /**
     * Operator-approved private copy: the authenticated SOR delivery path,
     * never a remote URL. Reference (PD-38): the https image URL at its origin.
     */
    url: z.string().min(1).max(2000),
    alt_text: z.string().min(1).max(500),
    source_url: z.string().url(),
    observed_at: ISODateTimeSchema,
    rights_basis: z.string().min(1),
    confidence: z.number().min(0).max(100).nullable(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    // Defaults keep the pre-S8.5 DTO (private copies only) valid.
    delivery_mode: z.enum(["private_copy", "external_reference"]).default("private_copy"),
    rights_status: z.enum(["approved", "licensed", "publisher_published"]).default("approved"),
    licence_code: z.string().nullable().default(null),
    licence_url: z.string().url().nullable().default(null),
    attribution: z.string().nullable().default(null),
  })
  .strict()
  .superRefine((a, ctx) => {
    const reference = a.delivery_mode === "external_reference";
    if (!reference) {
      if (!SorAssetPath.test(a.url) || a.rights_status !== "approved") {
        ctx.addIssue({ code: "custom", message: "a private copy is served by SOR and approved" });
      }
      return;
    }
    if (!/^https:\/\/[^/]/i.test(a.url)) {
      ctx.addIssue({ code: "custom", message: "a reference is an https image URL" });
    }
    if (a.asset_type === "licensed_image") {
      if (a.rights_status !== "licensed" || !a.licence_code || !a.licence_url) {
        ctx.addIssue({ code: "custom", message: "a free-licence image carries its licence" });
      }
    } else if (
      a.asset_type !== "publisher_share_image" ||
      a.rights_status !== "publisher_published"
    ) {
      ctx.addIssue({ code: "custom", message: "unknown reference kind" });
    }
  });

export const ProductCardSchema = z
  .object({
    id: UUIDSchema,
    slug: z.string(),
    name: z.string(),
    tagline: z.string().nullable(),
    short_description: z.string().nullable(),
    website_url: z.string().nullable(),
    logo_url: z.string().nullable(),
    customer_type: CustomerTypeSchema,
    pricing_status: PricingStatusSchema,
    billing_models: z.array(BillingModelSchema),
    country_code: z.string().nullable(),
    employee_min: z.number().int().nullable(),
    employee_max: z.number().int().nullable(),
    start_year: z.number().int().nullable(),
    categories: z.array(CategoryRefSchema),
    acquisition_channels: z.array(ProductAcquisitionChannelSchema),
    visual_asset: ProductVisualAssetSchema.nullable(),
    workspace: z
      .object({
        is_favorite: z.boolean(),
        is_hidden: z.boolean(),
        status: OpportunityStatusSchema.nullable(),
        last_viewed_at: ISODateTimeSchema.nullable(),
        in_collection: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const CatalogPageSchema = z
  .object({
    data: z.array(ProductCardSchema),
    next_cursor: z.string().nullable(),
  })
  .strict();

export const MeSchema = z
  .object({
    user: z.object({ id: UUIDSchema, email: z.string().nullable() }).strict(),
    memberships: z.array(
      z
        .object({ workspace_id: UUIDSchema, workspace_name: z.string(), role: WorkspaceRoleSchema })
        .strict(),
    ),
    is_platform_operator: z.boolean(),
  })
  .strict();

export const ManualAddResultSchema = z
  .object({
    status: z.enum(["created", "existing"]),
    product_id: UUIDSchema.nullable(),
    exclusion_status: ExclusionStatusSchema,
    visible: z.boolean(),
    /** product_enrichment job started for a newly created eligible product (Sprint 3). */
    enrichment_job_id: UUIDSchema.nullable(),
    enrichment_note: z.enum(["queued", "limit_reached", "not_applicable"]),
  })
  .strict();

export type SourcedValue<T> = {
  value: T | null;
  fact_status: z.infer<typeof FactStatusSchema>;
  verified_at: string | null;
  evidence_ids: string[];
};
export type CategoryRef = z.infer<typeof CategoryRefSchema>;
export type ProductCard = z.infer<typeof ProductCardSchema>;
export type CatalogPage = z.infer<typeof CatalogPageSchema>;
export type Me = z.infer<typeof MeSchema>;
export type ManualAddResult = z.infer<typeof ManualAddResultSchema>;
