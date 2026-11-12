// Loads a visual references snapshot into the catalog (PD-38) through
// sor_record_visual_reference: one evidence-linked reference per listing, no
// image bytes. Idempotent: a replayed snapshot creates nothing new.
import type { VisualReferenceSnapshot } from "@sor/contracts";
import { discoverAssetsRepo, type DbClient } from "@sor/database";

export interface VisualIngestSummary {
  kind: string;
  total: number;
  /** created | existing | no_product | not_visible | domain_mismatch | error */
  statuses: Record<string, number>;
  primary: number;
  errors: string[];
}

export async function ingestVisualReferences(
  db: DbClient,
  snapshot: VisualReferenceSnapshot,
  options: { concurrency?: number; log?: (line: string) => void } = {},
): Promise<VisualIngestSummary> {
  const summary: VisualIngestSummary = {
    kind: snapshot.kind,
    total: snapshot.references.length,
    statuses: {},
    primary: 0,
    errors: [],
  };
  const count = (status: string) => {
    summary.statuses[status] = (summary.statuses[status] ?? 0) + 1;
  };
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < snapshot.references.length) {
      const reference = snapshot.references[next++]!;
      try {
        const result = await discoverAssetsRepo.recordVisualReference(db, { ...reference });
        count(result.status);
        if (result.primary) summary.primary++;
      } catch (err) {
        count("error");
        if (summary.errors.length < 20) {
          summary.errors.push(
            `${reference.listing_source_key}:${reference.listing_external_id}: ${(err as Error).message}`.slice(
              0,
              300,
            ),
          );
        }
      }
      done++;
      if (options.log && done % 500 === 0) options.log(`${done}/${summary.total} references`);
    }
  };
  await Promise.all(Array.from({ length: options.concurrency ?? 4 }, worker));
  return summary;
}
