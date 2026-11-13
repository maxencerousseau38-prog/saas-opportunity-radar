// Visual references collection (PD-38, amendment of ADR-016). Builds a
// snapshot of references (no image bytes) from the committed catalog
// snapshots: free-licence images of Wikidata listings (Wikimedia Commons), or
// the share image each listing's official site declares. Runs in the Catalog
// visuals workflow (GitHub runners); no database access, no secret.
import type { CatalogListing, VisualReference, VisualReferenceSnapshot } from "@sor/contracts";
import { VisualReferenceSnapshotSchema } from "@sor/contracts";
import {
  collectCommonsReferences,
  collectOfficialVisuals,
  collectShareImage,
  defaultPolicy,
  OfficialWebsiteConnector,
  shareImagePolicy,
  type CommonsGetter,
  type OfficialVisualsDecision,
  type ShareImageDecision,
  type SparqlRunner,
} from "@sor/data-sources";
import { dropSharedImages, normalizeUrl, VISUAL_REFERENCE_RULES_VERSION } from "@sor/domain";

/** Registrable domain of the page that showed an image (one product = one domain). */
function pageDomain(pageUrl: string): string | null {
  try {
    return normalizeUrl(pageUrl).registrableDomain;
  } catch {
    return null;
  }
}

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
  const unique = dropSharedImages(references, pageDomain);
  if (unique.dropped) rejected.shared_across_products = unique.dropped;
  references.splice(0, references.length, ...unique.kept);
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

export type OfficialVisualsCollector = (
  listing: { source_key: string; external_id: string; name: string; website_url: string | null },
  signal: AbortSignal,
) => Promise<OfficialVisualsDecision>;

/** Production collector: one official page visit for both visuals (PD-38, PD-40). */
export function liveOfficialVisualsCollector(): OfficialVisualsCollector {
  const connector = new OfficialWebsiteConnector({
    policy: defaultPolicy({ timeoutMs: 15_000, maxBytes: 3 * 1024 * 1024 }),
    minIntervalMs: 1_000,
  });
  const policy = shareImagePolicy();
  return (listing, signal) => collectOfficialVisuals({ connector, listing, policy, signal });
}

/**
 * Every listing with an official site, one visit per official URL: the
 * publisher snapshot (share images, PD-38) and the site snapshot (hero or
 * interface screenshot, PD-40). An image found on two products' sites is a
 * template and is dropped from both snapshots (visref-2).
 */
export async function collectOfficial(options: {
  listings: CatalogListing[];
  collect: OfficialVisualsCollector;
  concurrency?: number;
  timeoutMs?: number;
  now?: () => Date;
  log?: (line: string) => void;
}): Promise<{ publisher: VisualReferenceSnapshot; site: VisualReferenceSnapshot }> {
  const out = {
    publisher: { rejected: {} as Record<string, number>, references: [] as VisualReference[] },
    site: { rejected: {} as Record<string, number>, references: [] as VisualReference[] },
  };
  const byUrl = new Map<string, Promise<OfficialVisualsDecision>>();
  const listings = options.listings;
  let next = 0;
  let done = 0;
  const record = (
    target: (typeof out)["site"],
    decision: ShareImageDecision,
    listing: CatalogListing,
  ) => {
    if ("reference" in decision) {
      target.references.push({
        ...decision.reference,
        listing_source_key: listing.source_key,
        listing_external_id: listing.external_id,
        product_name: listing.name.slice(0, 200),
      });
    } else {
      target.rejected[decision.rejection] = (target.rejected[decision.rejection] ?? 0) + 1;
    }
  };
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
          .collect(listing, AbortSignal.timeout(options.timeoutMs ?? 90_000))
          .catch((err: unknown) => {
            const rejection = `error_${(err as Error).name || "unknown"}`;
            return { share: { rejection }, site: { rejection } };
          });
        if (key) byUrl.set(key, pending);
      }
      const decision = await pending;
      record(out.publisher, decision.share, listing);
      record(out.site, decision.site, listing);
      done++;
      if (options.log && done % 250 === 0) {
        options.log(
          `${done}/${listings.length} listings, ${out.site.references.length} site images, ${out.publisher.references.length} share images`,
        );
      }
    }
  };
  await Promise.all(Array.from({ length: options.concurrency ?? 12 }, worker));
  const collectedAt = (options.now ?? (() => new Date()))().toISOString();
  const build = (kind: "publisher" | "site", part: (typeof out)["site"]) => {
    const unique = dropSharedImages(part.references, pageDomain);
    if (unique.dropped) part.rejected.shared_across_products = unique.dropped;
    const references = unique.kept.sort((a, b) =>
      `${a.listing_source_key}:${a.listing_external_id}`.localeCompare(
        `${b.listing_source_key}:${b.listing_external_id}`,
      ),
    );
    return VisualReferenceSnapshotSchema.parse({
      contract_version: "visual-references-1",
      kind,
      rules_version: VISUAL_REFERENCE_RULES_VERSION,
      collected_at: collectedAt,
      summary: {
        candidates: listings.length,
        references: references.length,
        rejected: part.rejected,
      },
      references,
    });
  };
  return { publisher: build("publisher", out.publisher), site: build("site", out.site) };
}
