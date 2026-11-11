// Deterministic confidence of an Acquisition Channel claim (ADR-017 §4,
// method "chanconf-1"). Confidence is separate from the factual status: it
// explains how much the cited evidence supports the claim, from the quality,
// directness, independence and freshness of that evidence. It is never
// computed for an unknown channel and never derived from missing data.

export const CHANNEL_CONFIDENCE_METHOD = "chanconf-1";

export type ChannelFactStatus = "confirmed" | "declared" | "estimated";
export type ChannelEvidenceKind =
  /** Page or post of the company itself (site, blog, founder or official account). */
  | "official_statement"
  /** Independent third party (press, interview by a third party, public case study). */
  | "third_party_report"
  /** Indices only (SOR inference); requires a rationale. */
  | "inference";

export interface ChannelClaimInput {
  status: ChannelFactStatus;
  evidenceKind: ChannelEvidenceKind;
  role: "primary" | "secondary";
  /** The source page was checked by the operator and still states the claim. */
  verified: boolean;
  /** A direct excerpt of the source states the channel (not a paraphrase). */
  directExcerpt: boolean;
  /** Excerpt that states the channel is the main / dominant one (primary only). */
  primacyExcerpt?: string | null;
  /** Method and indices of an estimate (estimated only). */
  rationale?: string | null;
  observedAt: Date;
  now: Date;
}

export interface ChannelConfidence {
  method: typeof CHANNEL_CONFIDENCE_METHOD;
  score: number;
  reasons: string[];
}

export type ChannelClaimError =
  | "confirmed_requires_verified_source"
  | "confirmed_requires_direct_excerpt"
  | "confirmed_cannot_be_inference"
  | "declared_cannot_be_inference"
  | "estimated_requires_inference"
  | "estimated_requires_rationale"
  | "primary_requires_primacy_evidence"
  | "observed_in_future";

/**
 * The status rules of PRD §24.3 / ADR-017 §2–3, checked before anything is
 * recorded. Returns every violated rule (empty when the claim is admissible).
 */
export function validateChannelClaim(c: ChannelClaimInput): ChannelClaimError[] {
  const errors: ChannelClaimError[] = [];
  if (c.status === "confirmed") {
    if (!c.verified) errors.push("confirmed_requires_verified_source");
    if (!c.directExcerpt) errors.push("confirmed_requires_direct_excerpt");
    if (c.evidenceKind === "inference") errors.push("confirmed_cannot_be_inference");
  }
  // A declaration is a statement attributable to the company or an
  // identifiable representative, published by itself or reported by a third
  // party (an interview); never an inference.
  if (c.status === "declared" && c.evidenceKind === "inference") {
    errors.push("declared_cannot_be_inference");
  }
  if (c.status === "estimated") {
    if (c.evidenceKind !== "inference") errors.push("estimated_requires_inference");
    if (!c.rationale?.trim()) errors.push("estimated_requires_rationale");
  }
  if (c.role === "primary" && !c.primacyExcerpt?.trim()) {
    errors.push("primary_requires_primacy_evidence");
  }
  if (c.observedAt.getTime() > c.now.getTime() + 60_000) errors.push("observed_in_future");
  return errors;
}

const BASE: Record<ChannelFactStatus, number> = { confirmed: 80, declared: 60, estimated: 30 };
const MONTH_MS = 30.44 * 24 * 3600 * 1000;

/**
 * Score 0–100 with the reasons that produced it. Throws on an inadmissible
 * claim: a confidence is only computed for a claim that passed validation.
 */
export function channelConfidence(c: ChannelClaimInput): ChannelConfidence {
  const errors = validateChannelClaim(c);
  if (errors.length) throw new Error(`inadmissible channel claim: ${errors.join(", ")}`);
  const reasons: string[] = [];
  let score = BASE[c.status];
  reasons.push(
    {
      confirmed: "Statut confirmé : preuve directe vérifiée (base 80)",
      declared:
        "Statut déclaré : affirmation de l’entreprise, non vérifiée de façon indépendante (base 60)",
      estimated: "Statut estimé : inférence à partir d’indices (base 30)",
    }[c.status],
  );
  if (c.evidenceKind === "third_party_report" && c.status === "confirmed") {
    score += 10;
    reasons.push("Source indépendante de l’entreprise (+10)");
  }
  if (c.evidenceKind === "official_statement" && c.directExcerpt && c.status !== "estimated") {
    score += 5;
    reasons.push("Extrait direct d’une source officielle (+5)");
  }
  if (c.status === "declared" && c.verified) {
    score += 5;
    reasons.push("Page source vérifiée par l’opérateur (+5)");
  }
  const ageMonths = (c.now.getTime() - c.observedAt.getTime()) / MONTH_MS;
  if (ageMonths > 24) {
    score -= 20;
    reasons.push("Preuve observée il y a plus de 24 mois (−20)");
  } else if (ageMonths > 12) {
    score -= 10;
    reasons.push("Preuve observée il y a plus de 12 mois (−10)");
  }
  if (c.role === "primary") reasons.push("Rôle principal appuyé par un extrait explicite");
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { method: CHANNEL_CONFIDENCE_METHOD, score, reasons };
}
