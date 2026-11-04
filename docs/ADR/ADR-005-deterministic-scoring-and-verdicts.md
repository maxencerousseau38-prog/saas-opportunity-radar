# ADR-005 — Server-side deterministic scoring and verdict gates

- **Status:** ACCEPTED; parameters PENDING_USER_APPROVAL (PD-05, PD-06, PD-07, PD-21, PD-23)
- **Date:** 4 November 2026
- **Sources:** PRD §8 (weights, 0–5 scale, formula, thresholds 75/100 and 10/15, separate confidence, unknown ≠ 0, decision bands), §21 (credible paying-customer signs are mandatory to validate); `CLAUDE.md` §4.2 and §10.

## Decision (ACCEPTED)

- **Weights:** 20 / 15 / 20 / 15 / 15 / 15.
- **Formula:** `weighted_points = rating / 5 × weight`.
- **Server-side computation:** the server (`packages/domain`) computes points, coverage, WTP, confidence, band and verdict. LLMs only propose dimension assessments with evidence.
- **Coverage:**
  - An insufficient-evidence dimension is not assessed and never counts as zero.
  - A final score exists only at 100 % coverage.
  - Provisional points are shown with their coverage and are never normalised to /100.
- **WTP:** WTP = WTP rating × 3, from the same dimension.
- **WTP cap:** a WTP rating ≥ 4 requires verified `payment_confirmed` / `customer_verified` evidence. Otherwise the server caps it at 3.
- **Verdict rules:**
  - A substantiated critical kill criterion → REJECT.
  - Incomplete coverage → VALIDATE FIRST.
  - An excluded or under-review Recommended Product blocks BUILD CANDIDATE (ADR-010).
  - Score < 50 → REJECT (PRD "0–49 Rejeter"). Whether a low-confidence exception should soften this rule is PD-06.
  - Score 65–74 → VALIDATE FIRST.
  - BUILD CANDIDATE needs:
    - score ≥ 75;
    - WTP ≥ 10;
    - adequate confidence;
    - demand evidence;
    - concrete differentiation;
    - verified paying-customer evidence;
    - no unresolved critical kill criterion.
  - The red-team can only tighten the verdict.
- **Display:** the PRD decision band is always shown with a complete score.
- **Database defence:** a check refuses `build_candidate` unless score ≥ 75 and WTP ≥ 10.

## Pending parameters

- **PD-05:** integer ratings. Recommended. With integer ratings every score is an integer, so threshold comparisons are exact.
- **PD-06:** the verdict for scores 50–64. Recommended: REJECT, while displaying the band "Faible potentiel". Also: whether low confidence turns a score < 50 into VALIDATE FIRST. Recommended: no.
- **PD-07:**
  - the confidence formula (Implementation Blueprint §9.4) and the BUILD threshold, recommended at 70;
  - the demand gate: rating ≥ 3 from ≥ 2 distinct source records;
  - the differentiation gate: rating ≥ 3 and ≥ 1 evidenced opportunity or competitor-gap finding;
  - kill-criterion substantiation: ≥ 1 verified piece of evidence at reliability ≤ 3.
- **PD-23:** PRD §14.1 "Seuil de validation". Recommended: a workspace may only raise the BUILD thresholds above 75 / 10, never lower them (PRD §21 locks the minimums).
- **PD-21:** whether user-recorded payments from validation experiments satisfy the paying-customer gate. To decide before Phase 3.

## Corrections to v1.0 reference code

- Rounding before the threshold comparison.
- A silent zero for an assessed dimension without a rating.
- A second, independent WTP input.
- Any kill criterion forcing REJECT.
- No REJECT for low scores.
- Provisional scores normalised to /100.
