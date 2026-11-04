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
