// P7 Cross-Competitor Statistics (Implementation Blueprint §7.3): raw volume,
// distinct authors and companies with their status, per-product distribution
// and relative frequency, time evolution, resolution breakdown, frequency
// label (rule set `freq-1`), severity and confidence. Deterministic.
import { aggregateQuality, type QualityEvidence } from "./quality";

export const FREQUENCY_RULE_SET_VERSION = "freq-1" as const;
export const FREQ_1 = {
  recurringMinFeedback: 3,
  recurringMinAuthors: 2,
  widespreadMinProducts: 2,
  widespreadMinRelativeFrequency: 0.05,
} as const;

export type CountStatus = "verified" | "estimated" | "unknown";
export type FrequencyLabel = "isolated" | "recurring" | "widespread" | "unknown";

export interface ClusterMember {
  problemId: string;
  feedbackId: string;
  productId: string;
  /** Salted hash of a source-provided stable author identifier, when known. */
  authorReferenceHash: string | null;
  /** Company of the author, only when stated by the source. */
  authorCompanyReference: string | null;
  publishedAt: string | null;
  severity: number | null;
  resolutionStatus: "resolved" | "unresolved" | "unknown";
  /** Near duplicate of another feedback item (P2): kept, excluded from counts. */
  isDuplicate: boolean;
  evidence: QualityEvidence;
}

export interface ScopeProduct {
  productId: string;
  totalKnownReviewCount: number | null;
}

export interface ClusterStatistics {
  feedbackCount: number;
  distinctAuthorCount: number | null;
  distinctAuthorCountStatus: CountStatus;
  distinctCompanyCount: number | null;
  distinctCompanyCountStatus: CountStatus;
  affectedProductCount: number;
  productDistribution: Array<{
    product_id: string;
    count: number;
    relative_frequency: number | null;
  }>;
  monthlyCounts: Array<{ month: string; count: number }>;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  resolutionBreakdown: { resolved: number; unresolved: number; unknown: number };
  frequencyLabel: FrequencyLabel;
  severityScore: number | null;
  confidenceScore: number;
  frequencyRuleSetVersion: typeof FREQUENCY_RULE_SET_VERSION;
}

/**
 * verified: every member has the identifier; unknown (null): none has it;
 * estimated: some have it — the count of distinct values is a lower bound.
 */
function distinctCount(values: Array<string | null>): {
  count: number | null;
  status: CountStatus;
} {
  const known = values.filter((v): v is string => v !== null && v !== "");
  if (known.length === 0) return { count: null, status: "unknown" };
  const count = new Set(known).size;
  return { count, status: known.length === values.length ? "verified" : "estimated" };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

export function computeClusterStatistics(
  members: ClusterMember[],
  scope: ScopeProduct[],
  options: { verifierCoherent: boolean | null; now: Date },
): ClusterStatistics {
  const counted = members.filter((m) => !m.isDuplicate);
  const authors = distinctCount(counted.map((m) => m.authorReferenceHash));
  const companies = distinctCount(counted.map((m) => m.authorCompanyReference));

  const totals = new Map(scope.map((s) => [s.productId, s.totalKnownReviewCount]));
  const perProduct = new Map<string, number>();
  for (const m of counted) perProduct.set(m.productId, (perProduct.get(m.productId) ?? 0) + 1);
  const productDistribution = [...perProduct.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([product_id, count]) => {
      const total = totals.get(product_id) ?? null;
      return {
        product_id,
        count,
        relative_frequency:
          total && total > 0 ? Math.round((count / total) * 10_000) / 10_000 : null,
      };
    });

  const months = new Map<string, number>();
  const dates = counted.map((m) => m.publishedAt).filter((d): d is string => d !== null);
  for (const d of dates) {
    const month = d.slice(0, 7);
    months.set(month, (months.get(month) ?? 0) + 1);
  }
  const sortedDates = [...dates].sort();

  const resolutionBreakdown = { resolved: 0, unresolved: 0, unknown: 0 };
  for (const m of counted) resolutionBreakdown[m.resolutionStatus]++;

  // freq-1 (Implementation Blueprint §7.3).
  const feedbackCount = counted.length;
  const authorsKnown = authors.status !== "unknown";
  let frequencyLabel: FrequencyLabel = "unknown";
  const isolated = authorsKnown
    ? authors.count === 1 && authors.status === "verified"
    : feedbackCount === 1;
  const recurring =
    feedbackCount >= FREQ_1.recurringMinFeedback &&
    (!authorsKnown || (authors.count ?? 0) >= FREQ_1.recurringMinAuthors);
  if (isolated) frequencyLabel = "isolated";
  else if (recurring) {
    // [ASSUMPTION] "recurring in ≥ 2 products" read as: recurring overall and present in ≥ 2 products.
    const widespread =
      perProduct.size >= FREQ_1.widespreadMinProducts &&
      productDistribution.some(
        (p) =>
          p.relative_frequency !== null &&
          p.relative_frequency >= FREQ_1.widespreadMinRelativeFrequency,
      );
    frequencyLabel = widespread ? "widespread" : "recurring";
  }

  const severities = counted.map((m) => m.severity).filter((s): s is number => s !== null);
  const severityScore =
    severities.length === 0
      ? null
      : round2(severities.reduce((s, x) => s + x, 0) / severities.length);

  const quality = aggregateQuality(
    counted.map((m) => m.evidence),
    options.now,
  );
  const coherence = options.verifierCoherent === false ? 0.6 : 1;
  let confidenceScore = Math.round(100 * quality * coherence);
  if (!authorsKnown) confidenceScore = Math.min(confidenceScore, 60);

  return {
    feedbackCount,
    distinctAuthorCount: authors.count,
    distinctAuthorCountStatus: authors.status,
    distinctCompanyCount: companies.count,
    distinctCompanyCountStatus: companies.status,
    affectedProductCount: perProduct.size,
    productDistribution,
    monthlyCounts: [...months.entries()].sort().map(([month, count]) => ({ month, count })),
    firstObservedAt: sortedDates[0] ?? null,
    lastObservedAt: sortedDates[sortedDates.length - 1] ?? null,
    resolutionBreakdown,
    frequencyLabel,
    severityScore,
    confidenceScore,
    frequencyRuleSetVersion: FREQUENCY_RULE_SET_VERSION,
  };
}
