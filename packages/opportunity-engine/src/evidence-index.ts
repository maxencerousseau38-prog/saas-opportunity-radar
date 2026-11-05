// Deterministic selection of the analysis evidence index (Implementation
// Blueprint §8.1 "Building the evidence index"). Agents receive only the
// index; every citation must reference it.
import { evidenceQuality, toQuality } from "@sor/domain";
import type { AnalysisContext, CandidateEvidence, ScopeRole } from "./types";

export const INDEX_CAP = { quick: 60, standard: 150, deep: 300 } as const;

const ROLE_RANK: Record<ScopeRole, number> = {
  subject: 0,
  set_member: 0,
  opportunity_source: 0,
  cluster_product: 0,
  category_member: 1,
  competitor: 2,
};

/**
 * Subject-side evidence first, then competitors; within a rank the best
 * quality q(e), the most recent, then the id (stable order).
 */
export function selectEvidenceIndex(
  analysis: AnalysisContext,
  candidates: CandidateEvidence[],
  now: Date,
): CandidateEvidence[] {
  const visible = new Map(analysis.scope.filter((p) => p.visible).map((p) => [p.id, p.role]));
  const rank = (e: CandidateEvidence) =>
    e.productId === null ? 1 : (ROLE_RANK[visible.get(e.productId) ?? "competitor"] ?? 2);
  const eligible = candidates.filter((e) => e.productId === null || visible.has(e.productId));
  const dated = (e: CandidateEvidence) => e.publishedAt ?? e.observedAt;
  return [...eligible]
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        evidenceQuality(toQuality(b), now) - evidenceQuality(toQuality(a), now) ||
        dated(b).localeCompare(dated(a)) ||
        a.evidenceId.localeCompare(b.evidenceId),
    )
    .slice(0, INDEX_CAP[analysis.depth]);
}

/** What an agent sees of one evidence item: metadata (trusted) + claim text (untrusted). */
export function evidenceLabel(e: CandidateEvidence, productName: (id: string) => string | null) {
  const parts = [
    e.claimType,
    e.productId ? (productName(e.productId) ?? "product") : "market/category",
    `reliability ${e.reliabilityLevel}`,
    e.verificationStatus,
    e.factStatus,
    e.monetizationSignal ? `wtp:${e.monetizationSignal}` : null,
    (e.publishedAt ?? e.observedAt).slice(0, 10),
  ].filter(Boolean);
  return `evidence [${parts.join(" · ")}]`;
}
