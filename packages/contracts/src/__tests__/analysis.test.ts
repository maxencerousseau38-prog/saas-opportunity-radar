// Opportunity analysis and O1–O9 agent contracts (Implementation Blueprint §4.8, §4.9).
import { describe, expect, it } from "vitest";
import {
  AnalysisRequestSchema,
  DimensionAssessmentProposalSchema,
  FindingSchema,
  ProductAnalysisShortcutSchema,
} from "../analysis";
import {
  AnalysisReportSchema,
  CompetitorAnalysisSchema,
  CustomerVoiceSchema,
  DimensionAssessmentOutputSchema,
  LocalizationSchema,
  MarketAnalysisSchema,
  ProductAnalysisSchema,
  RedTeamSchema,
  StatementSchema,
  WtpFeasibilitySchema,
} from "../agents/opportunity";

const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const sup = [{ evidence_id: ID, support_type: "supports" as const }];
const fact = { text: "Observed on the pricing page", is_hypothesis: false, evidence: sup };
const hyp = { text: "Probably a solo-founder product", is_hypothesis: true };

describe("AnalysisRequestSchema", () => {
  it("applies the documented defaults", () => {
    const r = AnalysisRequestSchema.parse({ subject: { type: "product", product_id: ID } });
    expect(r.analysis_type).toBe("opportunity");
    expect(r.analysis_depth).toBe("deep");
    expect(r.context.target_country).toBe("FR");
    expect(r.context.preferred_customer_type).toBe("b2b");
    expect(r.options.generate_validation_plan).toBe(true);
  });

  it("accepts the five subject types", () => {
    for (const subject of [
      { type: "product", product_id: ID },
      { type: "product_set", product_ids: [ID, ID2] },
      { type: "category", category_slug: "marketing-growth-seo" },
      { type: "pain_point_cluster", cluster_id: ID },
      { type: "generated_opportunity", generated_opportunity_id: ID },
    ]) {
      expect(AnalysisRequestSchema.safeParse({ subject }).success).toBe(true);
    }
  });

  it("bounds a product set to 2–10 products", () => {
    const ids = (n: number) =>
      Array.from({ length: n }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`);
    expect(
      AnalysisRequestSchema.safeParse({ subject: { type: "product_set", product_ids: ids(1) } })
        .success,
    ).toBe(false);
    expect(
      AnalysisRequestSchema.safeParse({ subject: { type: "product_set", product_ids: ids(11) } })
        .success,
    ).toBe(false);
  });

  it("needs a product set for a comparison", () => {
    expect(
      AnalysisRequestSchema.safeParse({
        analysis_type: "comparison",
        subject: { type: "product", product_id: ID },
      }).success,
    ).toBe(false);
  });

  it("cannot express an exclusion override or unknown fields", () => {
    expect(
      AnalysisRequestSchema.safeParse({
        subject: { type: "product", product_id: ID },
        include_excluded: true,
      }).success,
    ).toBe(false);
    expect(ProductAnalysisShortcutSchema.safeParse({ product_id: ID }).success).toBe(false);
  });
});

describe("DimensionAssessmentProposalSchema", () => {
  it("accepts an integer rating with evidence", () => {
    const p = DimensionAssessmentProposalSchema.parse({
      dimension_key: "customer_demand",
      assessment_status: "assessed",
      rating: 4,
      explanation: "Recurring complaints across three products",
      evidence: sup,
    });
    expect(p.assessment_status).toBe("assessed");
  });

  it("rejects decimal ratings (PD-05) and assessed dimensions without evidence", () => {
    const base = {
      dimension_key: "customer_demand",
      assessment_status: "assessed",
      explanation: "x",
    };
    expect(
      DimensionAssessmentProposalSchema.safeParse({ ...base, rating: 3.5, evidence: sup }).success,
    ).toBe(false);
    expect(
      DimensionAssessmentProposalSchema.safeParse({ ...base, rating: 3, evidence: [] }).success,
    ).toBe(false);
  });

  it("insufficient evidence carries no rating and lists missing information", () => {
    expect(
      DimensionAssessmentProposalSchema.safeParse({
        dimension_key: "willingness_to_pay",
        assessment_status: "insufficient_evidence",
        explanation: "No payment evidence",
        missing_information: ["Proof of paying customers"],
      }).success,
    ).toBe(true);
    expect(
      DimensionAssessmentProposalSchema.safeParse({
        dimension_key: "willingness_to_pay",
        assessment_status: "insufficient_evidence",
        rating: 0,
        explanation: "No payment evidence",
        missing_information: ["Proof of paying customers"],
      }).success,
    ).toBe(false);
    expect(
      DimensionAssessmentProposalSchema.safeParse({
        dimension_key: "willingness_to_pay",
        assessment_status: "insufficient_evidence",
        explanation: "No payment evidence",
        missing_information: [],
      }).success,
    ).toBe(false);
  });
});

describe("FindingSchema", () => {
  const base = {
    type: "risk",
    title: "Crowded market",
    description: "Many alternatives",
    priority: 2,
    confidence: 50,
    is_hypothesis: false,
    severity: null,
    dimension_key: null,
    evidence: sup,
  };
  it("needs supporting evidence unless it is a hypothesis", () => {
    expect(FindingSchema.safeParse(base).success).toBe(true);
    expect(FindingSchema.safeParse({ ...base, evidence: [] }).success).toBe(false);
    expect(FindingSchema.safeParse({ ...base, evidence: [], is_hypothesis: true }).success).toBe(
      true,
    );
  });
  it("requires a severity for kill criteria only", () => {
    expect(FindingSchema.safeParse({ ...base, type: "kill_criterion" }).success).toBe(false);
    expect(
      FindingSchema.safeParse({ ...base, type: "kill_criterion", severity: "critical" }).success,
    ).toBe(true);
    expect(FindingSchema.safeParse({ ...base, severity: "minor" }).success).toBe(false);
  });
});

describe("StatementSchema", () => {
  it("is evidence-linked or a labelled hypothesis", () => {
    expect(StatementSchema.safeParse(fact).success).toBe(true);
    expect(StatementSchema.safeParse(hyp).success).toBe(true);
    expect(
      StatementSchema.safeParse({ text: "Unsupported fact", is_hypothesis: false }).success,
    ).toBe(false);
    expect(
      StatementSchema.safeParse({
        text: "Only context",
        is_hypothesis: false,
        evidence: [{ evidence_id: ID, support_type: "context" }],
      }).success,
    ).toBe(false);
  });
});

describe("O1 ProductAnalysisSchema", () => {
  it("never calls a feature absent without evidence (not_observed)", () => {
    const base = {
      positioning: fact,
      target_customer: null,
      core_jtbd: hyp,
      pricing_model: null,
    };
    expect(
      ProductAnalysisSchema.safeParse({
        ...base,
        features_not_observed: [{ name: "SSO", status: "not_observed" }],
      }).success,
    ).toBe(true);
    expect(
      ProductAnalysisSchema.safeParse({
        ...base,
        features_not_observed: [{ name: "SSO", status: "verified_absent" }],
      }).success,
    ).toBe(false);
    expect(
      ProductAnalysisSchema.safeParse({ ...base, features_observed: [{ name: "CSV export" }] })
        .success,
    ).toBe(false);
  });
});

describe("O2 MarketAnalysisSchema", () => {
  const base = {
    market_definition: null,
    competitive_intensity: { level: "unknown", explanation: null },
  };
  it("refuses a market size without methodology and evidence", () => {
    expect(
      MarketAnalysisSchema.safeParse({
        ...base,
        market_size: { status: "insufficient_data", reason: "No credible source" },
      }).success,
    ).toBe(true);
    expect(
      MarketAnalysisSchema.safeParse({
        ...base,
        market_size: {
          status: "estimated",
          value: 1_000_000,
          unit: "annual_spend",
          currency: "USD",
          geography: "US",
          methodology: "short",
          evidence: sup,
        },
      }).success,
    ).toBe(false);
    expect(
      MarketAnalysisSchema.safeParse({
        ...base,
        market_size: {
          status: "estimated",
          value: 1_000_000,
          unit: "annual_spend",
          currency: null,
          geography: "US",
          methodology: "Bottom-up from the number of agencies times the median plan price",
          evidence: sup,
        },
      }).success,
    ).toBe(false);
  });
  it("needs a date and evidence for a factual trend", () => {
    const trend = { statement: "Growing demand", is_hypothesis: false, evidence: sup };
    const size = { status: "insufficient_data", reason: "n/a" };
    expect(
      MarketAnalysisSchema.safeParse({
        ...base,
        market_size: size,
        trends: [{ ...trend, as_of: null }],
      }).success,
    ).toBe(false);
    expect(
      MarketAnalysisSchema.safeParse({
        ...base,
        market_size: size,
        trends: [{ ...trend, as_of: "2026-09" }],
      }).success,
    ).toBe(true);
  });
});

describe("O3 CustomerVoiceSchema", () => {
  it("references clusters, keeps at most five problems and states sample limitations", () => {
    const problem = { cluster_id: ID, summary: "CSV exports time out", examples: sup };
    expect(
      CustomerVoiceSchema.safeParse({
        top_problems: [problem],
        relevant_source_count: 3,
        distinct_author_count: null,
        sample_limitations: ["Self-selected review sample"],
      }).success,
    ).toBe(true);
    expect(
      CustomerVoiceSchema.safeParse({
        top_problems: Array(6).fill(problem),
        relevant_source_count: 3,
        distinct_author_count: 3,
        sample_limitations: ["x"],
      }).success,
    ).toBe(false);
    expect(
      CustomerVoiceSchema.safeParse({
        top_problems: [],
        relevant_source_count: 0,
        distinct_author_count: null,
        sample_limitations: [],
      }).success,
    ).toBe(false);
  });
});

describe("O4 CompetitorAnalysisSchema", () => {
  const competitor = {
    product_id: null,
    name: "Acme",
    website_url: "https://acme.test",
    relationship_type: "indirect",
    positioning: null,
    target_segment: null,
    pricing_evidence: null,
    feature_overlap: null,
    confidence: 40,
  };
  it("needs evidence for a direct competitor and evidenced weaknesses", () => {
    expect(CompetitorAnalysisSchema.safeParse({ competitors: [competitor] }).success).toBe(true);
    expect(
      CompetitorAnalysisSchema.safeParse({
        competitors: [{ ...competitor, relationship_type: "direct" }],
      }).success,
    ).toBe(false);
    expect(
      CompetitorAnalysisSchema.safeParse({
        competitors: [{ ...competitor, weaknesses: [hyp] }],
      }).success,
    ).toBe(false);
    expect(
      CompetitorAnalysisSchema.safeParse({
        competitors: [{ ...competitor, website_url: "javascript:alert(1)" }],
      }).success,
    ).toBe(false);
  });
});

describe("O5 LocalizationSchema", () => {
  it("does not accept an unmet local need without evidence", () => {
    const base = {
      french_availability: { status: "not_observed" },
      language_support_expectations: null,
      pricing_distribution_notes: null,
    };
    expect(
      LocalizationSchema.safeParse({
        ...base,
        unmet_need_beyond_translation: { exists: true, explanation: "Needs French invoicing" },
      }).success,
    ).toBe(false);
    expect(
      LocalizationSchema.safeParse({
        ...base,
        unmet_need_beyond_translation: { exists: null, explanation: "Unknown" },
      }).success,
    ).toBe(true);
    expect(
      LocalizationSchema.safeParse({
        ...base,
        french_availability: { status: "available" },
        unmet_need_beyond_translation: { exists: null, explanation: "Unknown" },
      }).success,
    ).toBe(false);
  });
});

describe("O6 WtpFeasibilitySchema", () => {
  const item = { level: "unknown", explanation: "Not assessed" };
  const feasibility = Object.fromEntries(
    [
      "technical_complexity",
      "dependencies",
      "build_effort",
      "operating_cost",
      "data_access_risk",
      "distribution_access",
      "switching_cost",
      "support_burden",
    ].map((k) => [k, item]),
  );
  it("keeps WTP categories separate", () => {
    const base = {
      feasibility,
      assumptions: ["Self-serve SaaS"],
      uncertainty: { level: "high", note: "" },
    };
    expect(
      WtpFeasibilitySchema.safeParse({
        ...base,
        wtp_evidence: [{ category: "paid_plan_available", evidence: sup }],
      }).success,
    ).toBe(true);
    expect(
      WtpFeasibilitySchema.safeParse({
        ...base,
        wtp_evidence: [
          { category: "paid_plan_available", evidence: sup },
          { category: "paid_plan_available", evidence: sup },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("O7 DimensionAssessmentOutputSchema", () => {
  const keys = [
    "customer_demand",
    "willingness_to_pay",
    "product_gap",
    "market_attractiveness",
    "competitive_differentiation",
    "feasibility_distribution",
  ];
  const proposal = (k: string) => ({
    dimension_key: k,
    assessment_status: "insufficient_evidence",
    explanation: "Not enough evidence",
    missing_information: ["More sources"],
  });
  it("needs exactly one proposal per dimension", () => {
    expect(
      DimensionAssessmentOutputSchema.safeParse({ proposals: keys.map(proposal) }).success,
    ).toBe(true);
    expect(
      DimensionAssessmentOutputSchema.safeParse({
        proposals: [...keys.slice(0, 5), keys[0]!].map(proposal),
      }).success,
    ).toBe(false);
    expect(
      DimensionAssessmentOutputSchema.safeParse({ proposals: keys.slice(0, 5).map(proposal) })
        .success,
    ).toBe(false);
  });
});

describe("O8 RedTeamSchema", () => {
  it("requires at least one material counterargument", () => {
    const base = {
      kill_criteria: [],
      unresolved_assumptions: [],
      recommended_verdict: "validate_first",
      confidence: 50,
    };
    expect(RedTeamSchema.safeParse({ ...base, strongest_counterarguments: [] }).success).toBe(
      false,
    );
    expect(
      RedTeamSchema.safeParse({
        ...base,
        strongest_counterarguments: [{ argument: "Customers may be satisfied", evidence: [] }],
      }).success,
    ).toBe(true);
  });
});

describe("O9 AnalysisReportSchema", () => {
  const report = {
    executive_summary: { description: fact, main_reasons: [hyp] },
    market_analysis: {},
    customer_pain: {},
    cross_competitor_pain: {},
    market_gaps: { failure_reasons: [hyp] },
    competitor_analysis: {},
    opportunity_map: [],
    recommended_product: null,
    go_to_market: {
      acquisition_channel: null,
      first_audience: null,
      prospecting_method: null,
      launch_strategy: null,
      validation_effort: null,
    },
    validation_plan: [],
    risks: {},
    final_verdict_explanation: [hyp],
  };
  it("accepts a minimal report and has no score or verdict field", () => {
    const r = AnalysisReportSchema.parse(report);
    expect(r).not.toHaveProperty("verdict");
    expect(AnalysisReportSchema.safeParse({ ...report, verdict: "build_candidate" }).success).toBe(
      false,
    );
    expect(AnalysisReportSchema.safeParse({ ...report, score_total: 90 }).success).toBe(false);
  });
  it("always lists reasons the opportunity could fail", () => {
    expect(
      AnalysisReportSchema.safeParse({ ...report, market_gaps: { failure_reasons: [] } }).success,
    ).toBe(false);
  });
  it("labels the recommended product a hypothesis", () => {
    const product = {
      name: "Exporter",
      value_proposition: "Reliable exports",
      initial_target: "Agencies",
      positioning: "Fast",
      mvp_features: ["CSV export"],
      pricing_hypothesis: "29 USD / month",
      main_advantage: "Never times out",
    };
    expect(
      AnalysisReportSchema.safeParse({
        ...report,
        recommended_product: { ...product, is_hypothesis: true },
      }).success,
    ).toBe(true);
    expect(
      AnalysisReportSchema.safeParse({
        ...report,
        recommended_product: { ...product, is_hypothesis: false },
      }).success,
    ).toBe(false);
  });
});
