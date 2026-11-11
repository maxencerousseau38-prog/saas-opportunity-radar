// Deterministic evidence rules (Implementation Blueprint §6.6–6.7; PRD §5.10, §13.2).

export type FactStatus = "confirmed" | "estimated" | "declared" | "unknown";
export type VerificationStatus = "unverified" | "verified" | "needs_review" | "rejected" | "stale";

export interface ClaimCandidate {
  fieldKey: string;
  /** Canonical JSON value of the claim; compared for conflicts. */
  value: unknown;
  verificationStatus: VerificationStatus;
  factStatus: FactStatus;
  reliabilityLevel: 1 | 2 | 3 | 4;
  observedAt: string;
  evidenceId: string;
}

/** Stable JSON for comparisons (sorted keys, trimmed lower-case strings). */
export function canonicalValue(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (typeof v === "string") return v.trim().toLowerCase().replace(/\s+/g, " ");
    if (Array.isArray(v))
      return v.map(norm).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => [k, norm((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(norm(value));
}

const STATUS_RANK: Record<VerificationStatus, number> = {
  verified: 3,
  unverified: 2,
  needs_review: 1,
  stale: 0,
  rejected: -1,
};

/**
 * Selects the value shown for a field. A rejected claim is never selected; a
 * verified claim beats an unverified one; then the more reliable source
 * (lower level), then the newer observation. An older claim never replaces a
 * newer verified fact.
 */
export function selectClaim(claims: ClaimCandidate[]): ClaimCandidate | null {
  const usable = claims.filter((c) => c.verificationStatus !== "rejected");
  if (usable.length === 0) return null;
  return (
    [...usable].sort(
      (a, b) =>
        STATUS_RANK[b.verificationStatus] - STATUS_RANK[a.verificationStatus] ||
        a.reliabilityLevel - b.reliabilityLevel ||
        Date.parse(b.observedAt) - Date.parse(a.observedAt) ||
        a.evidenceId.localeCompare(b.evidenceId),
    )[0] ?? null
  );
}

/** Pairs of non-rejected claims on the same field with different values (kept, never overwritten). */
export function detectConflicts(
  claims: ClaimCandidate[],
): Array<{ a: string; b: string; fieldKey: string }> {
  const usable = claims.filter((c) => c.verificationStatus !== "rejected");
  const out: Array<{ a: string; b: string; fieldKey: string }> = [];
  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const x = usable[i];
      const y = usable[j];
      if (!x || !y || x.fieldKey !== y.fieldKey) continue;
      if (canonicalValue(x.value) === canonicalValue(y.value)) continue;
      const [a, b] =
        x.evidenceId < y.evidenceId ? [x.evidenceId, y.evidenceId] : [y.evidenceId, x.evidenceId];
      out.push({ a, b, fieldKey: x.fieldKey });
    }
  }
  return out;
}

export interface VerificationInput {
  claimType: string;
  monetizationSignal: string | null;
  reliabilityLevel: 1 | 2 | 3 | 4;
  /** The quoted locator text proposed by the model, if any. */
  quote: string | null;
  /** Normalized text of the snapshot the claim cites. */
  snapshotText: string | null;
  snapshotSuppliedToStep: boolean;
  publishedAt: string | null;
  retrievedAt: string;
  now: Date;
  maxAgeDays: number;
}

export interface VerificationOutcome {
  status: VerificationStatus;
  reasons: string[];
  /** A paid plan proves an offer, never a paying customer (PRD §21). */
  monetizationSignal: string | null;
}

/** Normalizes text for quote matching (case, accents, whitespace). */
export function normalizeForMatch(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Deterministic part of D6. The LLM verifier may only make this stricter:
 * a claim whose quote is not found in the cited snapshot cannot be verified.
 */
export function verifyClaim(input: VerificationInput): VerificationOutcome {
  const reasons: string[] = [];
  let monetizationSignal = input.monetizationSignal;
  if (
    input.claimType === "pricing" &&
    (monetizationSignal === "payment_confirmed" || monetizationSignal === "customer_verified")
  ) {
    monetizationSignal = "paid_plan_available";
    reasons.push("pricing_is_not_payment_proof");
  }
  if (!input.snapshotSuppliedToStep || input.snapshotText === null) {
    return {
      status: "rejected",
      reasons: [...reasons, "snapshot_not_supplied"],
      monetizationSignal,
    };
  }
  if (!input.quote || input.quote.trim().length < 3) {
    return {
      status: "needs_review",
      reasons: [...reasons, "no_supporting_quote"],
      monetizationSignal,
    };
  }
  if (!normalizeForMatch(input.snapshotText).includes(normalizeForMatch(input.quote))) {
    return {
      status: "rejected",
      reasons: [...reasons, "quote_not_in_snapshot"],
      monetizationSignal,
    };
  }
  if (
    (monetizationSignal === "payment_confirmed" || monetizationSignal === "customer_verified") &&
    input.reliabilityLevel > 2
  ) {
    monetizationSignal = "unknown";
    reasons.push("low_reliability_cannot_confirm_payment");
  }
  const reference = Date.parse(input.publishedAt ?? input.retrievedAt);
  if (
    Number.isFinite(reference) &&
    input.now.getTime() - reference > input.maxAgeDays * 86_400_000
  ) {
    return {
      status: "stale",
      reasons: [...reasons, "older_than_freshness_window"],
      monetizationSignal,
    };
  }
  return { status: "verified", reasons, monetizationSignal };
}
