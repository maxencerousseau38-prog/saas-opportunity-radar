// Implementation Blueprint §4.4 — evidence and source documents.
import { z } from "zod";
import {
  ConfidenceSchema,
  FactStatusSchema,
  HttpUrlSchema,
  ISODateTimeSchema,
  ReliabilityLevelSchema,
  UUIDSchema,
  VerificationStatusSchema,
} from "./common";
import { CsvNullableNumber } from "./catalog";

export const ClaimTypeSchema = z.enum([
  "product_exists",
  "product_description",
  "category",
  "pricing",
  "paid_customer_signal",
  "customer_identity",
  "employee_count",
  "founding_year",
  "headquarters",
  "customer_country",
  "market_presence",
  "language",
  "platform",
  "feature",
  "integration",
  "maturity",
  "company_profile",
  "traction_signal",
  "customer_feedback",
  "customer_pain",
  "market_size",
  "market_trend",
  "competitor_relation",
  "localization",
  "funding",
  "traffic",
  "other",
]);

export const EvidenceTypeSchema = z.enum([
  "official_statement",
  "customer_review",
  "pricing_evidence",
  "customer_case_study",
  "public_metric",
  "technical_evidence",
  "market_evidence",
  "third_party_report",
  "user_declared",
  "inference",
]);

export const MonetizationSignalSchema = z.enum([
  "payment_confirmed",
  "customer_verified",
  "paid_plan_available",
  "purchase_intent",
  "problem_signal",
  "unknown",
]);

export const FetchStatusSchema = z.enum([
  "ok",
  "blocked",
  "unavailable",
  "not_supported",
  "rate_limited",
  "error",
]);

export const StoragePermittedSchema = z.enum(["full", "excerpt", "reference_only"]);

/** Normalized output of every connector (never written by connectors themselves). */
export const SourceDocumentSchema = z
  .object({
    source_key: z.string().regex(/^[a-z0-9_]{2,60}$/),
    canonical_url: HttpUrlSchema,
    external_id: z.string().max(200).nullable(),
    title: z.string().max(500).nullable(),
    text: z.string().max(100_000),
    published_at: ISODateTimeSchema.nullable(),
    retrieved_at: ISODateTimeSchema,
    content_hash: z.string().regex(/^[a-f0-9]{64}$/), // sha256 of normalized text
    fetch_status: FetchStatusSchema,
    http_status: z.number().int().nullable(),
    storage_permitted: StoragePermittedSchema,
    metadata: z.object({}).passthrough().default(() => ({})),
  })
  .strict();

/** Server-internal evidence write model. */
export const EvidenceWriteSchema = z
  .object({
    product_id: UUIDSchema.nullable(),
    company_id: UUIDSchema.nullable(),
    category_id: UUIDSchema.nullable(),
    source_snapshot_id: UUIDSchema,
    claim_type: ClaimTypeSchema,
    claim_text: z.string().min(1).max(5000),
    claim_value: z.object({}).passthrough().nullable(),
    evidence_type: EvidenceTypeSchema,
    fact_status: FactStatusSchema,
    monetization_signal: MonetizationSignalSchema.nullable(),
    reliability_level: ReliabilityLevelSchema,
    confidence: ConfidenceSchema.nullable(),
    verification_status: VerificationStatusSchema,
    verified_at: ISODateTimeSchema.nullable(),
    published_at: ISODateTimeSchema.nullable(),
    observed_at: ISODateTimeSchema,
    extraction_method: z.enum([
      "official_api",
      "structured_parse",
      "llm_extraction",
      "manual_entry",
      "user_import",
    ]),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.product_id === null &&
      v.company_id === null &&
      v.category_id === null &&
      !["market_size", "market_trend"].includes(v.claim_type)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Evidence needs a product, company, category or market scope",
      });
    }
    if (v.claim_type === "paid_customer_signal" && v.monetization_signal === null) {
      ctx.addIssue({
        code: "custom",
        path: ["monetization_signal"],
        message: "Required for paid customer signals",
      });
    }
    if (
      v.monetization_signal &&
      ["payment_confirmed", "customer_verified"].includes(v.monetization_signal) &&
      v.reliability_level > 2
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["reliability_level"],
        message: "Community or inferred sources cannot confirm payment (PRD §13.2)",
      });
    }
    if (v.verification_status === "verified" && v.verified_at === null) {
      ctx.addIssue({
        code: "custom",
        path: ["verified_at"],
        message: "verified_at is required when verified",
      });
    }
    if (v.claim_type === "traffic" && v.fact_status !== "estimated") {
      ctx.addIssue({
        code: "custom",
        path: ["fact_status"],
        message: "Traffic is always an estimate",
      });
    }
  });

/** CSV feedback import row (PRD §18 import; rights declared per import). */
export const FeedbackImportRowSchema = z
  .object({
    product_slug: z.string().regex(/^[a-z0-9-]{1,220}$/),
    source_url: HttpUrlSchema,
    source_name: z.string().min(1).max(120),
    published_at: ISODateTimeSchema.nullable(),
    rating: CsvNullableNumber,
    rating_scale_max: CsvNullableNumber.refine((v) => v === null || v > 0, {
      message: "must be > 0",
    }),
    text: z.string().min(1).max(20_000),
    author_reference: z.string().max(200).nullable(), // hashed before storage
    author_company: z.string().max(200).nullable(),
  })
  .strict();

export const FeedbackImportRequestSchema = z
  .object({
    rights_declaration: z
      .object({
        storage: StoragePermittedSchema,
        author_reference_storage_permitted: z.boolean(),
        declared_basis: z.string().min(10).max(1000),
      })
      .strict(),
  })
  .strict();

export type SourceDocument = z.infer<typeof SourceDocumentSchema>;
export type EvidenceWrite = z.infer<typeof EvidenceWriteSchema>;
export type ClaimType = z.infer<typeof ClaimTypeSchema>;
export type FeedbackImportRow = z.infer<typeof FeedbackImportRowSchema>;
export type FeedbackImportRequest = z.infer<typeof FeedbackImportRequestSchema>;
