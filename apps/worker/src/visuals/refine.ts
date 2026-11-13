// Offline refinement of a committed site-visuals snapshot (visref-2): applies
// the relevance rule to references collected before it existed, without
// fetching anything again. Deterministic; the summary records what was dropped.
import type { VisualReferenceSnapshot } from "@sor/contracts";
import { VisualReferenceSnapshotSchema } from "@sor/contracts";
import { heroShowsProduct } from "@sor/domain";

export function refineSiteSnapshot(snapshot: VisualReferenceSnapshot): VisualReferenceSnapshot {
  if (snapshot.kind !== "site") return snapshot;
  const kept = snapshot.references.filter(
    (r) =>
      r.kind !== "site_hero" ||
      heroShowsProduct({ imageUrl: r.image_url, alt: r.alt_text, productName: r.product_name }),
  );
  const dropped = snapshot.references.length - kept.length;
  if (!dropped) return snapshot;
  const rejected = { ...snapshot.summary.rejected };
  rejected.hero_not_product = (rejected.hero_not_product ?? 0) + dropped;
  return VisualReferenceSnapshotSchema.parse({
    ...snapshot,
    summary: { ...snapshot.summary, references: kept.length, rejected },
    references: kept,
  });
}
