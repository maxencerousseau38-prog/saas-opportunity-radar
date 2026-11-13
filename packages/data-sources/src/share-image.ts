// Publisher share images (PD-38, amendment of ADR-016). For one catalog
// listing: fetch the official home page through the official-website
// connector (robots.txt, SSRF-safe fetcher, same-site redirects only), read
// the link-preview image the publisher declares (og:image / twitter:image),
// download it once through the SSRF-safe image fetcher (robots.txt of the
// image host, raster types, size cap) to check that it is a real, wide image
// and to hash it, then forget the bytes: the card displays it by reference.
import { createHash } from "node:crypto";
import type { VisualReference } from "@sor/contracts";
import {
  checkVisualReferenceBytes,
  heroShowsProduct,
  isOnProductDomain,
  normalizeUrl,
  type VisualReferenceKind,
} from "@sor/domain";
import type { OfficialWebsiteConnector } from "./connectors/official-website";
import type { SafeFetchPolicy } from "./safe-fetch";
import type { SiteImageCandidate } from "./site-images";
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

/** Both visuals of one official page: its share image and its best site image. */
export interface OfficialVisualsDecision {
  share: ShareImageDecision;
  site: ShareImageDecision;
}

/** Site images downloaded at most per page to find one that passes the rules. */
export const MAX_SITE_IMAGE_DOWNLOADS = 3;

/**
 * One visit of the official home page (robots.txt, SSRF-safe fetcher,
 * same-site redirects only), then: the share image the publisher declares
 * (PD-38) and the best hero or interface screenshot the page shows (PD-40).
 * Each image is downloaded once to check that it is real, wide and detailed,
 * then hashed and forgotten: it is displayed by reference.
 */
export async function collectOfficialVisuals(args: {
  connector: Pick<OfficialWebsiteConnector, "fetchDocument">;
  listing: ShareImageListing;
  policy: SafeFetchPolicy;
  signal: AbortSignal;
  now?: () => Date;
  /** Tests only (loopback fixture server). */
  requireHttps?: boolean;
}): Promise<OfficialVisualsDecision> {
  const { listing } = args;
  const both = (rejection: string): OfficialVisualsDecision => ({
    share: { rejection },
    site: { rejection },
  });
  if (!listing.website_url) return both("no_official_site");
  let domain: string | null;
  try {
    domain = normalizeUrl(listing.website_url).registrableDomain;
  } catch {
    return both("invalid_official_site");
  }
  const page = await args.connector.fetchDocument(listing.website_url, args.signal);
  if (page.status !== "ok") {
    return both(page.status === "blocked" ? `page_${page.reason}` : `page_${page.status}`);
  }
  const pageUrl = page.data.canonical_url;
  const requireHttps = args.requireHttps ?? true;
  if (requireHttps && !isOnProductDomain(pageUrl, domain)) return both("off_site");
  const meta = (page.data.metadata ?? {}) as Record<string, unknown>;
  const observed = (args.now ?? (() => new Date()))().toISOString();

  const check = async (
    kind: VisualReferenceKind,
    imageUrl: string,
    alt: string | null,
    fallbackAlt: string,
  ): Promise<ShareImageDecision> => {
    const image = await fetchVisualAsset(imageUrl, args.policy, args.signal, { requireHttps });
    if (image.status !== "ok") {
      return {
        rejection: image.status === "blocked" ? `image_${image.reason}` : `image_${image.status}`,
      };
    }
    const finalUrl = requireHttps
      ? image.data.finalUrl
      : image.data.finalUrl.replace(/^http:/, "https:");
    const checked = checkVisualReferenceBytes(kind, finalUrl, image.data.bytes);
    if (!checked.ok) return { rejection: checked.errors[0]! };
    return {
      reference: {
        kind,
        listing_source_key: listing.source_key,
        listing_external_id: listing.external_id,
        product_name: listing.name.slice(0, 200),
        image_url: image.data.finalUrl,
        page_url: pageUrl,
        content_hash: createHash("sha256").update(image.data.bytes).digest("hex"),
        content_type: checked.info.contentType,
        width: checked.info.width,
        height: checked.info.height,
        alt_text: (alt?.trim() ? alt : fallbackAlt).slice(0, 500),
        observed_at: observed,
        licence_code: null,
        licence_url: null,
        attribution: null,
      },
    };
  };

  const shareUrl = typeof meta.share_image === "string" ? meta.share_image : null;
  const share: ShareImageDecision = shareUrl
    ? await check(
        "publisher",
        shareUrl,
        typeof meta.share_image_alt === "string" ? meta.share_image_alt : null,
        `Image de partage de ${listing.name} publiée sur son site officiel`,
      )
    : { rejection: "no_share_image" };

  const candidates = Array.isArray(meta.site_images)
    ? (meta.site_images as SiteImageCandidate[])
    : [];
  let site: ShareImageDecision = { rejection: "no_site_image" };
  let downloads = 0;
  for (const candidate of candidates) {
    if (downloads >= MAX_SITE_IMAGE_DOWNLOADS) break;
    // A hero must visibly concern the product, not decorate the page (visref-2).
    if (
      candidate.kind === "site_hero" &&
      !heroShowsProduct({ imageUrl: candidate.url, alt: candidate.alt, productName: listing.name })
    ) {
      site = { rejection: "hero_not_product" };
      continue;
    }
    downloads++;
    const label =
      candidate.kind === "site_screenshot"
        ? `Capture de l’interface de ${listing.name} sur son site officiel`
        : `Visuel principal du site officiel de ${listing.name}`;
    const decision = await check(candidate.kind, candidate.url, candidate.alt, label);
    site = decision;
    if ("reference" in decision) break;
  }
  return { share, site };
}

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
