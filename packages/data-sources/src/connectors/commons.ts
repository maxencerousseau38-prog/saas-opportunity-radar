// Free-licence product images (PD-38, amendment of ADR-016). For catalog
// listings from Wikidata, reads the item's image (P18) from the public query
// service, then the file's licence, author, size and SHA-1 from the official
// Wikimedia Commons API. Only CC0, public domain, CC BY and CC BY-SA raster
// files that look like a product visual (not a logo) are kept; the image is
// displayed by reference with its licence and attribution. No copy is made.
import type { VisualReference } from "@sor/contracts";
import {
  attributionRequired,
  checkVisualReference,
  normalizeFreeLicence,
  plainAttribution,
  VISUAL_REFERENCE_RULES_VERSION,
} from "@sor/domain";
import { WIKIDATA_USER_AGENT, type SparqlRunner } from "./wikidata";

export const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
/** Width of the thumbnail Commons renders for the card (no copy kept by SOR). */
export const COMMONS_THUMB_WIDTH = 1280;
export const COMMONS_BATCH = 50;

export interface CommonsListing {
  external_id: string;
  name: string;
}

/** SPARQL: the image (P18) of each Wikidata item, if any. */
export function buildWikidataImagesQuery(qids: string[]): string {
  const values = qids
    .filter((q) => /^Q\d+$/.test(q))
    .map((q) => `wd:${q}`)
    .join(" ");
  return `SELECT ?item ?image WHERE { VALUES ?item { ${values} } ?item wdt:P18 ?image . }`;
}

/** Item -> first Commons file title ("File:…"). */
export function parseWikidataImages(json: unknown): Map<string, string> {
  const out = new Map<string, string>();
  const rows = (json as { results?: { bindings?: unknown[] } })?.results?.bindings ?? [];
  for (const row of rows as Array<Record<string, { value?: string }>>) {
    const qid = /\/(Q\d+)$/.exec(row.item?.value ?? "")?.[1];
    const image = row.image?.value ?? "";
    const name = /Special:FilePath\/(.+)$/.exec(image)?.[1];
    if (!qid || !name || out.has(qid)) continue;
    let title: string;
    try {
      title = decodeURIComponent(name).replace(/_/g, " ");
    } catch {
      continue;
    }
    out.set(qid, `File:${title}`);
  }
  return out;
}

export function commonsImageInfoUrl(titles: string[]): string {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo",
    iiprop: "url|size|mime|sha1|extmetadata",
    iiurlwidth: String(COMMONS_THUMB_WIDTH),
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|AttributionRequired",
    titles: titles.join("|"),
  });
  return `${COMMONS_API}?${params.toString()}`;
}

export interface CommonsFileInfo {
  title: string;
  descriptionUrl: string;
  thumbUrl: string;
  thumbWidth: number;
  thumbHeight: number;
  mime: string;
  sha1: string;
  licenceShortName: string | null;
  licenceUrl: string | null;
  artistHtml: string | null;
}

/** Commons imageinfo (formatversion 2) -> file info by requested title. */
export function parseCommonsImageInfo(json: unknown): Map<string, CommonsFileInfo> {
  const out = new Map<string, CommonsFileInfo>();
  const q = (json as { query?: Record<string, unknown> })?.query ?? {};
  const aliases = new Map<string, string>();
  for (const n of (q.normalized as Array<{ from: string; to: string }> | undefined) ?? []) {
    aliases.set(n.to, n.from);
  }
  for (const page of (q.pages as Array<Record<string, unknown>> | undefined) ?? []) {
    const info = (page.imageinfo as Array<Record<string, unknown>> | undefined)?.[0];
    const title = page.title as string | undefined;
    if (!info || !title) continue;
    const meta = (info.extmetadata ?? {}) as Record<string, { value?: string }>;
    const record: CommonsFileInfo = {
      title,
      descriptionUrl: String(info.descriptionurl ?? ""),
      thumbUrl: String(info.thumburl ?? info.url ?? ""),
      thumbWidth: Number(info.thumbwidth ?? info.width ?? 0),
      thumbHeight: Number(info.thumbheight ?? info.height ?? 0),
      mime: String(info.mime ?? ""),
      sha1: String(info.sha1 ?? "").toLowerCase(),
      licenceShortName: meta.LicenseShortName?.value ?? null,
      licenceUrl: meta.LicenseUrl?.value ?? null,
      artistHtml: meta.Artist?.value ?? null,
    };
    out.set(title, record);
    const alias = aliases.get(title);
    if (alias) out.set(alias, record);
  }
  return out;
}

export type CommonsGetter = (url: string) => Promise<unknown>;

/** Commons API getter with the descriptive User-Agent and a timeout. */
export function commonsHttpGetter(
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): CommonsGetter {
  const fetchImpl = options.fetchImpl ?? fetch;
  return async (url) => {
    const res = await fetchImpl(url, {
      headers: { "user-agent": WIKIDATA_USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
    });
    if (!res.ok) throw new Error(`commons_http_${res.status}`);
    return res.json();
  };
}

export interface CollectedReferences {
  candidates: number;
  references: VisualReference[];
  rejected: Record<string, number>;
}

/** Decides one Commons file for one listing; returns the reference or why not. */
export function commonsReference(
  listing: CommonsListing,
  file: CommonsFileInfo,
  observedAt: string,
): { reference: VisualReference } | { rejection: string } {
  if (!/^image\/(png|jpeg|webp)$/.test(file.mime)) return { rejection: "unsupported_format" };
  const licence = normalizeFreeLicence(file.licenceShortName);
  if (!licence) return { rejection: "licence_not_free" };
  const attribution = plainAttribution(file.artistHtml);
  if (attributionRequired(licence) && !attribution) return { rejection: "attribution_missing" };
  const licenceUrl =
    file.licenceUrl && /^https?:\/\//.test(file.licenceUrl)
      ? file.licenceUrl
      : licence === "Public-Domain" || licence === "CC0-1.0"
        ? "https://creativecommons.org/publicdomain/zero/1.0/"
        : null;
  if (!licenceUrl) return { rejection: "licence_url_missing" };
  const descriptionUrl = file.descriptionUrl.replace(/^http:/, "https:");
  if (!/^https:\/\/upload\.wikimedia\.org\//.test(file.thumbUrl))
    return { rejection: "not_on_commons" };
  if (!/^https:\/\/commons\.wikimedia\.org\//.test(descriptionUrl))
    return { rejection: "not_on_commons" };
  if (!/^[0-9a-f]{40}$/.test(file.sha1)) return { rejection: "missing_hash" };
  const contentType = file.mime as "image/png" | "image/jpeg" | "image/webp";
  const errors = checkVisualReference("licensed", file.thumbUrl, {
    contentType,
    width: file.thumbWidth,
    height: file.thumbHeight,
  });
  if (errors.length) return { rejection: errors[0]! };
  return {
    reference: {
      kind: "licensed",
      listing_source_key: "wikidata",
      listing_external_id: listing.external_id,
      product_name: listing.name.slice(0, 200),
      image_url: file.thumbUrl,
      page_url: descriptionUrl,
      content_hash: file.sha1,
      content_type: contentType,
      width: file.thumbWidth,
      height: file.thumbHeight,
      alt_text: `Image de ${listing.name} (${file.title.replace(/^File:/, "")})`.slice(0, 500),
      observed_at: observedAt,
      licence_code: licence,
      licence_url: licenceUrl,
      attribution: attribution,
    },
  };
}

/** Wikidata listings -> free-licence references (one per item at most). */
export async function collectCommonsReferences(options: {
  listings: CommonsListing[];
  run: SparqlRunner;
  get: CommonsGetter;
  pauseMs?: number;
  now?: () => Date;
  log?: (line: string) => void;
}): Promise<CollectedReferences & { rules_version: string }> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const now = options.now ?? (() => new Date());
  const rejected: Record<string, number> = {};
  const reject = (reason: string, count = 1) => {
    rejected[reason] = (rejected[reason] ?? 0) + count;
  };
  const references: VisualReference[] = [];
  const listings = options.listings.filter((l) => /^Q\d+$/.test(l.external_id));
  const images = new Map<string, string>();
  for (let i = 0; i < listings.length; i += 150) {
    const batch = listings.slice(i, i + 150).map((l) => l.external_id);
    try {
      for (const [qid, title] of parseWikidataImages(
        await options.run(buildWikidataImagesQuery(batch)),
      )) {
        images.set(qid, title);
      }
    } catch (err) {
      reject("wikidata_error", batch.length);
      options.log?.(`wikidata batch ${i}: ${(err as Error).message}`);
    }
    if (options.pauseMs) await sleep(options.pauseMs);
  }
  const withImage = listings.filter((l) => images.has(l.external_id));
  for (const l of listings) if (!images.has(l.external_id)) reject("no_image_on_wikidata");
  for (let i = 0; i < withImage.length; i += COMMONS_BATCH) {
    const batch = withImage.slice(i, i + COMMONS_BATCH);
    let files: Map<string, CommonsFileInfo>;
    try {
      files = parseCommonsImageInfo(
        await options.get(commonsImageInfoUrl(batch.map((l) => images.get(l.external_id)!))),
      );
    } catch (err) {
      reject("commons_error", batch.length);
      options.log?.(`commons batch ${i}: ${(err as Error).message}`);
      continue;
    }
    const observedAt = now().toISOString();
    for (const listing of batch) {
      const file = files.get(images.get(listing.external_id)!);
      if (!file) {
        reject("file_not_found");
        continue;
      }
      const decision = commonsReference(listing, file, observedAt);
      if ("reference" in decision) references.push(decision.reference);
      else reject(decision.rejection);
    }
    if (options.pauseMs) await sleep(options.pauseMs);
  }
  return {
    candidates: listings.length,
    references,
    rejected,
    rules_version: VISUAL_REFERENCE_RULES_VERSION,
  };
}
