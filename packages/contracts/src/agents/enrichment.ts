// Agent D5 (Enrichment) and D6 (Evidence Verifier) output contracts
// (Implementation Blueprint §4.9, §6.6–6.7). Each agent has its own versioned
// contract; identifiers in outputs must be ones the step was given.
import { z } from "zod";
import { CountryCodeSchema, HttpUrlSchema, UUIDSchema } from "../common";
import {
  BillingModelSchema,
  CustomerTypeSchema,
  IntegrationCategorySchema,
  PricingStatusSchema,
  TechnologyTagSchema,
} from "../catalog";

export const ENRICHMENT_CONTRACT_VERSION = "enrichment.v1";
export const VERIFICATION_CONTRACT_VERSION = "verification.v1";

/** Supporting quote: a short exact excerpt of the cited snapshot. */
const Quote = z.string().trim().min(3).max(500);
const ShortText = z.string().trim().min(1).max(300);

/** Value schema per enrichable field (whitelist mirrored in the database). */
export const ENRICHMENT_FIELD_SCHEMAS = {
  // product
  tagline: ShortText,
  short_description: ShortText,
  description: z.string().trim().min(1).max(3000),
  problem_solved: z.string().trim().min(1).max(1000),
  value_proposition: z.string().trim().min(1).max(1000),
  use_cases: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
  languages: z
    .array(z.string().regex(/^[a-z]{2}$/))
    .min(1)
    .max(30),
  customer_type: CustomerTypeSchema.exclude(["unknown"]),
  pricing_status: PricingStatusSchema.exclude(["unknown"]),
  billing_models: z.array(BillingModelSchema).min(1).max(9),
  launch_year: z.number().int().min(1990).max(2100),
  documentation_url: HttpUrlSchema,
  technology_tags: z.array(TechnologyTagSchema).min(1).max(6),
  served_countries: z.array(CountryCodeSchema).min(1).max(60),
  // company
  legal_name: ShortText,
  founded_year: z.number().int().min(1900).max(2100),
  country_code: CountryCodeSchema,
  city: z.string().trim().min(1).max(120),
  employee_min: z.number().int().min(1).max(1_000_000),
  employee_max: z.number().int().min(1).max(1_000_000),
  founder_led: z.boolean(),
  linkedin_url: HttpUrlSchema,
} as const;

export type EnrichmentFieldKey = keyof typeof ENRICHMENT_FIELD_SCHEMAS;
export const ENRICHMENT_FIELD_KEYS = Object.keys(ENRICHMENT_FIELD_SCHEMAS) as EnrichmentFieldKey[];
export const COMPANY_FIELD_KEYS: readonly EnrichmentFieldKey[] = [
  "legal_name",
  "founded_year",
  "country_code",
  "city",
  "employee_min",
  "employee_max",
  "founder_led",
  "linkedin_url",
];

export const EnrichmentClaimSchema = z
  .object({
    field_key: z.enum(ENRICHMENT_FIELD_KEYS as [EnrichmentFieldKey, ...EnrichmentFieldKey[]]),
    value: z.unknown(),
    quote: Quote,
    source_snapshot_id: UUIDSchema,
    /** confirmed = observed on the page (offer, feature); declared = the company says so about itself. */
    fact_status: z.enum(["confirmed", "declared", "estimated"]),
  })
  .strict()
  .superRefine((c, ctx) => {
    const schema = ENRICHMENT_FIELD_SCHEMAS[c.field_key];
    const parsed = schema.safeParse(c.value);
    if (!parsed.success) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: `invalid value for ${c.field_key}`,
      });
    }
  });

export const EnrichmentOutputSchema = z
  .object({
    claims: z.array(EnrichmentClaimSchema).max(60),
    features: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(160),
            is_primary: z.boolean(),
            quote: Quote,
            source_snapshot_id: UUIDSchema,
          })
          .strict(),
      )
      .max(40),
    integrations: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(160),
            integration_category: IntegrationCategorySchema,
            quote: Quote,
            source_snapshot_id: UUIDSchema,
          })
          .strict(),
      )
      .max(40),
    pricing_plans: z
      .array(
        z
          .object({
            plan_name: z.string().trim().min(1).max(120),
            billing_period: z.enum(["month", "year", "usage", "one_time", "custom", "unknown"]),
            price_amount: z.number().nonnegative().max(1_000_000).nullable(),
            currency: z
              .string()
              .regex(/^[A-Za-z]{3}$/)
              .nullable(),
            price_per_user: z.boolean().nullable(),
            has_free_trial: z.boolean().nullable(),
            has_free_plan: z.boolean().nullable(),
            custom_pricing: z.boolean().nullable(),
            is_entry_plan: z.boolean(),
            is_enterprise_plan: z.boolean(),
            quote: Quote,
            source_snapshot_id: UUIDSchema,
          })
          .strict()
          .refine((p) => p.price_amount === null || p.currency !== null, {
            message: "currency required with a price",
          }),
      )
      .max(15),
    primary_use_case: z.string().trim().min(1).max(300).nullable(),
    core_purpose_flag: z.enum(["affiliate_or_partner", "not_affiliate_or_partner", "unknown"]),
    /** Fields looked for but not found: explicit unknowns, never guessed. */
    unknown_fields: z.array(z.string().max(60)).max(60),
    warnings: z.array(z.string().max(300)).max(20),
  })
  .strict();

export const VerificationOutputSchema = z
  .object({
    judgments: z
      .array(
        z
          .object({
            ref: z.string().regex(/^(claims|features|integrations|pricing_plans)\.\d{1,3}$/),
            support: z.enum(["supported", "not_supported", "unclear"]),
            note: z.string().max(300).nullable(),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();

export type EnrichmentOutput = z.infer<typeof EnrichmentOutputSchema>;
export type EnrichmentClaim = z.infer<typeof EnrichmentClaimSchema>;
export type VerificationOutput = z.infer<typeof VerificationOutputSchema>;
