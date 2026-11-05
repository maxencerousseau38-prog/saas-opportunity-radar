// Pain Point Intelligence contracts (Implementation Blueprint §4.7).
import { describe, expect, it } from "vitest";
import {
  ClusterCorrectionSchema,
  ClusterVerificationOutputSchema,
  GeneratedOpportunityPatchSchema,
  MarketGapOutputSchema,
  OpportunityHypothesisOutputSchema,
  PainPointRunRequestSchema,
  ProblemExtractionOutputSchema,
} from "../pain-points";

const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const problem = {
  is_primary: true,
  problem_statement: "Exports to CSV time out on large accounts",
  problem_category: "performance",
  feature_concerned: "CSV export",
  user_profile: null,
  severity: 4,
  declared_frequency: null,
  operational_consequence: null,
  workaround: null,
  desired_solution: null,
  switching_intent: "unknown",
  vendor_response: null,
  resolution_status: "unknown",
  confidence: 80,
};

describe("PainPointRunRequestSchema", () => {
  it("accepts the three scopes and defaults the feedback cap", () => {
    expect(
      PainPointRunRequestSchema.parse({ title: "T", scope: { type: "product", product_id: ID } })
        .max_feedback_items,
    ).toBe(500);
    expect(
      PainPointRunRequestSchema.safeParse({
        title: "T",
        scope: { type: "product_set", product_ids: [ID, ID2] },
      }).success,
    ).toBe(true);
    expect(
      PainPointRunRequestSchema.safeParse({
        title: "T",
        scope: { type: "category", category_slug: "email" },
      }).success,
    ).toBe(true);
  });
  it("rejects a product set of one, an oversized cap and unknown keys", () => {
    expect(
      PainPointRunRequestSchema.safeParse({
        title: "T",
        scope: { type: "product_set", product_ids: [ID] },
      }).success,
    ).toBe(false);
    expect(
      PainPointRunRequestSchema.safeParse({
        title: "T",
        scope: { type: "product", product_id: ID },
        max_feedback_items: 5000,
      }).success,
    ).toBe(false);
    expect(
      PainPointRunRequestSchema.safeParse({
        title: "T",
        scope: { type: "product", product_id: ID },
        extra: 1,
      }).success,
    ).toBe(false);
  });
});

describe("agent outputs", () => {
  it("P3: zero problems is valid; at most one primary problem", () => {
    expect(
      ProblemExtractionOutputSchema.safeParse({
        feedback_id: ID,
        problems: [],
        injection_suspected: false,
      }).success,
    ).toBe(true);
    expect(
      ProblemExtractionOutputSchema.safeParse({
        feedback_id: ID,
        problems: [problem, problem],
        injection_suspected: false,
      }).success,
    ).toBe(false);
    expect(
      ProblemExtractionOutputSchema.safeParse({
        feedback_id: ID,
        problems: [problem, { ...problem, is_primary: false }],
        injection_suspected: false,
      }).success,
    ).toBe(true);
  });
  it("P6: outliers are identifiers, splits need members", () => {
    const base = {
      cluster_ref: "c1",
      is_coherent: true,
      proposed_name: "N",
      proposed_description: "D",
      target_persona: null,
      outlier_problem_ids: [ID],
      split_proposal: [],
      confidence: 70,
    };
    expect(ClusterVerificationOutputSchema.safeParse(base).success).toBe(true);
    expect(
      ClusterVerificationOutputSchema.safeParse({
        ...base,
        split_proposal: [{ name: "x", problem_ids: [] }],
      }).success,
    ).toBe(false);
  });
  it("P8: an absence of solution can never be declared verified; evidence is required", () => {
    const gap = {
      title: "G",
      gap_type: "shared_problem",
      cluster_ids: [ID],
      description: "D",
      existing_solutions_observed: [],
      absence_of_solution_is_verified: false,
      evidence: [{ evidence_id: ID2 }],
      confidence: 50,
    };
    expect(MarketGapOutputSchema.safeParse({ gaps: [gap] }).success).toBe(true);
    expect(
      MarketGapOutputSchema.safeParse({ gaps: [{ ...gap, absence_of_solution_is_verified: true }] })
        .success,
    ).toBe(false);
    expect(MarketGapOutputSchema.safeParse({ gaps: [{ ...gap, evidence: [] }] }).success).toBe(
      false,
    );
  });
  it("P9: hypotheses cite source clusters and carry the classifier inputs", () => {
    const h = {
      name: "N",
      description: "D",
      problem_statement: "P",
      target_persona: "ICP",
      proposed_solution: "S",
      value_proposition: "V",
      differentiation: "X",
      existing_competitor_product_ids: [],
      business_model_hypothesis: null,
      pricing_hypothesis: null,
      technical_feasibility_notes: null,
      distribution_hypothesis: null,
      validation_needed: "Interview 10 users",
      source_cluster_ids: [ID],
      primary_use_case: "u",
      core_purpose_flag: "unknown",
    };
    expect(OpportunityHypothesisOutputSchema.safeParse({ hypotheses: [h] }).success).toBe(true);
    expect(
      OpportunityHypothesisOutputSchema.safeParse({
        hypotheses: [{ ...h, source_cluster_ids: [] }],
      }).success,
    ).toBe(false);
  });
});

describe("user corrections", () => {
  it("defaults removals and validates moves", () => {
    expect(ClusterCorrectionSchema.parse({ name: "x" }).remove_problem_ids).toEqual([]);
    expect(
      ClusterCorrectionSchema.safeParse({
        move_problem_ids_to_cluster: { target_cluster_id: ID, problem_ids: [] },
      }).success,
    ).toBe(false);
    expect(ClusterCorrectionSchema.safeParse({ review_status: "machine_proposed" }).success).toBe(
      false,
    );
  });
  it("generated opportunity patch needs at least one field", () => {
    expect(GeneratedOpportunityPatchSchema.safeParse({}).success).toBe(false);
    expect(GeneratedOpportunityPatchSchema.safeParse({ status: "to_research" }).success).toBe(true);
  });
});
