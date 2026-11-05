// Opportunity Engine agent output contracts O1–O9 (Implementation Blueprint
// §4.9, §8.2–8.10). One versioned contract per agent (no monolithic schema).
// Agents cite only evidence IDs of the analysis evidence index; the server
// checks every citation against the index before anything is persisted.
// Every factual statement carries supporting evidence or is labelled a
// hypothesis; no agent writes a score, coverage, confidence or verdict.
import { z } from "zod";
import { ConfidenceSchema, EvidenceRefSchema, HttpUrlSchema, UUIDSchema } from "../common";
import { DimensionAssessmentProposalSchema, FindingSchema, KillSeveritySchema } from "../analysis";
import { MonetizationSignalSchema } from "../evidence";

export const PRODUCT_ANALYSIS_CONTRACT_VERSION = "o1.product-analysis.v1";
export const MARKET_ANALYSIS_CONTRACT_VERSION = "o2.market-analysis.v1";
export const CUSTOMER_VOICE_CONTRACT_VERSION = "o3.customer-voice.v1";
export const COMPETITOR_ANALYSIS_CONTRACT_VERSION = "o4.competitor-analysis.v1";
export const LOCALIZATION_CONTRACT_VERSION = "o5.localization.v1";
export const WTP_FEASIBILITY_CONTRACT_VERSION = "o6.wtp-feasibility.v1";
export const DIMENSION_ASSESSMENT_CONTRACT_VERSION = "o7.dimension-assessment.v1";
export const RED_TEAM_CONTRACT_VERSION = "o8.red-team.v1";
export const REPORT_CONTRACT_VERSION = "o9.report.v1";

const Evidence = (max = 20) => z.array(EvidenceRefSchema).max(max).default([]);
const hasSupport = (e: Array<{ support_type: string }>) =>
  e.some((x) => x.support_type === "supports");

/**
 * A statement of an agent: evidence-linked, or explicitly a hypothesis
 * (CLAUDE.md §9 "Every finding that affects the recommendation needs evidence
 * or must be explicitly labeled as a hypothesis").
 */
export const StatementSchema = z
  .object({
    text: z.string().trim().min(1).max(1500),
    is_hypothesis: z.boolean(),
    evidence: Evidence(),
  })
  .strict()
  .refine((s) => s.is_hypothesis || hasSupport(s.evidence), {
    path: ["evidence"],
    message: "A non-hypothesis statement needs supporting evidence",
  });
export type Statement = z.infer<typeof StatementSchema>;
const Statements = (max = 10) => z.array(StatementSchema).max(max).default([]);

const Level = z.enum(["low", "medium", "high", "unknown"]);

// ---------------------------------------------------------------- O1
export const ProductAnalysisSchema = z
  .object({
    positioning: StatementSchema.nullable(),
    target_customer: StatementSchema.nullable(),
    core_jtbd: StatementSchema.nullable(),
    features_observed: z
      .array(
        z
          .object({ name: z.string().trim().min(1).max(200), evidence: Evidence() })
          .strict()
          .refine((f) => hasSupport(f.evidence), {
            path: ["evidence"],
            message: "An observed feature needs supporting evidence",
          }),
      )
      .max(50)
      .default([]),
    // §8.2: never "missing" because it was not seen on a marketing site.
    features_not_observed: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(200),
            status: z.enum(["not_observed", "verified_absent"]),
            evidence: Evidence(),
          })
          .strict()
          .refine((f) => f.status === "not_observed" || hasSupport(f.evidence), {
            path: ["evidence"],
            message: "verified_absent needs supporting evidence; otherwise use not_observed",
          }),
      )
      .max(50)
      .default([]),
    pricing_model: StatementSchema.nullable(),
    integrations: z
      .array(
        z
          .object({ name: z.string().trim().min(1).max(200), evidence: Evidence() })
          .strict()
          .refine((f) => hasSupport(f.evidence), {
            path: ["evidence"],
            message: "An integration needs supporting evidence",
          }),
      )
      .max(50)
      .default([]),
    limitations: Statements(20),
    evidence_gaps: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  })
  .strict();

// ---------------------------------------------------------------- O2
export const MarketAnalysisSchema = z
  .object({
    market_definition: StatementSchema.nullable(),
    segments: Statements(),
    demand_signals: Statements(),
    spend_signals: Statements(),
    trends: z
      .array(
        z
          .object({
            statement: z.string().trim().min(1).max(1000),
            as_of: z
              .string()
              .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/)
              .nullable(),
            is_hypothesis: z.boolean(),
            evidence: Evidence(),
          })
          .strict()
          .refine((t) => t.is_hypothesis || (hasSupport(t.evidence) && t.as_of !== null), {
            path: ["evidence"],
            message: "A non-hypothesis trend needs a date and supporting evidence",
          }),
      )
      .max(10)
      .default([]),
    // §8.3: low competition is not automatically positive.
    competitive_intensity: z
      .object({ level: Level, explanation: StatementSchema.nullable() })
      .strict(),
    // §8.3: no invented TAM/SAM/SOM.
    market_size: z.discriminatedUnion("status", [
      z
        .object({
          status: z.literal("estimated"),
          value: z.number().positive(),
          unit: z.enum(["annual_spend", "companies", "users"]),
          currency: z
            .string()
            .regex(/^[A-Z]{3}$/)
            .nullable(),
          geography: z.string().trim().min(1).max(100),
          methodology: z.string().trim().min(20).max(2000),
          evidence: z.array(EvidenceRefSchema).min(1).max(20),
        })
        .strict()
        .refine((m) => hasSupport(m.evidence), {
          path: ["evidence"],
          message: "A market-size estimate needs supporting evidence",
        })
        .refine((m) => m.unit !== "annual_spend" || m.currency !== null, {
          path: ["currency"],
          message: "A spend estimate needs a currency",
        }),
      z
        .object({
          status: z.literal("insufficient_data"),
          reason: z.string().trim().min(1).max(1000),
        })
        .strict(),
    ]),
  })
  .strict();

// ---------------------------------------------------------------- O3
// Counts come from the Pain Point Engine (deterministic P7); the summary
// cites cluster IDs and evidence. Prevalence among all customers is never
// inferred from a self-selected sample (§8.4).
export const CustomerVoiceSchema = z
  .object({
    top_problems: z
      .array(
        z
          .object({
            cluster_id: UUIDSchema,
            summary: z.string().trim().min(1).max(1000),
            examples: z.array(EvidenceRefSchema).min(1).max(5),
          })
          .strict(),
      )
      .max(5),
    relevant_source_count: z.number().int().min(0),
    distinct_author_count: z.number().int().min(0).nullable(),
    sample_limitations: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
  })
  .strict();

// ---------------------------------------------------------------- O4
export const CompetitorRelationshipSchema = z.enum([
  "direct",
  "indirect",
  "alternative",
  "substitute",
  "adjacent",
]);
export const SegmentFacetSchema = z.enum(["cheaper", "more_advanced", "free", "french", "us"]);

export const CompetitorAnalysisSchema = z
  .object({
    competitors: z
      .array(
        z
          .object({
            product_id: UUIDSchema.nullable(),
            name: z.string().trim().min(1).max(200),
            website_url: HttpUrlSchema.nullable(),
            relationship_type: CompetitorRelationshipSchema,
            segment_facets: z.array(SegmentFacetSchema).max(5).default([]),
            positioning: StatementSchema.nullable(),
            target_segment: z.string().trim().min(1).max(300).nullable(),
            pricing_evidence: StatementSchema.nullable(),
            feature_overlap: z.string().trim().min(1).max(1000).nullable(),
            differentiators: Statements(),
            weaknesses: z
              .array(StatementSchema)
              .max(10)
              .default([])
              .refine((w) => w.every((s) => !s.is_hypothesis), {
                message: "Weaknesses are reported only when evidenced",
              }),
            evidence: Evidence(),
            confidence: ConfidenceSchema,
          })
          .strict()
          // §8.5: similarity is not enough to call a product a direct competitor.
          .refine((c) => c.relationship_type !== "direct" || hasSupport(c.evidence), {
            path: ["evidence"],
            message: "A direct competitor needs supporting evidence",
          }),
      )
      .max(30),
    // Filled by the server: the agent never sees products that are not eligible.
    omitted_excluded_count: z.number().int().min(0).default(0),
  })
  .strict();

// ---------------------------------------------------------------- O5
export const LocalizationSchema = z
  .object({
    french_availability: z
      .object({
        status: z.enum(["available", "partial", "not_observed", "unknown"]),
        evidence: Evidence(),
      })
      .strict()
      .refine((a) => !["available", "partial"].includes(a.status) || hasSupport(a.evidence), {
        path: ["evidence"],
        message: "French availability needs supporting evidence",
      }),
    french_competitors: z
      .array(
        z
          .object({
            product_id: UUIDSchema.nullable(),
            name: z.string().trim().min(1).max(200),
            evidence: Evidence(),
          })
          .strict()
          .refine((c) => hasSupport(c.evidence), {
            path: ["evidence"],
            message: "A French competitor needs supporting evidence",
          }),
      )
      .max(20)
      .default([]),
    local_needs: Statements(),
    local_integrations: Statements(),
    language_support_expectations: StatementSchema.nullable(),
    regulatory_notes: Statements(),
    pricing_distribution_notes: StatementSchema.nullable(),
    // §8.6: translation alone is not a defensible opportunity.
    unmet_need_beyond_translation: z
      .object({
        exists: z.boolean().nullable(),
        explanation: z.string().trim().min(1).max(1500),
        evidence: Evidence(),
      })
      .strict()
      .refine((u) => u.exists !== true || hasSupport(u.evidence), {
        path: ["evidence"],
        message: "An unmet local need needs supporting evidence",
      }),
  })
  .strict();

// ---------------------------------------------------------------- O6
const FeasibilityItem = z
  .object({ level: Level, explanation: z.string().trim().min(1).max(1000), evidence: Evidence() })
  .strict();

export const WtpFeasibilitySchema = z
  .object({
    // One entry per category: categories are never merged into one count (§8.7).
    wtp_evidence: z
      .array(
        z
          .object({
            category: MonetizationSignalSchema,
            evidence: z.array(EvidenceRefSchema).min(1).max(30),
          })
          .strict(),
      )
      .max(6)
      .refine((a) => new Set(a.map((x) => x.category)).size === a.length, {
        message: "One entry per WTP category",
      }),
    feasibility: z
      .object({
        technical_complexity: FeasibilityItem,
        dependencies: FeasibilityItem,
        build_effort: FeasibilityItem,
        operating_cost: FeasibilityItem,
        data_access_risk: FeasibilityItem,
        distribution_access: FeasibilityItem,
        switching_cost: FeasibilityItem,
        support_burden: FeasibilityItem,
      })
      .strict(),
    assumptions: z.array(z.string().trim().min(1).max(500)).min(1).max(30),
    uncertainty: z
      .object({ level: z.enum(["low", "medium", "high"]), note: z.string().trim().max(1000) })
      .strict(),
  })
  .strict();

// ---------------------------------------------------------------- O7a
export const DimensionAssessmentOutputSchema = z
  .object({
    proposals: z
      .array(DimensionAssessmentProposalSchema)
      .length(6)
      .refine((p) => new Set(p.map((x) => x.dimension_key)).size === 6, {
        message: "One proposal per dimension",
      }),
    findings: z.array(FindingSchema).max(30).default([]),
  })
  .strict();

// ---------------------------------------------------------------- O8
export const RedTeamSchema = z
  .object({
    strongest_counterarguments: z
      .array(
        z
          .object({
            argument: z.string().min(1).max(1000),
            evidence: z.array(EvidenceRefSchema).max(10),
          })
          .strict(),
      )
      .min(1) // at least one material counterargument
      .max(20),
    kill_criteria: z
      .array(
        z
          .object({
            criterion: z.string().min(1).max(300),
            severity: KillSeveritySchema,
            explanation: z.string().min(1).max(2000),
            evidence: z.array(EvidenceRefSchema).max(20),
          })
          .strict(),
      )
      .max(20),
    unresolved_assumptions: z.array(z.string().max(500)).max(30),
    recommended_verdict: z.enum(["build_candidate", "validate_first", "reject"]), // advisory only
    confidence: ConfidenceSchema,
  })
  .strict();

// ---------------------------------------------------------------- O9
// Narrative sections of PRD §9. The server adds the scoring block, verdict,
// deterministic pain statistics, competitor matrix and evidence index; the
// composer cannot change scores or the verdict (§8.10).
const OpportunityMapEntrySchema = z
  .object({
    priority: z.number().int().min(1).max(10),
    problem: z.string().trim().min(1).max(500),
    customer_segment: z.string().trim().min(1).max(300),
    proposed_solution: z.string().trim().min(1).max(1000),
    competitive_advantage: z.string().trim().min(1).max(500),
    development_difficulty: Level,
    commercial_potential: Level,
    is_hypothesis: z.boolean(),
    evidence: Evidence(),
  })
  .strict()
  .refine((o) => o.is_hypothesis || hasSupport(o.evidence), {
    path: ["evidence"],
    message: "A non-hypothesis opportunity needs supporting evidence",
  });

export const RecommendedProductSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    value_proposition: z.string().trim().min(1).max(1000),
    initial_target: z.string().trim().min(1).max(500),
    positioning: z.string().trim().min(1).max(1000),
    mvp_features: z.array(z.string().trim().min(1).max(300)).min(1).max(15),
    secondary_features: z.array(z.string().trim().min(1).max(300)).max(15).default([]),
    pricing_hypothesis: z.string().trim().min(1).max(500),
    main_advantage: z.string().trim().min(1).max(500),
    // A product to build is a hypothesis by nature; evidence is the basis.
    is_hypothesis: z.literal(true),
    evidence: Evidence(),
  })
  .strict();

export const ValidationExperimentSchema = z
  .object({
    type: z.enum([
      "user_interviews",
      "landing_page",
      "demo",
      "presale",
      "pricing_test",
      "paid_pilot",
      "other",
    ]),
    description: z.string().trim().min(1).max(1000),
    success_threshold: z.string().trim().min(1).max(500),
    abandon_threshold: z.string().trim().min(1).max(500),
    estimated_effort: z.string().trim().min(1).max(300),
  })
  .strict();

export const AnalysisReportSchema = z
  .object({
    executive_summary: z
      .object({
        description: StatementSchema,
        main_reasons: z.array(StatementSchema).min(1).max(3),
      })
      .strict(),
    market_analysis: z
      .object({
        market: Statements(5),
        target: Statements(5),
        demand: Statements(5),
        trends: Statements(5),
        competition: Statements(5),
      })
      .strict(),
    customer_pain: z.object({ narrative: Statements() }).strict(),
    cross_competitor_pain: z.object({ narrative: Statements() }).strict(),
    market_gaps: z
      .object({
        common_problems: Statements(),
        unmet_needs: Statements(),
        missing_features: Statements(),
        insufficient_solutions: Statements(),
        independent_opportunities: Statements(),
        failure_reasons: z.array(StatementSchema).min(1).max(10),
      })
      .strict(),
    competitor_analysis: z.object({ narrative: Statements() }).strict(),
    opportunity_map: z.array(OpportunityMapEntrySchema).max(10),
    recommended_product: RecommendedProductSchema.nullable(),
    go_to_market: z
      .object({
        acquisition_channel: StatementSchema.nullable(),
        first_audience: StatementSchema.nullable(),
        prospecting_method: StatementSchema.nullable(),
        launch_strategy: StatementSchema.nullable(),
        validation_effort: StatementSchema.nullable(),
      })
      .strict(),
    validation_plan: z.array(ValidationExperimentSchema).max(10),
    risks: z
      .object({
        reasons_not_to_build: Statements(),
        technical: Statements(),
        commercial: Statements(),
        competitive: Statements(),
        regulatory: Statements(),
        unverified_information: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
      })
      .strict(),
    final_verdict_explanation: z.array(StatementSchema).min(1).max(5),
  })
  .strict();

export type ProductAnalysis = z.infer<typeof ProductAnalysisSchema>;
export type MarketAnalysis = z.infer<typeof MarketAnalysisSchema>;
export type CustomerVoice = z.infer<typeof CustomerVoiceSchema>;
export type CompetitorAnalysis = z.infer<typeof CompetitorAnalysisSchema>;
export type Localization = z.infer<typeof LocalizationSchema>;
export type WtpFeasibility = z.infer<typeof WtpFeasibilitySchema>;
export type DimensionAssessmentOutput = z.infer<typeof DimensionAssessmentOutputSchema>;
export type RedTeam = z.infer<typeof RedTeamSchema>;
export type AnalysisReport = z.infer<typeof AnalysisReportSchema>;
export type RecommendedProduct = z.infer<typeof RecommendedProductSchema>;
