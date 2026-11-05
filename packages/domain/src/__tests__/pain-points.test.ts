// P2 deduplication, P5 clustering, P7 statistics, evidence quality
// (Implementation Blueprint §7.2–7.3, §9.4).
import { describe, expect, it } from "vitest";
import {
  aggregateQuality,
  clusterProblems,
  computeClusterStatistics,
  cosineDistance,
  deduplicate,
  evidenceQuality,
  trigramSimilarity,
  type ClusterMember,
  type QualityEvidence,
} from "../pain-points";

const now = new Date("2026-11-05T00:00:00Z");
const ev = (over: Partial<QualityEvidence> = {}): QualityEvidence => ({
  sourceRecordId: "s1",
  reliabilityLevel: 2,
  verificationStatus: "verified",
  datedAt: "2026-06-01T00:00:00Z",
  inOpenConflict: false,
  ...over,
});

describe("evidence quality (§9.4)", () => {
  it("multiplies reliability, verification, freshness and conflict", () => {
    expect(evidenceQuality(ev(), now)).toBe(0.75);
    expect(
      evidenceQuality(ev({ verificationStatus: "unverified", reliabilityLevel: 1 }), now),
    ).toBeCloseTo(0.6);
    expect(evidenceQuality(ev({ datedAt: "2023-01-01T00:00:00Z" }), now)).toBeCloseTo(0.525);
    expect(evidenceQuality(ev({ inOpenConflict: true }), now)).toBeCloseTo(0.375);
  });
  it("keeps the best per source record, sums the top three, caps one source at 0.6", () => {
    expect(aggregateQuality([ev(), ev()], now)).toBe(0.375);
    expect(aggregateQuality([ev({ reliabilityLevel: 1 }), ev({ reliabilityLevel: 1 })], now)).toBe(
      0.5,
    );
    expect(
      aggregateQuality(
        [
          ev({ reliabilityLevel: 1 }),
          ev({ sourceRecordId: "s2", reliabilityLevel: 1 }),
          ev({ sourceRecordId: "s3" }),
        ],
        now,
      ),
    ).toBe(1);
    expect(aggregateQuality([], now)).toBe(0);
  });
});

describe("P2 deduplication", () => {
  it("computes pg_trgm-style similarity", () => {
    expect(trigramSimilarity("Export is slow", "export is slow!")).toBe(1);
    expect(trigramSimilarity("Export is slow", "Pricing is too high")).toBeLessThan(0.3);
  });
  it("marks near duplicates of the earliest item of the same product, flags repeat authors", () => {
    const r = deduplicate([
      {
        id: "b",
        productId: "p1",
        text: "The CSV export times out every single time.",
        publishedAt: "2026-02-01",
        authorReferenceHash: "h1",
      },
      {
        id: "a",
        productId: "p1",
        text: "The CSV export times out every single time!!",
        publishedAt: "2026-01-01",
        authorReferenceHash: "h2",
      },
      {
        id: "c",
        productId: "p2",
        text: "The CSV export times out every single time.",
        publishedAt: "2026-01-01",
        authorReferenceHash: "h1",
      },
      {
        id: "d",
        productId: "p1",
        text: "Support never answers my emails.",
        publishedAt: null,
        authorReferenceHash: null,
      },
    ]);
    expect([...r.duplicateOf.entries()]).toEqual([["b", "a"]]); // same text on another product is not a duplicate
    expect([...r.sameAuthorFlagged].sort()).toEqual(["b", "c"]);
  });
});

describe("P5 clustering (cluster-1)", () => {
  it("measures cosine distance", () => {
    expect(cosineDistance([1, 0], [1, 0])).toBeCloseTo(0);
    expect(cosineDistance([1, 0], [0, 1])).toBeCloseTo(1);
  });
  it("groups close vectors, never across categories, keeps singletons isolated, is order-independent", () => {
    const items = [
      { problemId: "p3", category: "performance", vector: [1, 0.05, 0] },
      { problemId: "p1", category: "performance", vector: [1, 0, 0] },
      { problemId: "p2", category: "performance", vector: [0.98, 0.1, 0] },
      { problemId: "p4", category: "pricing", vector: [1, 0, 0] }, // same vector, other category
      { problemId: "p5", category: "performance", vector: [0, 0, 1] },
    ];
    const r = clusterProblems(items);
    expect(r.clusters).toEqual([{ category: "performance", problemIds: ["p1", "p2", "p3"] }]);
    expect(r.isolated).toEqual(["p4", "p5"]);
    expect(clusterProblems([...items].reverse())).toEqual(r);
  });
  it("uses average linkage: a chain of close neighbours does not merge distant ends", () => {
    const items = [0, 1, 2, 3, 4].map((k) => ({
      problemId: `q${k}`,
      category: "ux",
      vector: [Math.cos((k * 0.6 * Math.PI) / 4), Math.sin((k * 0.6 * Math.PI) / 4)],
    }));
    const r = clusterProblems(items, { distanceThreshold: 0.12, minSize: 2 });
    expect(r.clusters.every((c) => c.problemIds.length < 5)).toBe(true);
  });
});

describe("P7 statistics (freq-1)", () => {
  const member = (over: Partial<ClusterMember>): ClusterMember => ({
    problemId: "x",
    feedbackId: "f",
    productId: "p1",
    authorReferenceHash: null,
    authorCompanyReference: null,
    publishedAt: "2026-03-10T00:00:00Z",
    severity: null,
    resolutionStatus: "unknown",
    isDuplicate: false,
    evidence: ev(),
    ...over,
  });
  const scope = [
    { productId: "p1", totalKnownReviewCount: 40 },
    { productId: "p2", totalKnownReviewCount: null },
  ];

  it("counts several reviews by one author once and excludes duplicates from volume", () => {
    const s = computeClusterStatistics(
      [
        member({ problemId: "a", authorReferenceHash: "h1" }),
        member({ problemId: "b", authorReferenceHash: "h1" }),
        member({ problemId: "c", authorReferenceHash: "h1", isDuplicate: true }),
      ],
      scope,
      { verifierCoherent: true, now },
    );
    expect(s.feedbackCount).toBe(2);
    expect(s.distinctAuthorCount).toBe(1);
    expect(s.distinctAuthorCountStatus).toBe("verified");
    expect(s.frequencyLabel).toBe("isolated");
  });

  it("labels counts estimated when only some authors are known, unknown when none is", () => {
    const some = computeClusterStatistics(
      [member({ authorReferenceHash: "h1" }), member({})],
      scope,
      { verifierCoherent: null, now },
    );
    expect([some.distinctAuthorCount, some.distinctAuthorCountStatus]).toEqual([1, "estimated"]);
    const none = computeClusterStatistics([member({}), member({})], scope, {
      verifierCoherent: null,
      now,
    });
    expect([none.distinctAuthorCount, none.distinctAuthorCountStatus]).toEqual([null, "unknown"]);
    expect(none.confidenceScore).toBeLessThanOrEqual(60);
  });

  it("computes relative frequency only where the review total is known; widespread needs it", () => {
    const members = [
      member({ productId: "p1", authorReferenceHash: "h1" }),
      member({ productId: "p1", authorReferenceHash: "h2" }),
      member({ productId: "p2", authorReferenceHash: "h3" }),
    ];
    const s = computeClusterStatistics(members, scope, { verifierCoherent: true, now });
    expect(s.productDistribution).toEqual([
      { product_id: "p1", count: 2, relative_frequency: 0.05 },
      { product_id: "p2", count: 1, relative_frequency: null },
    ]);
    expect(s.frequencyLabel).toBe("widespread");
    const many = computeClusterStatistics(
      members,
      [{ productId: "p1", totalKnownReviewCount: 400 }, scope[1]!],
      { verifierCoherent: true, now },
    );
    expect(many.frequencyLabel).toBe("recurring"); // 2/400 = 0.5 %: more reviews, not more widespread
  });

  it("breaks down resolution, dates, severity, and lowers confidence for incoherent clusters", () => {
    const members = [
      member({
        resolutionStatus: "resolved",
        severity: 4,
        publishedAt: "2026-01-15T00:00:00Z",
        authorReferenceHash: "h1",
        evidence: ev({ reliabilityLevel: 1 }),
      }),
      member({
        resolutionStatus: "unresolved",
        severity: 2,
        publishedAt: "2026-03-01T00:00:00Z",
        authorReferenceHash: "h2",
        evidence: ev({ sourceRecordId: "s2", reliabilityLevel: 1 }),
      }),
    ];
    const s = computeClusterStatistics(members, scope, { verifierCoherent: true, now });
    expect(s.resolutionBreakdown).toEqual({ resolved: 1, unresolved: 1, unknown: 0 });
    expect(s.monthlyCounts).toEqual([
      { month: "2026-01", count: 1 },
      { month: "2026-03", count: 1 },
    ]);
    expect([s.firstObservedAt, s.lastObservedAt]).toEqual([
      "2026-01-15T00:00:00Z",
      "2026-03-01T00:00:00Z",
    ]);
    expect(s.severityScore).toBe(3);
    expect(s.confidenceScore).toBe(100);
    expect(
      computeClusterStatistics(members, scope, { verifierCoherent: false, now }).confidenceScore,
    ).toBe(60);
  });
});
