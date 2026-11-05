// opportunity_analysis orchestrator on in-memory ports with the fake provider:
// incomplete evidence → VALIDATE FIRST, complete coverage, fatal flaw → REJECT,
// resume without repeated model calls, needs_review after two rejected
// assessments, permanent exclusion of recommendations and competitors,
// options, cancellation, evidence-index integrity of the report.
import { describe, expect, it } from "vitest";
import { AIGateway, FAKE_MODELS, FakeProvider, type FakeHandler } from "@sor/ai-gateway";
import { fakeOpportunityHandlers } from "../fake";
import { opportunityMemoryPorts, opportunityMemoryStore } from "../memory";
import { runOpportunityAnalysis } from "../pipeline";
import { O4_AGENT_KEY, O7_AGENT_KEY, O9_AGENT_KEY } from "../prompts";
import { renderMarkdown } from "../report";
import type { AnalysisContext, CandidateEvidence, CustomerVoiceData } from "../types";

const SUBJECT = "00000000-0000-4000-8000-00000000a001";
const RIVAL = "00000000-0000-4000-8000-00000000a002";
const analysis = (over: Partial<AnalysisContext> = {}): AnalysisContext => ({
  id: "00000000-0000-4000-8000-0000000000aa",
  workspaceId: "w",
  subjectType: "product",
  subjectSnapshot: {
    type: "product",
    product: { id: SUBJECT, name: "MetricFlow" },
    omitted_excluded_count: 1,
  },
  depth: "standard",
  targetMarket: "FR",
  context: {},
  options: {
    analyze_competitors: true,
    analyze_customer_reviews: true,
    analyze_local_market: true,
    generate_validation_plan: true,
  },
  thresholds: { minScore: 75, minWtp: 10 },
  scope: [
    {
      id: SUBJECT,
      name: "MetricFlow",
      slug: "metricflow",
      role: "subject",
      visible: true,
      websiteUrl: "https://metricflow.test",
      primaryCategorySlugs: [],
    },
    {
      id: RIVAL,
      name: "LeadNest",
      slug: "leadnest",
      role: "competitor",
      visible: true,
      websiteUrl: "https://leadnest.test",
      primaryCategorySlugs: [],
    },
  ],
  ...over,
});

let n = 0;
function ev(
  product: string | null,
  claimType: string,
  text: string,
  over: Partial<CandidateEvidence> = {},
): CandidateEvidence {
  n++;
  return {
    evidenceId: `00000000-0000-4000-9000-${String(n).padStart(12, "0")}`,
    sourceRecordId: `record-${n}`,
    reliabilityLevel: 2,
    verificationStatus: "unverified",
    observedAt: "2026-10-01T00:00:00Z",
    publishedAt: null,
    monetizationSignal: null,
    inOpenConflict: false,
    productId: product,
    companyId: null,
    categoryId: null,
    claimType,
    claimText: text,
    evidenceType: "official_statement",
    factStatus: "confirmed",
    sourceUrl: `https://source.test/${n}`,
    sourceName: "Official website",
    ...over,
  };
}
const sparse = () => [
  ev(SUBJECT, "feature", "Dashboards for marketing teams"),
  ev(SUBJECT, "pricing", "Pro plan at 49 USD per month", {
    monetizationSignal: "paid_plan_available",
  }),
  ev(RIVAL, "feature", "Lead scoring"),
];
const gateway = (handlers: Record<string, FakeHandler> = fakeOpportunityHandlers) =>
  new AIGateway({ provider: new FakeProvider(handlers), models: FAKE_MODELS });

function voiceFor(evidence: CandidateEvidence[]): CustomerVoiceData {
  const pains = evidence.filter((e) => e.claimType === "customer_feedback");
  return {
    runId: "00000000-0000-4000-8000-0000000000bb",
    reusedRun: true,
    clusters: [
      {
        clusterId: "00000000-0000-4000-8000-0000000000cc",
        name: "CSV export times out",
        problemCategory: "performance",
        frequencyLabel: "recurring",
        feedbackCount: pains.length,
        affectedProductCount: 2,
        distinctAuthorCount: pains.length,
        distinctAuthorCountStatus: "verified",
        distinctCompanyCount: 2,
        distinctCompanyCountStatus: "estimated",
        productDistribution: [],
        resolutionBreakdown: { unknown: pains.length },
        workarounds: [],
        evidenceIds: pains.map((e) => e.evidenceId),
      },
    ],
    relevantSourceCount: pains.length,
    distinctAuthorCount: pains.length,
    limitations: [{ code: "review_sample_not_representative" }],
  };
}

describe("runOpportunityAnalysis", () => {
  it("incomplete evidence gives VALIDATE FIRST with provisional points and a labelled simulated report", async () => {
    const { ports, store } = opportunityMemoryPorts({
      analysis: analysis(),
      evidence: sparse(),
      gateway: gateway(),
    });
    const out = await runOpportunityAnalysis(ports);
    expect(out.state).toBe("completed");
    const f = store.final!;
    expect(f.verdict).toBe("validate_first");
    expect(f.score.score_total).toBeNull();
    expect(f.score.score_coverage).toBeLessThan(100);
    expect(f.score.decision_band).toBeNull();
    expect((f.verdict_reasons as Array<{ code: string }>).map((r) => r.code)).toContain(
      "INCOMPLETE_COVERAGE",
    );
    // A pricing page alone never proves paying customers.
    expect(
      f.dimensions.find((d) => d.dimension_key === "willingness_to_pay")!.rating,
    ).toBeLessThanOrEqual(3);
    expect(f.report.simulated).toBe(true);
    expect(f.limitations).toContainEqual({ code: "simulated_provider" });
    expect(f.findings.some((x) => x.finding_type === "kill_criterion")).toBe(true);
    expect(
      (f.report.competitor_analysis as { omitted_excluded_count: number }).omitted_excluded_count,
    ).toBe(1);
    // Every cited evidence id is in the index.
    const cited = JSON.stringify(f).match(/"evidence_id":"[^"]+"/g) ?? [];
    for (const c of cited) expect(store.index.has(c.split(":")[1]!.replace(/"/g, ""))).toBe(true);
    const md = renderMarkdown(f.report, "MetricFlow");
    expect(md).toContain("Données simulées");
    expect(md).toContain("Provisoire :");
    expect(md).not.toMatch(/\d+ \/ 100/);
  });

  it("a resumed job repeats no model call", async () => {
    const store = opportunityMemoryStore();
    const evidence = sparse();
    await runOpportunityAnalysis(
      opportunityMemoryPorts({ analysis: analysis(), evidence, gateway: gateway(), store }).ports,
    );
    const calls = store.modelCalls;
    expect(calls).toBeGreaterThan(5);
    await runOpportunityAnalysis(
      opportunityMemoryPorts({ analysis: analysis(), evidence, gateway: gateway(), store }).ports,
    );
    expect(store.modelCalls).toBe(calls);
  });

  it("scores a complete assessment with a final score and band", async () => {
    const evidence = [
      ...sparse(),
      ev(SUBJECT, "customer_feedback", "The CSV export times out", { reliabilityLevel: 4 }),
      ev(RIVAL, "customer_feedback", "Our CSV export times out", { reliabilityLevel: 4 }),
      ev(null, "market_trend", "Analytics budgets grew in 2026", {
        evidenceType: "market_evidence",
      }),
      ev(SUBJECT, "paid_customer_signal", "Case study: Shop A pays for Pro", {
        monetizationSignal: "customer_verified",
        verificationStatus: "verified",
        reliabilityLevel: 1,
      }),
    ];
    const { ports, store } = opportunityMemoryPorts({
      analysis: analysis(),
      evidence,
      voice: voiceFor(evidence),
      gateway: gateway(),
    });
    await runOpportunityAnalysis(ports);
    const f = store.final!;
    expect(f.score.score_coverage).toBe(100);
    // 12 + 12 + 12 + 9 + 6 + 9 = 60 → Faible potentiel, VALIDATE FIRST (PD-06 B).
    expect(f.score.score_total).toBe(60);
    expect(f.score.willingness_to_pay_score).toBe(12);
    expect(f.score.decision_band).toBe("low_potential");
    expect(f.verdict).toBe("validate_first");
    expect(
      (f.report.customer_voice as { relevant_source_count: number }).relevant_source_count,
    ).toBe(2);
    expect(renderMarkdown(f.report, "MetricFlow")).toContain("60 / 100 · Bande : Faible potentiel");
  });

  it("a substantiated critical kill criterion gives REJECT", async () => {
    const evidence = [
      ...sparse(),
      ev(SUBJECT, "maturity", "MetricFlow will be discontinued at the end of 2026", {
        verificationStatus: "verified",
        reliabilityLevel: 1,
      }),
    ];
    const { ports, store } = opportunityMemoryPorts({
      analysis: analysis(),
      evidence,
      gateway: gateway(),
    });
    await runOpportunityAnalysis(ports);
    expect(store.final!.verdict).toBe("reject");
    expect(store.final!.findings.find((x) => x.severity === "critical")!.is_substantiated).toBe(
      true,
    );
  });

  it("an assessment rejected twice needs review and never gets a score", async () => {
    const bad: FakeHandler = (call) => {
      const out = fakeOpportunityHandlers[O7_AGENT_KEY]!(call) as {
        proposals: Array<Record<string, unknown>>;
      };
      const id = call.request.untrustedInputs[0]!.ref;
      out.proposals[0] = {
        dimension_key: "customer_demand",
        assessment_status: "assessed",
        rating: 5,
        explanation: "context only",
        evidence: [{ evidence_id: id, support_type: "context" }],
      };
      return out;
    };
    const { ports, store } = opportunityMemoryPorts({
      analysis: analysis(),
      evidence: sparse(),
      gateway: gateway({ ...fakeOpportunityHandlers, [O7_AGENT_KEY]: bad }),
    });
    const out = await runOpportunityAnalysis(ports);
    expect(out.needsReview).toBe(true);
    expect(store.final).toBeNull();
    expect(store.needsReview).toContainEqual(
      expect.objectContaining({ code: "dimension_assessment_needs_review" }),
    );
    expect([...store.steps.keys()].filter((k) => k.startsWith(O7_AGENT_KEY))).toHaveLength(2);
  });

  it("removes an excluded recommendation and an excluded competitor (permanent exclusion)", async () => {
    const o9: FakeHandler = async (call) => {
      const out = (await fakeOpportunityHandlers[O9_AGENT_KEY]!(call)) as Record<
        string,
        Record<string, unknown>
      >;
      out.recommended_product = {
        ...out.recommended_product,
        name: "Affiliate payout network for creators",
      };
      return out;
    };
    const o4: FakeHandler = async (call) => {
      const out = (await fakeOpportunityHandlers[O4_AGENT_KEY]!(call)) as {
        competitors: unknown[];
      };
      out.competitors.push({
        product_id: null,
        name: "Affiliate management platform",
        website_url: null,
        relationship_type: "adjacent",
        positioning: null,
        target_segment: null,
        pricing_evidence: null,
        feature_overlap: null,
        confidence: 10,
      });
      return out;
    };
    const { ports, store } = opportunityMemoryPorts({
      analysis: analysis(),
      evidence: sparse(),
      gateway: gateway({ ...fakeOpportunityHandlers, [O9_AGENT_KEY]: o9, [O4_AGENT_KEY]: o4 }),
    });
    await runOpportunityAnalysis(ports);
    const f = store.final!;
    expect((f.report.narrative as { recommended_product: unknown }).recommended_product).toBeNull();
    expect(f.report.recommended_product_status).toBe("excluded");
    const names = (
      f.report.competitor_analysis as { competitors: Array<{ name: string }> }
    ).competitors.map((c) => c.name);
    expect(names).not.toContain("Affiliate management platform");
    expect(f.limitations).toContainEqual(
      expect.objectContaining({ code: "excluded_items_removed" }),
    );
    expect(f.verdict).not.toBe("build_candidate");
  });

  it("respects the options and the evidence scope", async () => {
    const hidden = "00000000-0000-4000-8000-00000000a003";
    const a = analysis({
      options: {
        analyze_competitors: false,
        analyze_customer_reviews: false,
        analyze_local_market: false,
        generate_validation_plan: false,
      },
      scope: [
        ...analysis().scope,
        {
          id: hidden,
          name: "Gone",
          slug: "gone",
          role: "competitor",
          visible: false,
          websiteUrl: null,
          primaryCategorySlugs: [],
        },
      ],
    });
    const evidence = [...sparse(), ev(hidden, "feature", "Hidden product feature")];
    const { ports, store } = opportunityMemoryPorts({ analysis: a, evidence, gateway: gateway() });
    await runOpportunityAnalysis(ports);
    expect(store.customerVoiceCalls).toBe(0);
    expect(store.index.has(evidence[3]!.evidenceId)).toBe(false);
    const codes = store.final!.limitations.map((l) => l.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "customer_reviews_not_analysed",
        "competitors_not_analysed",
        "local_market_not_analysed",
        "products_no_longer_visible",
      ]),
    );
    expect(
      (store.final!.report.narrative as { validation_plan: unknown[] }).validation_plan,
    ).toEqual([]);
  });

  it("stops on cancellation without writing results", async () => {
    let calls = 0;
    const { ports, store } = opportunityMemoryPorts({
      analysis: analysis(),
      evidence: sparse(),
      gateway: gateway(),
      stop: () => (++calls > 3 ? "cancelled" : null),
    });
    const out = await runOpportunityAnalysis(ports);
    expect(out.state).toBe("cancelled");
    expect(store.final).toBeNull();
  });
});
