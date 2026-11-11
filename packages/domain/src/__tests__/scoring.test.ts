// Scoring, confidence and verdict (Implementation Blueprint §9; ADR-005).
import { describe, expect, it } from "vitest";
import type { DimensionAssessmentProposal } from "@sor/contracts";
import {
  computeConfidence,
  computeScore,
  confidenceLevel,
  decideVerdict,
  decisionBand,
  DIMENSION_KEYS,
  isKillCriterionSubstantiated,
  validateProposals,
  type DimensionKey,
  type GateInputs,
  type IndexedEvidence,
  type ValidatedDimension,
} from "../scoring";

const NOW = new Date("2026-11-05T00:00:00Z");
let n = 0;
function ev(over: Partial<IndexedEvidence> = {}): IndexedEvidence {
  n += 1;
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  return {
    evidenceId: id,
    sourceRecordId: `record-${n}`,
    reliabilityLevel: 1,
    verificationStatus: "verified",
    observedAt: "2026-10-01T00:00:00Z",
    publishedAt: null,
    monetizationSignal: null,
    inOpenConflict: false,
    ...over,
  };
}
function dims(
  ratings: Partial<Record<DimensionKey, number | null>>,
  support: () => IndexedEvidence[] = () => [ev(), ev(), ev()],
): ValidatedDimension[] {
  return DIMENSION_KEYS.map((key) => {
    const r = key in ratings ? ratings[key]! : 5;
    return r === null
      ? { key, status: "insufficient_evidence", rating: null, supporting: [] }
      : { key, status: "assessed", rating: r, supporting: support() };
  });
}

describe("computeScore (§9.3)", () => {
  it("weights each dimension and gives a final score only at full coverage", () => {
    const s = computeScore(dims({}), NOW);
    expect(s.scoreTotal).toBe(100);
    expect(s.coverage).toBe(100);
    expect(s.wtpScore).toBe(15);
    expect(s.band).toBe("priority");
  });

  it("an integer rating always gives an integer score (PD-05)", () => {
    for (let r = 0; r <= 5; r++) {
      const s = computeScore(
        dims({
          customer_demand: r,
          willingness_to_pay: 5 - r,
          product_gap: r,
          market_attractiveness: 5 - r,
          competitive_differentiation: r,
          feasibility_distribution: 5 - r,
        }),
        NOW,
      );
      expect(Number.isInteger(s.scoreTotal)).toBe(true);
    }
  });

  it("never normalises a partial score and never counts a missing dimension as zero", () => {
    const s = computeScore(dims({ willingness_to_pay: null, market_attractiveness: null }), NOW);
    expect(s.scoreTotal).toBeNull();
    expect(s.coverage).toBe(70);
    expect(s.provisionalPoints).toBe(70); // 20+20+15+15 at rating 5, not scaled to /100
    expect(s.wtpScore).toBeNull();
    expect(s.band).toBeNull();
  });

  it("rejects malformed inputs instead of producing a silent zero", () => {
    const d = dims({});
    expect(() => computeScore(d.slice(0, 5), NOW)).toThrow("SCORING_INPUT_INVALID");
    expect(() => computeScore([...d.slice(0, 5), d[0]!], NOW)).toThrow("SCORING_INPUT_INVALID");
    const decimal = dims({});
    decimal[0] = { ...decimal[0]!, rating: 3.5 };
    expect(() => computeScore(decimal, NOW)).toThrow("SCORING_INPUT_INVALID");
    const noEvidence = dims({});
    noEvidence[0] = { ...noEvidence[0]!, supporting: [] };
    expect(() => computeScore(noEvidence, NOW)).toThrow("SCORING_INPUT_INVALID");
    const ratedButMissing = dims({ customer_demand: null });
    ratedButMissing[0] = { ...ratedButMissing[0]!, rating: 0 };
    expect(() => computeScore(ratedButMissing, NOW)).toThrow("SCORING_INPUT_INVALID");
  });

  it("maps scores to the PRD §8.8 decision bands", () => {
    expect([0, 49, 50, 64, 65, 74, 75, 84, 85, 100].map(decisionBand)).toEqual([
      "reject",
      "reject",
      "low_potential",
      "low_potential",
      "to_investigate",
      "to_investigate",
      "interesting",
      "interesting",
      "priority",
      "priority",
    ]);
  });
});

describe("computeConfidence (§9.4, PD-07 A)", () => {
  it("is 100 with three verified, recent, level-1 records per dimension", () => {
    expect(computeConfidence(dims({}), NOW)).toBe(100);
  });

  it("a dimension supported by a single source record stays at or below 0.6", () => {
    // Best q = 1 → min(1, 1 / 2) = 0.5: the 0.6 cap of §9.4 is never exceeded.
    expect(
      computeConfidence(
        dims({}, () => [ev()]),
        NOW,
      ),
    ).toBe(50);
  });

  it("counts the best item per source record and the top three records", () => {
    const shared = () => {
      const a = ev();
      return [a, { ...a, evidenceId: "dup", reliabilityLevel: 4 as const }, ev()];
    };
    expect(computeConfidence(dims({}, shared), NOW)).toBe(100); // (1 + 1) / 2 = 1
  });

  it("lowers quality for unverified, old, conflicting and low-reliability evidence", () => {
    // q = 0.75 × 0.6 × 0.7 × 0.5 = 0.1575; three records → 0.4725 / 2 = 0.23625
    const weak = () =>
      [1, 2, 3].map(() =>
        ev({
          reliabilityLevel: 2,
          verificationStatus: "unverified",
          observedAt: "2020-01-01T00:00:00Z",
          inOpenConflict: true,
        }),
      );
    expect(computeConfidence(dims({}, weak), NOW)).toBe(24);
  });

  it("uses the publication date before the observation date", () => {
    const old = () => [1, 2].map(() => ev({ publishedAt: "2019-01-01T00:00:00Z" }));
    expect(computeConfidence(dims({}, old), NOW)).toBe(70); // (0.7+0.7)/2 = 0.7
  });

  it("a dimension that is not assessed contributes nothing", () => {
    expect(computeConfidence(dims({ customer_demand: null, product_gap: null }), NOW)).toBe(60);
  });

  it("has display levels low < 40, medium 40–69, high ≥ 70", () => {
    expect([0, 39, 40, 69, 70, 100].map(confidenceLevel)).toEqual([
      "low",
      "low",
      "medium",
      "medium",
      "high",
      "high",
    ]);
  });
});

describe("validateProposals (§9.2)", () => {
  const inIndex = [ev(), ev(), ev({ monetizationSignal: "paid_plan_available" })];
  const paying = ev({ monetizationSignal: "customer_verified" });
  const payingUnverified = ev({
    monetizationSignal: "payment_confirmed",
    verificationStatus: "unverified",
  });
  const index = new Map(
    [...inIndex, paying, payingUnverified].map((e) => [e.evidenceId, e] as const),
  );
  const ref = (e: IndexedEvidence, support_type: "supports" | "context" = "supports") => ({
    evidence_id: e.evidenceId,
    support_type,
  });
  const assessed = (
    key: DimensionKey,
    rating: number,
    evidence = [ref(inIndex[0]!)],
  ): DimensionAssessmentProposal => ({
    dimension_key: key,
    assessment_status: "assessed",
    rating,
    explanation: "x",
    evidence,
    missing_information: [],
  });
  const all = (over: Partial<Record<DimensionKey, DimensionAssessmentProposal>> = {}) =>
    DIMENSION_KEYS.map((k) => over[k] ?? assessed(k, 3));

  it("accepts six valid proposals", () => {
    const v = validateProposals(all(), index);
    expect(v.ok).toBe(true);
  });

  it("rule 1: exactly six proposals with distinct keys", () => {
    const v = validateProposals(all().slice(0, 5), index);
    expect(v.ok).toBe(false);
    const dup = [...all().slice(0, 5), assessed("customer_demand", 3)];
    expect(validateProposals(dup, index).ok).toBe(false);
  });

  it("rule 2: rejects a citation outside the evidence index", () => {
    const v = validateProposals(
      all({
        product_gap: assessed("product_gap", 3, [
          { evidence_id: "99999999-9999-4999-8999-999999999999", support_type: "supports" },
        ]),
      }),
      index,
    );
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors).toContain("EVIDENCE_OUTSIDE_INDEX:product_gap");
  });

  it("rule 3: an assessed proposal needs a supporting item (context is not support)", () => {
    const v = validateProposals(
      all({ product_gap: assessed("product_gap", 3, [ref(inIndex[0]!, "context")]) }),
      index,
    );
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors).toContain("ASSESSED_WITHOUT_EVIDENCE:product_gap");
  });

  it("rule 4: WTP ≥ 4 is capped at 3 without verified paying evidence", () => {
    for (const support of [inIndex[2]!, payingUnverified]) {
      const v = validateProposals(
        all({ willingness_to_pay: assessed("willingness_to_pay", 5, [ref(support)]) }),
        index,
      );
      expect(v.ok).toBe(true);
      if (v.ok) {
        expect(v.dimensions.find((d) => d.key === "willingness_to_pay")!.rating).toBe(3);
        expect(v.warnings).toContain("WTP_RATING_CAPPED_AT_3");
      }
    }
    const ok = validateProposals(
      all({ willingness_to_pay: assessed("willingness_to_pay", 5, [ref(paying)]) }),
      index,
    );
    expect(ok.ok && ok.dimensions.find((d) => d.key === "willingness_to_pay")!.rating).toBe(5);
  });

  it("rule 5: rejects a decimal rating", () => {
    expect(validateProposals(all({ product_gap: assessed("product_gap", 2.5) }), index).ok).toBe(
      false,
    );
  });

  it("keeps insufficient-evidence dimensions unrated", () => {
    const v = validateProposals(
      all({
        market_attractiveness: {
          dimension_key: "market_attractiveness",
          assessment_status: "insufficient_evidence",
          explanation: "No market data",
          evidence: [],
          missing_information: ["Market size"],
        },
      }),
      index,
    );
    expect(v.ok).toBe(true);
    if (v.ok) {
      const d = v.dimensions.find((x) => x.key === "market_attractiveness")!;
      expect(d.rating).toBeNull();
      expect(computeScore(v.dimensions, NOW).coverage).toBe(85);
    }
  });
});

describe("isKillCriterionSubstantiated (§9.5)", () => {
  it("needs a verified item with reliability ≤ 3", () => {
    expect(isKillCriterionSubstantiated([])).toBe(false);
    expect(isKillCriterionSubstantiated([ev({ verificationStatus: "unverified" })])).toBe(false);
    expect(isKillCriterionSubstantiated([ev({ reliabilityLevel: 4 })])).toBe(false);
    expect(isKillCriterionSubstantiated([ev({ reliabilityLevel: 3 })])).toBe(true);
  });
});

describe("decideVerdict (§9.6)", () => {
  const paying = ev({ monetizationSignal: "payment_confirmed" });
  const base = (over: Partial<GateInputs> = {}): GateInputs => ({
    score: computeScore(dims({}), NOW),
    demand: { rating: 5, distinctSourceRecords: 3 },
    differentiation: { rating: 5, hasEvidencedGapFinding: true },
    index: [paying],
    killCriteria: [],
    recommendationExcludedOrUnderReview: false,
    redTeamRecommendation: "build_candidate",
    ...over,
  });
  const scored = (ratings: Partial<Record<DimensionKey, number | null>>) =>
    computeScore(dims(ratings), NOW);
  const codes = (r: ReturnType<typeof decideVerdict>) =>
    r.reasons.filter((x) => x.result !== "passed").map((x) => x.code);

  it("rule 7: BUILD CANDIDATE when every gate passes", () => {
    const r = decideVerdict(base());
    expect(r.verdict).toBe("build_candidate");
    expect(codes(r)).toEqual(["ALL_GATES_PASSED"]);
  });

  it("rule 1: a substantiated critical kill criterion forces REJECT, even at 100", () => {
    const r = decideVerdict(
      base({ killCriteria: [{ severity: "critical", substantiated: true }] }),
    );
    expect(r.verdict).toBe("reject");
    expect(codes(r)).toEqual(["FATAL_FLAW"]);
  });

  it("rule 2: incomplete coverage is VALIDATE FIRST, whatever the points", () => {
    const r = decideVerdict(base({ score: scored({ willingness_to_pay: null }) }));
    expect(r.verdict).toBe("validate_first");
    expect(codes(r)).toEqual(["INCOMPLETE_COVERAGE"]);
    expect(r.band).toBeNull();
  });

  it("rules 3–5: REJECT below 50, VALIDATE FIRST from 50 to 74", () => {
    const all = (r: number) =>
      scored(Object.fromEntries(DIMENSION_KEYS.map((k) => [k, r])) as Record<DimensionKey, number>);
    expect(decideVerdict(base({ score: all(2) })).verdict).toBe("reject"); // 40
    expect(codes(decideVerdict(base({ score: all(2) })))).toEqual(["SCORE_BELOW_REJECT_THRESHOLD"]);
    const low = decideVerdict(base({ score: all(3) })); // 60
    expect([low.verdict, low.band, codes(low)]).toEqual([
      "validate_first",
      "low_potential",
      ["LOW_POTENTIAL"],
    ]);
    const seventy = scored({
      customer_demand: 3,
      product_gap: 4,
      willingness_to_pay: 4,
      market_attractiveness: 4,
      competitive_differentiation: 3,
      feasibility_distribution: 3,
    }); // 12+16+12+12+9+9 = 70
    const r70 = decideVerdict(base({ score: seventy }));
    expect([r70.verdict, r70.band, codes(r70)]).toEqual([
      "validate_first",
      "to_investigate",
      ["TO_INVESTIGATE"],
    ]);
  });

  it("rule 6: each failing gate keeps VALIDATE FIRST and is recorded", () => {
    const cases: Array<[Partial<GateInputs>, string]> = [
      [{ score: scored({ willingness_to_pay: 3 }) }, "WTP_BELOW_THRESHOLD"],
      [
        { index: [ev({ monetizationSignal: "paid_plan_available" })] },
        "NO_PAYING_CUSTOMER_EVIDENCE",
      ],
      [
        {
          index: [
            ev({ monetizationSignal: "payment_confirmed", verificationStatus: "unverified" }),
          ],
        },
        "NO_PAYING_CUSTOMER_EVIDENCE",
      ],
      [
        {
          score: computeScore(
            dims({}, () => [ev()]),
            NOW,
          ),
        },
        "LOW_CONFIDENCE",
      ],
      [{ demand: { rating: 5, distinctSourceRecords: 1 } }, "INSUFFICIENT_DEMAND_EVIDENCE"],
      [{ demand: { rating: 2, distinctSourceRecords: 5 } }, "INSUFFICIENT_DEMAND_EVIDENCE"],
      [
        { differentiation: { rating: 5, hasEvidencedGapFinding: false } },
        "NO_CONCRETE_DIFFERENTIATION",
      ],
      [
        { killCriteria: [{ severity: "critical", substantiated: false }] },
        "UNRESOLVED_CRITICAL_KILL_CRITERION",
      ],
      [{ recommendationExcludedOrUnderReview: true }, "EXCLUDED_RECOMMENDATION"],
    ];
    for (const [over, code] of cases) {
      const r = decideVerdict(base(over));
      expect(r.verdict, code).toBe("validate_first");
      expect(codes(r), code).toEqual([code]);
    }
  });

  it("major and minor kill criteria never change the verdict by themselves", () => {
    const r = decideVerdict(
      base({
        killCriteria: [
          { severity: "major", substantiated: true },
          { severity: "minor", substantiated: true },
        ],
      }),
    );
    expect(r.verdict).toBe("build_candidate");
  });

  it("rule 8: the red-team can tighten BUILD to VALIDATE FIRST, never to REJECT", () => {
    const r = decideVerdict(base({ redTeamRecommendation: "reject" }));
    expect(r.verdict).toBe("validate_first");
    expect(codes(r)).toEqual(["ALL_GATES_PASSED", "RED_TEAM_OBJECTION"]);
    // ...and never loosens a stricter verdict.
    const strict = decideVerdict(
      base({
        score: scored({ willingness_to_pay: null }),
        redTeamRecommendation: "build_candidate",
      }),
    );
    expect(strict.verdict).toBe("validate_first");
  });

  it("workspace thresholds can only be raised (PD-23 A)", () => {
    const s = scored({ customer_demand: 4 }); // 96
    expect(decideVerdict(base({ score: s, thresholds: { minScore: 97 } })).verdict).toBe(
      "validate_first",
    );
    expect(codes(decideVerdict(base({ score: s, thresholds: { minScore: 97 } })))).toEqual([
      "SCORE_BELOW_BUILD_THRESHOLD",
    ]);
    // Lowering below the locked minimums is ignored.
    const wtpNine = scored({ willingness_to_pay: 3 }); // WTP 9
    expect(
      decideVerdict(base({ score: wtpNine, thresholds: { minWtp: 5, minScore: 50 } })).verdict,
    ).toBe("validate_first");
    expect(decideVerdict(base({ thresholds: { minWtp: 15 } })).verdict).toBe("build_candidate");
  });
});
