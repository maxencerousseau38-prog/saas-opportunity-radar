// Visual references collection (PD-38, amendment of ADR-016). Builds a
// snapshot of references (no image bytes) from the committed catalog
// snapshots: free-licence images of Wikidata listings (Wikimedia Commons), or
// the share image each listing's official site declares. Runs in the Catalog
// visuals workflow (GitHub runners); no database access, no secret.
import type { CatalogListing, VisualReference, VisualReferenceSnapshot } from "@sor/contracts";
import { VisualReferenceSnapshotSchema } from "@sor/contracts";
import {
  collectCommonsReferences,
  collectShareImage,
  defaultPolicy,
  OfficialWebsiteConnector,
  shareImagePolicy,
  type CommonsGetter,
  type ShareImageDecision,
  type SparqlRunner,
} from "@sor/data-sources";
import { normalizeUrl, VISUAL_REFERENCE_RULES_VERSION } from "@sor/domain";

export async function collectLicensed(options: {
  listings: CatalogListing[];
  run: SparqlRunner;
  get: CommonsGetter;
  pauseMs?: number;
  now?: () => Date;
  log?: (line: string) => void;
}): Promise<VisualReferenceSnapshot> {
  const wikidata = options.listings
    .filter((l) => l.source_key === "wikidata")
    .map((l) => ({ external_id: l.external_id, name: l.name }));
  const result = await collectCommonsReferences({ ...options, listings: wikidata });
  return VisualReferenceSnapshotSchema.parse({
    contract_version: "visual-references-1",
    kind: "licensed",
    rules_version: result.rules_version,
    collected_at: (options.now ?? (() => new Date()))().toISOString(),
    summary: {
      candidates: result.candidates,
      references: result.references.length,
      rejected: result.rejected,
    },
    references: result.references,
  });
}

export type ShareImageCollector = (
  listing: { source_key: string; external_id: string; name: string; website_url: string | null },
  signal: AbortSignal,
) => Promise<ShareImageDecision>;

/** Production collector: official-website connector + SSRF-safe image fetch. */
export function liveShareImageCollector(): ShareImageCollector {
  const connector = new OfficialWebsiteConnector({
    policy: defaultPolicy({ timeoutMs: 15_000, maxBytes: 3 * 1024 * 1024 }),
    minIntervalMs: 1_000,
  });
  const policy = shareImagePolicy();
  return (listing, signal) => collectShareImage({ connector, listing, policy, signal });
}

/**
 * Every listing with an official site; one fetch per official URL (a product
 * listed by both sources shares it), a bounded number in parallel.
 */
export async function collectPublisher(options: {
  listings: CatalogListing[];
  collect: ShareImageCollector;
  concurrency?: number;
  timeoutMs?: number;
  now?: () => Date;
  log?: (line: string) => void;
}): Promise<VisualReferenceSnapshot> {
  const rejected: Record<string, number> = {};
  const references: VisualReference[] = [];
  const byUrl = new Map<string, Promise<ShareImageDecision>>();
  const listings = options.listings;
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < listings.length) {
      const listing = listings[next++]!;
      let key = listing.website_url ?? "";
      try {
        if (key) key = normalizeUrl(key).canonicalUrl;
      } catch {
        // invalid URL: the collector says so
      }
      let pending = key ? byUrl.get(key) : undefined;
      if (!pending) {
        pending = options
          .collect(listing, AbortSignal.timeout(options.timeoutMs ?? 60_000))
          .catch((err: unknown) => ({ rejection: `error_${(err as Error).name || "unknown"}` }));
        if (key) byUrl.set(key, pending);
      }
      const decision = await pending;
      if ("reference" in decision) {
        references.push({
          ...decision.reference,
          listing_source_key: listing.source_key,
          listing_external_id: listing.external_id,
          product_name: listing.name.slice(0, 200),
        });
      } else {
        rejected[decision.rejection] = (rejected[decision.rejection] ?? 0) + 1;
      }
      done++;
      if (options.log && done % 250 === 0) {
        options.log(`${done}/${listings.length} listings, ${references.length} share images`);
      }
    }
  };
  await Promise.all(Array.from({ length: options.concurrency ?? 12 }, worker));
  references.sort((a, b) =>
    `${a.listing_source_key}:${a.listing_external_id}`.localeCompare(
      `${b.listing_source_key}:${b.listing_external_id}`,
    ),
  );
  return VisualReferenceSnapshotSchema.parse({
    contract_version: "visual-references-1",
    kind: "publisher",
    rules_version: VISUAL_REFERENCE_RULES_VERSION,
    collected_at: (options.now ?? (() => new Date()))().toISOString(),
    summary: { candidates: listings.length, references: references.length, rejected },
    references,
  });
}
