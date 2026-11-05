// Deterministic scoring, coverage, WTP, confidence and decision band
// (Implementation Blueprint §9.1, §9.3, §9.4; ADR-005; PD-05 A, PD-07 A).
// Rules version "scoring-1". The server computes every number; no LLM output
// reaches these values without validation (§9.2).
import { aggregateQuality, type QualityEvidence } from "../pain-points/quality";

export const SCORING_RULES = "scoring-1";

export const DIMENSIONS = {
  customer_demand: 20,
  willingness_to_pay: 15,
  product_gap: 20,
  market_attractiveness: 15,
  competitive_differentiation: 15,
  feasibility_distribution: 15,
} as const;
export type DimensionKey = keyof typeof DIMENSIONS;
export const DIMENSION_KEYS = Object.keys(DIMENSIONS) as DimensionKey[];

/** An evidence item of the analysis evidence index, with its quality inputs. */
export interface IndexedEvidence {
  evidenceId: string;
  sourceRecordId: string;
  reliabilityLevel: 1 | 2 | 3 | 4;
  verificationStatus: "verified" | "unverified" | "needs_review" | "stale";
  observedAt: string;
  publishedAt: string | null;
  monetizationSignal: string | null;
  inOpenConflict: boolean;
}

export interface ValidatedDimension {
  key: DimensionKey;
  status: "assessed" | "insufficient_evidence";
  rating: number | null; // integer 0..5 when assessed, else null
  supporting: IndexedEvidence[];
}

export type DecisionBand =
  "reject" | "low_potential" | "to_investigate" | "interesting" | "priority";

export interface ScoreResult {
  scoreTotal: number | null; // only at 100 % coverage
  provisionalPoints: number; // sum over assessed dimensions, NOT normalised
  coverage: number; // sum of assessed weights (0..100)
  wtpScore: number | null; // 0..15
  confidence: number; // 0..100
  band: DecisionBand | null;
}

export function toQuality(e: IndexedEvidence): QualityEvidence {
  return {
    sourceRecordId: e.sourceRecordId,
    reliabilityLevel: e.reliabilityLevel,
    verificationStatus: e.verificationStatus,
    datedAt: e.publishedAt ?? e.observedAt,
    inOpenConflict: e.inOpenConflict,
  };
}

/** Q_d of one dimension (0 when not assessed). */
export function dimensionQuality(d: ValidatedDimension, now: Date): number {
  if (d.status !== "assessed") return 0;
  return aggregateQuality(d.supporting.map(toQuality), now);
}

/** confidence = round(Σ weight_d × Q_d), 0..100 (§9.4). */
export function computeConfidence(dims: ValidatedDimension[], now: Date): number {
  const total = dims.reduce((s, d) => s + DIMENSIONS[d.key] * dimensionQuality(d, now), 0);
  return Math.round(total);
}

/** Display level of a confidence value: low < 40, medium 40–69, high ≥ 70. */
export function confidenceLevel(confidence: number): "low" | "medium" | "high" {
  return confidence < 40 ? "low" : confidence < 70 ? "medium" : "high";
}

export function decisionBand(score: number): DecisionBand {
  return score < 50
    ? "reject"
    : score < 65
      ? "low_potential"
      : score < 75
        ? "to_investigate"
        : score < 85
          ? "interesting"
          : "priority";
}

export function computeScore(dims: ValidatedDimension[], now: Date): ScoreResult {
  const keys = new Set(dims.map((d) => d.key));
  if (dims.length !== 6 || keys.size !== 6) throw new Error("SCORING_INPUT_INVALID");

  let coverage = 0;
  let points = 0;
  for (const d of dims) {
    if (d.status !== "assessed") {
      if (d.rating !== null) throw new Error("SCORING_INPUT_INVALID"); // never a silent zero
      continue;
    }
    if (d.rating === null || !Number.isInteger(d.rating) || d.rating < 0 || d.rating > 5) {
      throw new Error("SCORING_INPUT_INVALID");
    }
    if (d.supporting.length === 0) throw new Error("SCORING_INPUT_INVALID");
    coverage += DIMENSIONS[d.key];
    points += (d.rating / 5) * DIMENSIONS[d.key];
  }

  const complete = coverage === 100;
  const wtp = dims.find((d) => d.key === "willingness_to_pay")!;
  const wtpScore = wtp.status === "assessed" ? (wtp.rating as number) * 3 : null;
  const scoreTotal = complete ? points : null;

  return {
    scoreTotal,
    provisionalPoints: points,
    coverage,
    wtpScore,
    confidence: computeConfidence(dims, now),
    band: scoreTotal === null ? null : decisionBand(scoreTotal),
  };
}
