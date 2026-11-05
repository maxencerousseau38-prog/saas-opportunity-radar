// Evidence quality q(e) and the aggregated quality Q (Implementation
// Blueprint §9.4, PD-07 A). Shared by cluster confidence (§7.3), discovery
// confidence (§6.8) and analysis confidence (§9.4).

export interface QualityEvidence {
  sourceRecordId: string;
  reliabilityLevel: 1 | 2 | 3 | 4;
  verificationStatus: "verified" | "unverified" | "needs_review" | "stale" | "rejected";
  /** Publication date when known, else observation date (ISO). */
  datedAt: string | null;
  inOpenConflict: boolean;
}

const RELIABILITY: Record<1 | 2 | 3 | 4, number> = { 1: 1, 2: 0.75, 3: 0.5, 4: 0.25 };
const VERIFICATION: Record<QualityEvidence["verificationStatus"], number> = {
  verified: 1,
  unverified: 0.6,
  needs_review: 0.3,
  stale: 0.3,
  rejected: 0,
};

/** q(e) = r × v × f × c. */
export function evidenceQuality(e: QualityEvidence, now: Date): number {
  const ageMonths = e.datedAt
    ? (now.getTime() - new Date(e.datedAt).getTime()) / (1000 * 60 * 60 * 24 * 30.4375)
    : Number.POSITIVE_INFINITY;
  const f = ageMonths <= 24 ? 1 : 0.7;
  const c = e.inOpenConflict ? 0.5 : 1;
  return RELIABILITY[e.reliabilityLevel] * VERIFICATION[e.verificationStatus] * f * c;
}

/**
 * Q: best q per distinct source record, sum of the top three, min(1, sum/2);
 * at most 0.6 when a single source record supports it; 0 without evidence.
 */
export function aggregateQuality(evidence: QualityEvidence[], now: Date): number {
  const best = new Map<string, number>();
  for (const e of evidence) {
    const q = evidenceQuality(e, now);
    best.set(e.sourceRecordId, Math.max(best.get(e.sourceRecordId) ?? 0, q));
  }
  if (best.size === 0) return 0;
  const top = [...best.values()].sort((a, b) => b - a).slice(0, 3);
  const q = Math.min(1, top.reduce((s, x) => s + x, 0) / 2);
  return best.size === 1 ? Math.min(q, 0.6) : q;
}
