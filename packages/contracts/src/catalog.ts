// Implementation Blueprint §4.2 — catalog contracts.
import { z } from "zod";
import {
  ConfidenceSchema,
  CurrencyCodeSchema,
  CountryCodeSchema,
  HttpUrlSchema,
  ISODateTimeSchema,
  SlugSchema,
  UUIDSchema,
} from "./common";

export const CompanyTypeSchema = z.enum(["independent", "subsidiary", "public_company", "unknown"]);
export const FundingStatusSchema = z.enum(["bootstrapped", "externally_funded", "unknown"]);
export const CustomerTypeSchema = z.enum(["b2b", "b2c", "b2b_b2c", "unknown"]);
// PRD §4.2.F; an empty array means unknown.
export const BillingModelSchema = z.enum([
  "monthly_subscription",
  "annual_subscription",
  "freemium",
  "free_trial",
  "usage_based",
  "per_user",
  "volume_based",
  "license",
  "other",
]);
export const PricingStatusSchema = z.enum(["free", "paid", "freemium", "custom", "unknown"]);
export const ProductStatusSchema = z.enum(["active", "beta", "discontinued", "unknown"]);
export const MaturityStageSchema = z.enum([
  "new",
  "launching",
  "established",
  "growing",
  "mature",
  "unknown",
]);
export const PresenceStatusSchema = z.enum(["present", "not_observed", "unknown"]);
export const TechnologyTagSchema = z.enum([
  "web_app",
  "mobile_app",
  "api",
  "ai_native",
  "no_code_low_code",
  "browser_extension",
]);
export const IntegrationCategorySchema = z.enum([
  "crm",
  "ecommerce",
  "marketing",
  "analytics",
  "communication",
  "payments",
  "other",
]);
export const FeatureAvailabilitySchema = z.enum([
  "available",
  "beta",
  "planned",
  "removed",
  "not_observed",
  "unknown",
]);
export const RecordStatusSchema = z.enum([
  "candidate",
  "active",
  "needs_review",
  "archived",
  "merged",
]);
export const ExclusionStatusSchema = z.enum(["unassessed", "eligible", "excluded", "needs_review"]);

/** Manual product entry (PRD §18 "Ajout manuel d'un SaaS"). User-declared. */
export const ManualProductEntrySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    website_url: HttpUrlSchema,
    company_name: z.string().trim().max(200).nullable().default(null),
    category_slugs: z.array(SlugSchema).max(5).default([]),
    short_description: z.string().trim().max(300).nullable().default(null),
    note: z.string().max(2000).nullable().default(null),
  })
  .strict();

const emptyToNull = (v: unknown): unknown =>
  v === "" || v === null || v === undefined ? null : Number(v);

/** CSV cell: an empty cell is unknown (null), never 0. */
export const CsvNullableInt = z.preprocess(emptyToNull, z.number().int().min(0).nullable());

/** CSV cell: an empty cell is unknown (null), never 0. */
export const CsvNullableNumber = z.preprocess(emptyToNull, z.number().min(0).nullable());

/** One CSV row of a product import (PRD §18 "Import de données"). Used from Sprint 3. */
export const ProductImportRowSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    website_url: HttpUrlSchema,
    company_name: z.string().trim().max(200).nullable(),
    country_code: CountryCodeSchema.nullable(),
    employee_min: CsvNullableInt,
    employee_max: CsvNullableInt,
    category_slugs: z.array(SlugSchema).max(5),
    source_url: HttpUrlSchema.nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.employee_min !== null && v.employee_max !== null && v.employee_min > v.employee_max) {
      ctx.addIssue({
        code: "custom",
        path: ["employee_max"],
        message: "employee_max must be >= employee_min",
      });
    }
  });

/** Server-internal write models (used by repositories; never accepted from browsers). */
export const ProductFeatureWriteSchema = z
  .object({
    product_id: UUIDSchema,
    name: z.string().min(1).max(160),
    description: z.string().max(3000).nullable(),
    feature_category: z.string().max(100).nullable(),
    is_primary: z.boolean(),
    availability: FeatureAvailabilitySchema,
    evidence_id: UUIDSchema.nullable(),
    confidence: ConfidenceSchema.nullable(),
  })
  .strict()
  .refine((v) => ["not_observed", "unknown"].includes(v.availability) || v.evidence_id !== null, {
    message: "Availability claims require evidence",
  });

export const PricingPlanWriteSchema = z
  .object({
    product_id: UUIDSchema,
    plan_name: z.string().min(1).max(120),
    billing_period: z.enum(["month", "year", "usage", "one_time", "custom", "unknown"]),
    price_amount: z.number().nonnegative().nullable(),
    currency: CurrencyCodeSchema.nullable(),
    price_per_user: z.boolean().nullable(),
    minimum_seats: z.number().int().positive().nullable(),
    has_free_trial: z.boolean().nullable(),
    has_free_plan: z.boolean().nullable(),
    custom_pricing: z.boolean().nullable(),
    is_entry_plan: z.boolean(),
    is_enterprise_plan: z.boolean(),
    evidence_id: UUIDSchema,
    checked_at: ISODateTimeSchema,
  })
  .strict()
  .refine((v) => v.price_amount === null || v.currency !== null, {
    message: "Currency required when price is known",
    path: ["currency"],
  });

export type ManualProductEntry = z.infer<typeof ManualProductEntrySchema>;
export type CustomerType = z.infer<typeof CustomerTypeSchema>;
export type BillingModel = z.infer<typeof BillingModelSchema>;
export type PricingStatus = z.infer<typeof PricingStatusSchema>;
export type ExclusionStatus = z.infer<typeof ExclusionStatusSchema>;
