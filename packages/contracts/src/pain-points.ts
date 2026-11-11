// Pain Point Intelligence contracts (Implementation Blueprint §4.7, §7, §10
// "Pain Point Intelligence"; ADR-008). Agent outputs are versioned; DTOs are
// what the API returns (never raw rows).
import { z } from "zod";
import { ConfidenceSchema, EvidenceRefSchema, UUIDSchema } from "./common";
import { OpportunityStatusSchema } from "./workspace";

export const PROBLEM_EXTRACTION_CONTRACT_VERSION = "problem-extraction.v1";
export const CLUSTER_VERIFICATION_CONTRACT_VERSION = "cluster-verification.v1";
export const MARKET_GAP_CONTRACT_VERSION = "market-gap.v1";
export const OPPORTUNITY_HYPOTHESIS_CONTRACT_VERSION = "opportunity-hypothesis.v1";

export const ProblemCategorySchema = z.enum([
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
  "reliability",
  "other",
]);
export type ProblemCategory = z.infer<typeof ProblemCategorySchema>;

export const PainPointRunRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    scope: z.discriminatedUnion("type", [
      z.object({ type: z.literal("product"), product_id: UUIDSchema }).strict(),
      z
        .object({
          type: z.literal("product_set"),
          product_ids: z.array(UUIDSchema).min(2).max(20),
        })
        .strict(),
      z.object({ type: z.literal("category"), category_slug: z.string().min(1) }).strict(),
    ]),
    max_feedback_items: z.number().int().min(10).max(2000).default(500),
  })
  .strict();
export type PainPointRunRequest = z.infer<typeof PainPointRunRequestSchema>;

/** P3 output: one call per feedback item; unknown fields stay null. */
export const ProblemExtractionOutputSchema = z
  .object({
    feedback_id: UUIDSchema,
    problems: z
      .array(
        z
          .object({
            is_primary: z.boolean(),
            problem_statement: z.string().min(1).max(1000),
            problem_category: ProblemCategorySchema,
            feature_concerned: z.string().max(200).nullable(),
            user_profile: z.string().max(200).nullable(),
            severity: z.number().int().min(1).max(5).nullable(),
            declared_frequency: z.string().max(200).nullable(),
            operational_consequence: z.string().max(500).nullable(),
            workaround: z.string().max(500).nullable(),
            desired_solution: z.string().max(500).nullable(),
            switching_intent: z.enum(["stated", "not_stated", "unknown"]),
            vendor_response: z.string().max(1000).nullable(),
            resolution_status: z.enum(["resolved", "unresolved", "unknown"]),
            confidence: ConfidenceSchema,
          })
          .strict(),
      )
      .max(5), // zero problems is valid (positive review)
    injection_suspected: z.boolean(),
  })
  .strict()
  .refine((v) => v.problems.filter((p) => p.is_primary).length <= 1, {
    message: "At most one primary problem",
  });
export type ProblemExtractionOutput = z.infer<typeof ProblemExtractionOutputSchema>;
export type ExtractedProblem = ProblemExtractionOutput["problems"][number];

/** P6 output: semantic verification of one algorithmic cluster. */
export const ClusterVerificationOutputSchema = z
  .object({
    cluster_ref: z.string().min(1),
    is_coherent: z.boolean(),
    proposed_name: z.string().min(1).max(200),
    proposed_description: z.string().min(1).max(3000),
    target_persona: z.string().max(200).nullable(),
    // Removed from the cluster, never merged elsewhere automatically.
    outlier_problem_ids: z.array(UUIDSchema).max(200),
    split_proposal: z
      .array(
        z.object({ name: z.string().max(200), problem_ids: z.array(UUIDSchema).min(1) }).strict(),
      )
      .max(5),
    confidence: ConfidenceSchema,
  })
  .strict();
export type ClusterVerificationOutput = z.infer<typeof ClusterVerificationOutputSchema>;

export const GapTypeSchema = z.enum([
  "shared_problem",
  "requested_feature",
  "manual_workflow",
  "user_workaround",
  "switching_driver",
  "unsatisfied_need",
]);

/** P8 output: gaps across competitors, evidence-linked. */
export const MarketGapOutputSchema = z
  .object({
    gaps: z
      .array(
        z
          .object({
            title: z.string().min(1).max(200),
            gap_type: GapTypeSchema,
            cluster_ids: z.array(UUIDSchema).min(1),
            description: z.string().min(1).max(3000),
            existing_solutions_observed: z.array(z.string().max(300)).max(10),
            // "No solution observed" is not evidence of no competition.
            absence_of_solution_is_verified: z.literal(false),
            evidence: z.array(EvidenceRefSchema).min(1).max(30),
            confidence: ConfidenceSchema,
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
export type MarketGapOutput = z.infer<typeof MarketGapOutputSchema>;

/** P9 output: independent SaaS opportunity hypotheses (unscored). */
export const OpportunityHypothesisOutputSchema = z
  .object({
    hypotheses: z
      .array(
        z
          .object({
            name: z.string().min(1).max(200),
            description: z.string().min(1).max(2000),
            problem_statement: z.string().min(1).max(2000),
            target_persona: z.string().min(1).max(300), // ICP
            proposed_solution: z.string().min(1).max(3000),
            value_proposition: z.string().min(1).max(1000),
            differentiation: z.string().min(1).max(2000),
            existing_competitor_product_ids: z.array(UUIDSchema).max(20),
            business_model_hypothesis: z.string().max(500).nullable(),
            pricing_hypothesis: z.string().max(500).nullable(),
            technical_feasibility_notes: z.string().max(1000).nullable(),
            distribution_hypothesis: z.string().max(1000).nullable(),
            validation_needed: z.string().min(1).max(2000),
            source_cluster_ids: z.array(UUIDSchema).min(1),
            primary_use_case: z.string().min(1).max(300), // input to the exclusion classifier
            core_purpose_flag: z.enum([
              "affiliate_or_partner",
              "not_affiliate_or_partner",
              "unknown",
            ]), // R10
          })
          .strict(),
      )
      .max(10),
  })
  .strict();
export type OpportunityHypothesisOutput = z.infer<typeof OpportunityHypothesisOutputSchema>;

export const ClusterCorrectionSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(3000).optional(),
    review_status: z.enum(["user_confirmed", "user_corrected", "rejected"]).optional(),
    remove_problem_ids: z.array(UUIDSchema).max(500).default([]),
    move_problem_ids_to_cluster: z
      .object({
        target_cluster_id: UUIDSchema,
        problem_ids: z.array(UUIDSchema).min(1).max(500),
      })
      .strict()
      .optional(),
  })
  .strict();
export type ClusterCorrection = z.infer<typeof ClusterCorrectionSchema>;

// ---------------------------------------------------------------------------
// API DTOs (Implementation Blueprint §10 "Pain Point Intelligence").

export const RunStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "partial",
  "failed",
  "cancelled",
  "needs_review",
]);
export const CountStatusSchema = z.enum(["verified", "estimated", "unknown"]);
export const FrequencyLabelSchema = z.enum(["isolated", "recurring", "widespread", "unknown"]);
export const ClusterReviewStatusSchema = z.enum([
  "machine_proposed",
  "user_confirmed",
  "user_corrected",
  "rejected",
]);

export const GeneratedOpportunityPatchSchema = z
  .object({
    status: OpportunityStatusSchema.optional(),
    is_favorite: z.boolean().optional(),
    notes: z.string().max(10000).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "nothing to update" });
export type GeneratedOpportunityPatch = z.infer<typeof GeneratedOpportunityPatchSchema>;

/** Sample limitations shown with every cluster (Implementation Blueprint §7.4). */
export const SAMPLE_LIMITATIONS = [
  "review_sample_not_representative",
  "complaints_are_not_willingness_to_pay",
  "absence_of_observed_solution_is_not_absence_of_competition",
] as const;
