// Opportunity analysis contracts (Implementation Blueprint §4.8, §8, §9, §10
// "Opportunity analysis"; ADR-005, ADR-009). The server computes every score,
// coverage, confidence, band and verdict: agents only propose (§9.1).
import { z } from "zod";
import { ConfidenceSchema, EvidenceRefSchema, UUIDSchema } from "./common";

export const ANALYSIS_ORCHESTRATOR_VERSION = "opportunity-analysis.v1";
export const SCORING_RULES_VERSION = "scoring-1";

export const AnalysisSubjectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("product"), product_id: UUIDSchema }).strict(),
  z
    .object({ type: z.literal("product_set"), product_ids: z.array(UUIDSchema).min(2).max(10) })
    .strict(),
  z.object({ type: z.literal("category"), category_slug: z.string().min(1) }).strict(),
  z.object({ type: z.literal("pain_point_cluster"), cluster_id: UUIDSchema }).strict(),
  z
    .object({ type: z.literal("generated_opportunity"), generated_opportunity_id: UUIDSchema })
    .strict(),
]);
export type AnalysisSubject = z.infer<typeof AnalysisSubjectSchema>;
export const AnalysisSubjectTypeSchema = z.enum([
  "product",
  "product_set",
  "category",
  "pain_point_cluster",
  "generated_opportunity",
]);

export const AnalysisContextSchema = z
  .object({
    priority: z
      .enum(["commercial_opportunity", "product_improvement", "market_entry"])
      .default("commercial_opportunity"),
    preferred_customer_type: z.enum(["b2b", "b2c", "b2b_b2c"]).default("b2b"),
    target_country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .default("FR"),
    budget_note: z.string().max(300).nullable().default(null), // PRD §7.2 "Budget"
    technical_level_note: z.string().max(300).nullable().default(null), // PRD §7.2 "Niveau technique"
    product_type_note: z.string().max(300).nullable().default(null),
    constraints: z.array(z.string().max(300)).max(20).default([]),
  })
  .strict();

export const AnalysisOptionsSchema = z
  .object({
    analyze_competitors: z.boolean().default(true),
    analyze_customer_reviews: z.boolean().default(true),
    analyze_local_market: z.boolean().default(true),
    generate_validation_plan: z.boolean().default(true),
  })
  .strict();

export const AnalysisDepthSchema = z.enum(["quick", "standard", "deep"]);

export const AnalysisRequestSchema = z
  .object({
    analysis_type: z.enum(["opportunity", "comparison"]).default("opportunity"),
    subject: AnalysisSubjectSchema,
    analysis_depth: AnalysisDepthSchema.default("deep"),
    context: AnalysisContextSchema.default(() => AnalysisContextSchema.parse({})),
    options: AnalysisOptionsSchema.default(() => AnalysisOptionsSchema.parse({})),
  })
  .strict()
  .refine((v) => v.analysis_type !== "comparison" || v.subject.type === "product_set", {
    message: "A comparison needs a product set",
  });
export type AnalysisRequest = z.infer<typeof AnalysisRequestSchema>;

/** Shortcut body of POST W/products/{id}/analyses (subject = that product). */
export const ProductAnalysisShortcutSchema = z
  .object({
    analysis_depth: AnalysisDepthSchema.default("deep"),
    context: AnalysisContextSchema.default(() => AnalysisContextSchema.parse({})),
    options: AnalysisOptionsSchema.default(() => AnalysisOptionsSchema.parse({})),
  })
  .strict();

export const DimensionKeySchema = z.enum([
  "customer_demand",
  "willingness_to_pay",
  "product_gap",
  "market_attractiveness",
  "competitive_differentiation",
  "feasibility_distribution",
]);
export type DimensionKey = z.infer<typeof DimensionKeySchema>;

/** Proposal by the scoring-input agent; validated and recomputed by the server. */
export const DimensionAssessmentProposalSchema = z.discriminatedUnion("assessment_status", [
  z
    .object({
      dimension_key: DimensionKeySchema,
      assessment_status: z.literal("assessed"),
      rating: z.number().int().min(0).max(5), // integer per PD-05
      explanation: z.string().min(1).max(3000),
      evidence: z.array(EvidenceRefSchema).min(1).max(30),
      missing_information: z.array(z.string().max(500)).max(20).default([]),
    })
    .strict(),
  z
    .object({
      dimension_key: DimensionKeySchema,
      assessment_status: z.literal("insufficient_evidence"),
      explanation: z.string().min(1).max(3000),
      evidence: z.array(EvidenceRefSchema).max(30).default([]),
      missing_information: z.array(z.string().max(500)).min(1).max(20),
    })
    .strict(),
]);
export type DimensionAssessmentProposal = z.infer<typeof DimensionAssessmentProposalSchema>;

export const FindingTypeSchema = z.enum([
  "pain_point",
  "opportunity",
  "risk",
  "competitor_gap",
  "recommendation",
  "kill_criterion",
]);
export const KillSeveritySchema = z.enum(["critical", "major", "minor"]);

export const FindingSchema = z
  .object({
    type: FindingTypeSchema,
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(3000),
    priority: z.number().int().min(1).max(5),
    confidence: ConfidenceSchema,
    is_hypothesis: z.boolean(),
    severity: KillSeveritySchema.nullable(), // required for kill criteria
    dimension_key: DimensionKeySchema.nullable(),
    evidence: z.array(EvidenceRefSchema).max(30),
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((v.type === "kill_criterion") !== (v.severity !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["severity"],
        message: "Severity is required for kill criteria only",
      });
    }
    if (!v.is_hypothesis && v.evidence.filter((e) => e.support_type === "supports").length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["evidence"],
        message: "Non-hypothesis findings need supporting evidence",
      });
    }
  });
export type Finding = z.infer<typeof FindingSchema>;

export const AnalysisVerdictSchema = z.enum(["build_candidate", "validate_first", "reject"]);
export const DecisionBandSchema = z.enum([
  "reject",
  "low_potential",
  "to_investigate",
  "interesting",
  "priority",
]);
export type AnalysisVerdict = z.infer<typeof AnalysisVerdictSchema>;
export type DecisionBand = z.infer<typeof DecisionBandSchema>;

/** Reason codes of the verdict decision table (§9.6), recorded in order. */
export const VerdictReasonCodeSchema = z.enum([
  "FATAL_FLAW",
  "INCOMPLETE_COVERAGE",
  "SCORE_BELOW_REJECT_THRESHOLD",
  "LOW_POTENTIAL",
  "TO_INVESTIGATE",
  // A workspace raised the BUILD score threshold above 75 (PD-23 A) and the
  // score is below it: the gate fails like the other row-6 gates.
  "SCORE_BELOW_BUILD_THRESHOLD",
  "WTP_BELOW_THRESHOLD",
  "NO_PAYING_CUSTOMER_EVIDENCE",
  "LOW_CONFIDENCE",
  "INSUFFICIENT_DEMAND_EVIDENCE",
  "NO_CONCRETE_DIFFERENTIATION",
  "UNRESOLVED_CRITICAL_KILL_CRITERION",
  "EXCLUDED_RECOMMENDATION",
  "ALL_GATES_PASSED",
  "RED_TEAM_OBJECTION",
]);
export type VerdictReasonCode = z.infer<typeof VerdictReasonCodeSchema>;

export const AnalysisListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(30),
    cursor: z.string().max(1000).optional(),
    subject_type: AnalysisSubjectTypeSchema.optional(),
    product_id: UUIDSchema.optional(),
    cluster_id: UUIDSchema.optional(),
    generated_opportunity_id: UUIDSchema.optional(),
  })
  .strict();

export const ReportExportRequestSchema = z
  .object({ format: z.enum(["json", "markdown"]).default("markdown") }) // PD-18 A
  .strict();
