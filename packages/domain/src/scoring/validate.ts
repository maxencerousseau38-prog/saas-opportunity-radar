// Validation of the O7a dimension proposals before scoring (Implementation
// Blueprint §9.2) and citation checks shared by every Opportunity Engine step.
// A failed validation rejects the step (retryable once, then needs_review).
import type { DimensionAssessmentProposal, EvidenceRef } from "@sor/contracts";
import { DIMENSION_KEYS, type IndexedEvidence, type ValidatedDimension } from "./score";

export const PAYING_SIGNALS = ["payment_confirmed", "customer_verified"] as const;

/** A verified paying-customer evidence item (§9.2 rule 4, PRD §21). */
export function isVerifiedPayingEvidence(e: IndexedEvidence): boolean {
  return (
    e.verificationStatus === "verified" &&
    (PAYING_SIGNALS as readonly string[]).includes(e.monetizationSignal ?? "")
  );
}

/** Cited evidence IDs that are not in the analysis evidence index. */
export function citationsOutsideIndex(
  refs: Array<Pick<EvidenceRef, "evidence_id">>,
  index: ReadonlyMap<string, IndexedEvidence>,
): string[] {
  return [...new Set(refs.map((r) => r.evidence_id).filter((id) => !index.has(id)))];
}

export interface ValidatedProposal extends ValidatedDimension {
  explanation: string;
  missingInformation: string[];
  evidence: EvidenceRef[];
}

export type ProposalValidation =
  | { ok: true; dimensions: ValidatedProposal[]; warnings: string[] }
  | { ok: false; errors: string[] };

export function validateProposals(
  proposals: DimensionAssessmentProposal[],
  index: ReadonlyMap<string, IndexedEvidence>,
): ProposalValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Rule 1: exactly six proposals with distinct keys.
  const keys = proposals.map((p) => p.dimension_key);
  if (proposals.length !== 6 || new Set(keys).size !== 6) {
    errors.push("PROPOSALS_NOT_ONE_PER_DIMENSION");
  }
  for (const k of DIMENSION_KEYS) {
    if (!keys.includes(k)) errors.push(`PROPOSAL_MISSING:${k}`);
  }

  const dimensions: ValidatedProposal[] = [];
  for (const p of proposals) {
    // Rule 2: every cited evidence ID is in the index.
    const outside = citationsOutsideIndex(p.evidence, index);
    if (outside.length > 0) errors.push(`EVIDENCE_OUTSIDE_INDEX:${p.dimension_key}`);

    const supportingRefs = p.evidence.filter((e) => e.support_type === "supports");
    const supporting = supportingRefs
      .map((e) => index.get(e.evidence_id))
      .filter((e): e is IndexedEvidence => e !== undefined);

    if (p.assessment_status === "assessed") {
      // Rule 5: integer rating 0..5 (PD-05).
      if (!Number.isInteger(p.rating) || p.rating < 0 || p.rating > 5) {
        errors.push(`RATING_INVALID:${p.dimension_key}`);
      }
      // Rule 3: an assessed proposal cites at least one supporting item.
      if (supporting.length === 0) errors.push(`ASSESSED_WITHOUT_EVIDENCE:${p.dimension_key}`);

      let rating = p.rating;
      // Rule 4: WTP ≥ 4 needs verified payment_confirmed / customer_verified support.
      if (p.dimension_key === "willingness_to_pay" && rating >= 4) {
        if (!supporting.some(isVerifiedPayingEvidence)) {
          rating = 3;
          warnings.push("WTP_RATING_CAPPED_AT_3");
        }
      }
      dimensions.push({
        key: p.dimension_key,
        status: "assessed",
        rating,
        supporting,
        explanation: p.explanation,
        missingInformation: p.missing_information,
        evidence: p.evidence,
      });
    } else {
      dimensions.push({
        key: p.dimension_key,
        status: "insufficient_evidence",
        rating: null,
        supporting: [],
        explanation: p.explanation,
        missingInformation: p.missing_information,
        evidence: p.evidence,
      });
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, dimensions, warnings };
}
