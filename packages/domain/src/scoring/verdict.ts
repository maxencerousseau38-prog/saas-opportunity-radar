// Kill criteria and the verdict decision table (Implementation Blueprint §9.5,
// §9.6; ADR-005; PD-06 B, PD-07 A, PD-23 A). Rules are evaluated in order and
// every gate result is recorded. The red-team can only tighten the verdict;
// REJECT comes only from rules 1 and 3. PD-25 (low-confidence exception) is
// pending: rule 3 applies as written.
import type { VerdictReasonCode } from "@sor/contracts";
import { decisionBand, type DecisionBand, type IndexedEvidence, type ScoreResult } from "./score";
import { isVerifiedPayingEvidence } from "./validate";

export type Verdict = "build_candidate" | "validate_first" | "reject";

/** Locked minimums of PRD §21; a workspace may only raise them (PD-23 A). */
export const BUILD_MIN_SCORE = 75;
export const BUILD_MIN_WTP = 10;
export const BUILD_MIN_CONFIDENCE = 70;

/** Substantiated: ≥ 1 supporting item, verified, reliability ≤ 3 (§9.5). */
export function isKillCriterionSubstantiated(supporting: IndexedEvidence[]): boolean {
  return supporting.some((e) => e.verificationStatus === "verified" && e.reliabilityLevel <= 3);
}

export interface KillCriterionInput {
  severity: "critical" | "major" | "minor";
  substantiated: boolean;
}

export interface GateInputs {
  score: ScoreResult;
  /** Customer-demand rating and the distinct source records supporting it. */
  demand: { rating: number | null; distinctSourceRecords: number };
  /** Differentiation rating and whether a non-hypothesis opportunity/competitor_gap finding has support. */
  differentiation: { rating: number | null; hasEvidencedGapFinding: boolean };
  /** Evidence of the analysis index (paying-customer gate). */
  index: IndexedEvidence[];
  killCriteria: KillCriterionInput[];
  recommendationExcludedOrUnderReview: boolean;
  redTeamRecommendation: Verdict | null;
  /** Workspace thresholds; values below the locked minimums are ignored. */
  thresholds?: { minScore?: number; minWtp?: number };
}

export interface VerdictReason {
  rule: number;
  code: VerdictReasonCode;
  result: "triggered" | "passed" | "failed";
}

export interface VerdictResult {
  verdict: Verdict;
  band: DecisionBand | null;
  reasons: VerdictReason[];
}

export function decideVerdict(input: GateInputs): VerdictResult {
  const { score } = input;
  const reasons: VerdictReason[] = [];
  const band = score.scoreTotal === null ? null : decisionBand(score.scoreTotal);
  const minScore = Math.max(BUILD_MIN_SCORE, input.thresholds?.minScore ?? BUILD_MIN_SCORE);
  const minWtp = Math.max(BUILD_MIN_WTP, input.thresholds?.minWtp ?? BUILD_MIN_WTP);
  const done = (verdict: Verdict): VerdictResult => ({ verdict, band, reasons });

  // Rule 1: a substantiated critical kill criterion.
  if (input.killCriteria.some((k) => k.severity === "critical" && k.substantiated)) {
    reasons.push({ rule: 1, code: "FATAL_FLAW", result: "triggered" });
    return done("reject");
  }
  // Rule 2: incomplete coverage.
  if (score.coverage < 100 || score.scoreTotal === null) {
    reasons.push({ rule: 2, code: "INCOMPLETE_COVERAGE", result: "triggered" });
    return done("validate_first");
  }
  const total = score.scoreTotal;
  // Rules 3–5: score bands below the BUILD threshold.
  if (total < 50) {
    reasons.push({ rule: 3, code: "SCORE_BELOW_REJECT_THRESHOLD", result: "triggered" });
    return done("reject");
  }
  if (total < 65) {
    reasons.push({ rule: 4, code: "LOW_POTENTIAL", result: "triggered" });
    return done("validate_first");
  }
  if (total < 75) {
    reasons.push({ rule: 5, code: "TO_INVESTIGATE", result: "triggered" });
    return done("validate_first");
  }

  // Rule 6: every BUILD gate, each recorded.
  const gates: Array<[VerdictReasonCode, boolean]> = [
    ["SCORE_BELOW_BUILD_THRESHOLD", total >= minScore],
    ["WTP_BELOW_THRESHOLD", score.wtpScore !== null && score.wtpScore >= minWtp],
    ["NO_PAYING_CUSTOMER_EVIDENCE", input.index.some(isVerifiedPayingEvidence)],
    ["LOW_CONFIDENCE", score.confidence >= BUILD_MIN_CONFIDENCE],
    [
      "INSUFFICIENT_DEMAND_EVIDENCE",
      (input.demand.rating ?? -1) >= 3 && input.demand.distinctSourceRecords >= 2,
    ],
    [
      "NO_CONCRETE_DIFFERENTIATION",
      (input.differentiation.rating ?? -1) >= 3 && input.differentiation.hasEvidencedGapFinding,
    ],
    [
      "UNRESOLVED_CRITICAL_KILL_CRITERION",
      !input.killCriteria.some((k) => k.severity === "critical" && !k.substantiated),
    ],
    ["EXCLUDED_RECOMMENDATION", !input.recommendationExcludedOrUnderReview],
  ];
  for (const [code, passed] of gates) {
    reasons.push({ rule: 6, code, result: passed ? "passed" : "failed" });
  }
  if (gates.some(([, passed]) => !passed)) return done("validate_first");

  // Rule 7: all gates pass.
  reasons.push({ rule: 7, code: "ALL_GATES_PASSED", result: "triggered" });
  // Rule 8: the red-team can only tighten BUILD → VALIDATE FIRST.
  if (input.redTeamRecommendation !== null && input.redTeamRecommendation !== "build_candidate") {
    reasons.push({ rule: 8, code: "RED_TEAM_OBJECTION", result: "triggered" });
    return done("validate_first");
  }
  return done("build_candidate");
}
