// Combines the deterministic verification of D6 with the model's judgments:
// the model can only make a verdict stricter (Implementation Blueprint §6.7).
import type { EnrichmentOutput, VerificationOutput } from "@sor/contracts";
import { verifyClaim, type VerificationStatus } from "@sor/domain";
import type { FetchedSnapshot } from "./types";

export type ItemKind = "claims" | "features" | "integrations" | "pricing_plans";

export interface VerifiedItem {
  ref: string;
  kind: ItemKind;
  index: number;
  status: VerificationStatus;
  reasons: string[];
  monetizationSignal: string | null;
  snapshot: FetchedSnapshot | null;
}

export function itemsOf(
  output: EnrichmentOutput,
): Array<{ ref: string; kind: ItemKind; index: number; quote: string; snapshotId: string }> {
  const list: Array<{
    ref: string;
    kind: ItemKind;
    index: number;
    quote: string;
    snapshotId: string;
  }> = [];
  (["claims", "features", "integrations", "pricing_plans"] as const).forEach((kind) => {
    output[kind].forEach((item, index) =>
      list.push({
        ref: `${kind}.${index}`,
        kind,
        index,
        quote: item.quote,
        snapshotId: item.source_snapshot_id,
      }),
    );
  });
  return list;
}

const STRICTNESS: Record<VerificationStatus, number> = {
  verified: 0,
  stale: 1,
  needs_review: 2,
  unverified: 2,
  rejected: 3,
};

export function verifyEnrichment(
  output: EnrichmentOutput,
  judgments: VerificationOutput | null,
  snapshots: FetchedSnapshot[],
  options: { now: Date; maxAgeDays: number },
): VerifiedItem[] {
  const byId = new Map(snapshots.map((s) => [s.snapshot_id, s]));
  const judged = new Map((judgments?.judgments ?? []).map((j) => [j.ref, j.support]));
  return itemsOf(output).map((item) => {
    const snapshot = byId.get(item.snapshotId) ?? null;
    let claimType =
      item.kind === "pricing_plans" ? "pricing" : item.kind === "claims" ? "other" : "feature";
    let monetization: string | null = null;
    if (item.kind === "pricing_plans") {
      const plan = output.pricing_plans[item.index];
      monetization =
        plan && plan.price_amount !== null && plan.price_amount > 0 ? "paid_plan_available" : null;
    }
    if (item.kind === "claims") claimType = output.claims[item.index]?.field_key ?? "other";
    const det = verifyClaim({
      claimType,
      monetizationSignal: monetization,
      reliabilityLevel: 1,
      quote: item.quote,
      snapshotText: snapshot?.text ?? null,
      snapshotSuppliedToStep: snapshot !== null,
      publishedAt: snapshot?.published_at ?? null,
      retrievedAt: snapshot?.retrieved_at ?? options.now.toISOString(),
      now: options.now,
      maxAgeDays: options.maxAgeDays,
    });
    const support = judged.get(item.ref);
    const fromModel: VerificationStatus =
      support === "supported"
        ? "verified"
        : support === "not_supported"
          ? "rejected"
          : "needs_review";
    const status = STRICTNESS[fromModel] > STRICTNESS[det.status] ? fromModel : det.status;
    const reasons = [...det.reasons];
    if (status !== det.status) reasons.push(support ? `model_${support}` : "model_no_judgment");
    return {
      ref: item.ref,
      kind: item.kind,
      index: item.index,
      status,
      reasons,
      monetizationSignal: det.monetizationSignal,
      snapshot,
    };
  });
}
