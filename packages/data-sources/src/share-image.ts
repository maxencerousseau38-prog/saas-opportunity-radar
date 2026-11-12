// Publisher share images (PD-38, amendment of ADR-016). For one catalog
// listing: fetch the official home page through the official-website
// connector (robots.txt, SSRF-safe fetcher, same-site redirects only), read
// the link-preview image the publisher declares (og:image / twitter:image),
// download it once through the SSRF-safe image fetcher (robots.txt of the
// image host, raster types, size cap) to check that it is a real, wide image
// and to hash it, then forget the bytes: the card displays it by reference.
import { createHash } from "node:crypto";
import type { VisualReference } from "@sor/contracts";
import { checkVisualReferenceBytes, isOnProductDomain, normalizeUrl } from "@sor/domain";
import type { OfficialWebsiteConnector } from "./connectors/official-website";
import type { SafeFetchPolicy } from "./safe-fetch";
import { fetchVisualAsset, imagePolicy } from "./visual-asset";

/** Share images may be larger than admitted copies: they are checked, not kept. */
export const SHARE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export function shareImagePolicy(overrides: Partial<SafeFetchPolicy> = {}): SafeFetchPolicy {
  return imagePolicy({ maxBytes: SHARE_IMAGE_MAX_BYTES, timeoutMs: 20_000, ...overrides });
}

export interface ShareImageListing {
  source_key: string;
  external_id: string;
  name: string;
  website_url: string | null;
}

export type ShareImageDecision = { reference: VisualReference } | { rejection: string };

export async function collectShareImage(args: {
  connector: Pick<OfficialWebsiteConnector, "fetchDocument">;
  listing: ShareImageListing;
  policy: SafeFetchPolicy;
  signal: AbortSignal;
  now?: () => Date;
  /** Tests only (loopback fixture server). */
  requireHttps?: boolean;
}): Promise<ShareImageDecision> {
  const { listing } = args;
  if (!listing.website_url) return { rejection: "no_official_site" };
  let domain: string | null;
  try {
    domain = normalizeUrl(listing.website_url).registrableDomain;
  } catch {
    return { rejection: "invalid_official_site" };
  }
  const page = await args.connector.fetchDocument(listing.website_url, args.signal);
  if (page.status !== "ok") {
    return { rejection: page.status === "blocked" ? `page_${page.reason}` : `page_${page.status}` };
  }
  const meta = (page.data.metadata ?? {}) as Record<string, unknown>;
  const shareUrl = typeof meta.share_image === "string" ? meta.share_image : null;
  if (!shareUrl) return { rejection: "no_share_image" };
  const pageUrl = page.data.canonical_url;
  const requireHttps = args.requireHttps ?? true;
  if (requireHttps && !isOnProductDomain(pageUrl, domain)) return { rejection: "off_site" };
  const image = await fetchVisualAsset(shareUrl, args.policy, args.signal, { requireHttps });
  if (image.status !== "ok") {
    return {
      rejection: image.status === "blocked" ? `image_${image.reason}` : `image_${image.status}`,
    };
  }
  const checked = checkVisualReferenceBytes(
    "publisher",
    requireHttps ? image.data.finalUrl : image.data.finalUrl.replace(/^http:/, "https:"),
    image.data.bytes,
  );
  if (!checked.ok) return { rejection: checked.errors[0]! };
  const alt =
    typeof meta.share_image_alt === "string" && meta.share_image_alt.trim()
      ? meta.share_image_alt
      : null;
  return {
    reference: {
      kind: "publisher",
      listing_source_key: listing.source_key,
      listing_external_id: listing.external_id,
      product_name: listing.name.slice(0, 200),
      image_url: image.data.finalUrl,
      page_url: pageUrl,
      content_hash: createHash("sha256").update(image.data.bytes).digest("hex"),
      content_type: checked.info.contentType,
      width: checked.info.width,
      height: checked.info.height,
      alt_text: (alt ?? `Image de partage de ${listing.name} publiée sur son site officiel`).slice(
        0,
        500,
      ),
      observed_at: (args.now ?? (() => new Date()))().toISOString(),
      licence_code: null,
      licence_url: null,
      attribution: null,
    },
  };
}
