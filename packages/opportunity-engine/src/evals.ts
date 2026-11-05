// Evaluation of the Opportunity Engine on fixed fixtures (CLAUDE.md §13,
// Implementation Blueprint §14): verdict consistency, score reproducibility,
// unsupported-claim rate (citations outside the evidence index) and the WTP
// cap. Runs the real pipeline on in-memory ports with any gateway; per-agent
// thresholds come from PD-22.
import type { AIGateway } from "@sor/ai-gateway";
import { opportunityMemoryPorts } from "./memory";
import { runOpportunityAnalysis } from "./pipeline";
import type { AnalysisContext, CandidateEvidence } from "./types";

export interface OpportunityFixture {
  id: string;
  label: string;
  evidence: Array<{
    claim_type: string;
    text: string;
    product?: "subject" | "rival" | null;
    monetization_signal?: string;
    verification_status?: "verified" | "unverified" | "needs_review" | "stale";
    reliability_level?: 1 | 2 | 3 | 4;
  }>;
  expected: {
    verdict: "build_candidate" | "validate_first" | "reject";
    max_wtp_rating?: number;
    no_final_score?: boolean;
    final_score?: boolean;
  };
}

export interface OpportunityFixtureScore {
  id: string;
  verdict: string | null;
  verdictOk: boolean;
  reproducible: boolean;
  citationsOutsideIndex: number;
  failures: string[];
}

const SUBJECT = "00000000-0000-4000-8000-0000000e0001";
const RIVAL = "00000000-0000-4000-8000-0000000e0002";

function context(id: string): AnalysisContext {
  return {
    id,
    workspaceId: "eval",
    subjectType: "product",
    subjectSnapshot: { type: "product", product: { id: SUBJECT, name: "Subject" } },
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
        name: "Subject",
        slug: "subject",
        role: "subject",
        visible: true,
        websiteUrl: null,
        primaryCategorySlugs: [],
      },
      {
        id: RIVAL,
        name: "Rival",
        slug: "rival",
        role: "competitor",
        visible: true,
        websiteUrl: null,
        primaryCategorySlugs: [],
      },
    ],
  };
}

function evidenceOf(f: OpportunityFixture): CandidateEvidence[] {
  return f.evidence.map((e, i) => ({
    evidenceId: `00000000-0000-4000-9000-${String(i + 1).padStart(12, "0")}`,
    sourceRecordId: `${f.id}-${i}`,
    reliabilityLevel: e.reliability_level ?? 2,
    verificationStatus: e.verification_status ?? "unverified",
    observedAt: "2026-10-01T00:00:00Z",
    publishedAt: null,
    monetizationSignal: e.monetization_signal ?? null,
    inOpenConflict: false,
    productId: e.product === null ? null : e.product === "rival" ? RIVAL : SUBJECT,
    companyId: null,
    categoryId: null,
    claimType: e.claim_type,
    claimText: e.text,
    evidenceType: "official_statement",
    factStatus: "declared",
    sourceUrl: null,
    sourceName: null,
  }));
}

async function runOnce(f: OpportunityFixture, gateway: AIGateway) {
  const { ports, store } = opportunityMemoryPorts({
    analysis: context(`00000000-0000-4000-8000-${f.id.length.toString().padStart(12, "0")}`),
    evidence: evidenceOf(f),
    gateway,
  });
  await runOpportunityAnalysis(ports);
  return store;
}

export async function evaluateOpportunityFixture(
  fixture: OpportunityFixture,
  gateway: AIGateway,
): Promise<OpportunityFixtureScore> {
  const failures: string[] = [];
  const a = await runOnce(fixture, gateway);
  const b = await runOnce(fixture, gateway);
  const final = a.final;
  const cited = (JSON.stringify(final ?? {}).match(/"evidence_id":"([^"]+)"/g) ?? []).map((m) =>
    m.slice(15, -1),
  );
  const outside = cited.filter((id) => !a.index.has(id)).length;
  if (!final) failures.push("no final result");
  const verdict = final?.verdict ?? null;
  const verdictOk = verdict === fixture.expected.verdict;
  if (!verdictOk) failures.push(`verdict ${verdict} ≠ ${fixture.expected.verdict}`);
  const wtp = final?.dimensions.find((d) => d.dimension_key === "willingness_to_pay")?.rating;
  if (fixture.expected.max_wtp_rating !== undefined && (wtp ?? 0) > fixture.expected.max_wtp_rating)
    failures.push(`WTP rating ${wtp} above ${fixture.expected.max_wtp_rating}`);
  if (fixture.expected.no_final_score && final?.score.score_total !== null)
    failures.push("a final score was given at partial coverage");
  if (fixture.expected.final_score && final?.score.score_total === null)
    failures.push("no final score at full coverage");
  const reproducible =
    JSON.stringify(final?.score) === JSON.stringify(b.final?.score) &&
    final?.verdict === b.final?.verdict;
  if (!reproducible) failures.push("score or verdict not reproducible");
  if (outside > 0) failures.push(`${outside} citation(s) outside the evidence index`);
  return {
    id: fixture.id,
    verdict,
    verdictOk,
    reproducible,
    citationsOutsideIndex: outside,
    failures,
  };
}

export async function evaluateOpportunityFixtures(
  fixtures: OpportunityFixture[],
  gateway: AIGateway,
) {
  const scores: OpportunityFixtureScore[] = [];
  for (const f of fixtures) scores.push(await evaluateOpportunityFixture(f, gateway));
  return {
    scores,
    verdictConsistency: scores.filter((s) => s.verdictOk).length / scores.length,
    reproducibility: scores.filter((s) => s.reproducible).length / scores.length,
    unsupportedClaims: scores.reduce((s, x) => s + x.citationsOutsideIndex, 0),
  };
}
