# ADR-005 — Server-side deterministic scoring and verdict gates

- **Status:** ACCEPTED (parameters PD-05, PD-06, PD-07, PD-21 and PD-23 approved on 4 November 2026); low-confidence exception PENDING_USER_APPROVAL (PD-25)
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
  - Score < 50 → REJECT (PRD "0–49 Rejeter"). Whether a low-confidence exception should soften this rule is PD-25 (pending); until then the rule applies as written.
  - Score 50–64 → VALIDATE FIRST, with the band "Faible potentiel" displayed (PD-06, option B).
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

## Parameters approved on 4 November 2026

- **PD-05 (A):** integer ratings 0–5. Every score is an integer, so threshold comparisons are exact. WTP ≥ 10/15 means a WTP rating ≥ 4.
- **PD-06 (B):** a complete score of 50–64 gives VALIDATE FIRST, with the band "Faible potentiel" displayed. Consequently REJECT comes only from a score < 50 or a substantiated critical kill criterion.
- **PD-07 (A):**
  - the confidence formula of Implementation Blueprint §9.4, with a BUILD threshold of 70;
  - the demand gate: rating ≥ 3 from ≥ 2 distinct source records;
  - the differentiation gate: rating ≥ 3 and ≥ 1 evidenced opportunity or competitor-gap finding;
  - kill-criterion substantiation: ≥ 1 verified piece of evidence at reliability ≤ 3.
- **PD-23 (A):** PRD §14.1 "Seuil de validation": a workspace may only raise the BUILD thresholds above 75 / 10, never lower them (PRD §21 locks the minimums).
- **PD-21 (A):** in Phase 3, a payment recorded in a validation experiment counts as paying-customer evidence **only with a proof document** (invoice or payment record). It is recorded as an evidence item with `evidence_type = 'user_declared'`, `monetization_signal = 'payment_confirmed'` and reliability level 2 (first-party record with proof). It reaches `fact_status = 'confirmed'` and `verification_status = 'verified'` only after the platform operator has checked the proof. Without a proof document, it stays `declared` at reliability level 4 and cannot satisfy the gate.

## Still pending

- **PD-25:** should low confidence turn a complete score < 50 into VALIDATE FIRST? Recommended: no. Until decided, "score < 50 → REJECT" applies.

## Corrections to v1.0 reference code

- Rounding before the threshold comparison.
- A silent zero for an assessed dimension without a rating.
- A second, independent WTP input.
- Any kill criterion forcing REJECT.
- No REJECT for low scores.
- Provisional scores normalised to /100.
