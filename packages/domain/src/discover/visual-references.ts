// Visual references (PD-38 and PD-40, amendments of ADR-016). Deterministic
// rules for the automatic kinds of product visuals, displayed by reference
// (no copy): the hero image and the interface screenshot the publisher shows
// on its own official home page (PD-40), free-licence images from Wikimedia
// Commons, and the share image a publisher declares (PD-38). No I/O here.
import { sniffImage, type ImageInfo } from "./visual-assets";

export const VISUAL_REFERENCE_RULES_VERSION = "visref-2";
export const VISUAL_REFERENCE_KINDS = [
  "site_hero",
  "site_screenshot",
  "licensed",
  "publisher",
] as const;
export type VisualReferenceKind = (typeof VISUAL_REFERENCE_KINDS)[number];

/** Free licences accepted (the database enforces the same list). */
export const FREE_LICENCE_PATTERN =
  /^(CC0-1\.0|Public-Domain|CC-BY(-SA)?-(1\.0|2\.0|2\.5|3\.0|4\.0))$/;

/**
 * Normalizes a Commons licence short name ("CC BY-SA 4.0", "CC0", "Public
 * domain", "CC BY 3.0 de") to an accepted code, or null when the licence is
 * not free enough for reuse here (NC, ND, GFDL-only, fair use, unknown).
 */
export function normalizeFreeLicence(shortName: string | null | undefined): string | null {
  const s = (shortName ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  if (/\b(nc|nd)\b|non-?commercial|no ?deriv|fair use|non-free/.test(s)) return null;
  if (/^cc0\b/.test(s) || s === "cc-zero") return "CC0-1.0";
  if (/^(public domain|pd\b|pd-)/.test(s)) return "Public-Domain";
  const m = /^cc[ -]by(?:[ -](sa))?[ -]([1-4]\.[05])\b/.exec(s);
  if (!m) return null;
  const code = `CC-BY${m[1] ? "-SA" : ""}-${m[2]}`;
  return FREE_LICENCE_PATTERN.test(code) ? code : null;
}

/** CC BY and CC BY-SA require attribution; CC0 and public domain do not. */
export function attributionRequired(licenceCode: string): boolean {
  return licenceCode.startsWith("CC-BY");
}

/** Plain-text author credit from Commons' HTML "Artist" field. */
export function plainAttribution(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 300) : null;
}

/** A share image is taken only from the product's own domain (or a subdomain). */
export function isOnProductDomain(pageUrl: string, productDomain: string | null): boolean {
  if (!productDomain) return false;
  let host: string;
  try {
    const url = new URL(pageUrl);
    if (url.protocol !== "https:") return false;
    host = url.hostname.toLowerCase();
  } catch {
    return false;
  }
  const domain = productDomain.toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Display precedence of a product's visuals (PD-40): what best shows the
 * product's own universe first. An operator-approved private copy stays on top.
 */
export const VISUAL_REFERENCE_RANK: Record<VisualReferenceKind, number> = {
  site_hero: 5,
  site_screenshot: 4,
  licensed: 3,
  publisher: 2,
};

export type VisualReferenceRejection =
  | "not_https"
  | "not_an_image"
  | "unsupported_format"
  | "too_small"
  | "logo_like_shape"
  | "logo_like_name"
  | "too_tall"
  | "signed_url"
  | "platform_default"
  | "stock_image"
  | "low_detail"
  | "shared_across_products";

/**
 * Minimum size and shape: a card visual is a wide image, never a logo or an
 * icon. Site images must be large enough to show the product, and not so
 * elongated that a 1.91:1 card crop would lose it.
 */
const MIN: Record<
  VisualReferenceKind,
  { width: number; height: number; ratio: number; maxRatio: number }
> = {
  site_hero: { width: 1000, height: 420, ratio: 1.15, maxRatio: 3.2 },
  site_screenshot: { width: 800, height: 400, ratio: 1.1, maxRatio: 2.8 },
  licensed: { width: 500, height: 280, ratio: 1.0, maxRatio: 4 },
  publisher: { width: 600, height: 300, ratio: 1.2, maxRatio: 4 },
};

/**
 * Bytes per pixel below which an image is close to blank (a flat colour, a
 * small logo on a plain background): it does not show the product. Site
 * images must carry real detail (an interface, a scene).
 */
const MIN_BYTES_PER_PIXEL: Record<VisualReferenceKind, number> = {
  site_hero: 0.03,
  site_screenshot: 0.03,
  licensed: 0,
  publisher: 0.012,
};

/**
 * Images a site builder, an app store or a platform puts on every page it
 * hosts: they say nothing about the product (visref-2 audit, 13 Nov 2026:
 * Lovable's default preview on 7 unrelated products, Softr's, Chrome Web
 * Store's, App Store icon cards).
 */
const PLATFORM_DEFAULT: RegExp[] = [
  /^https:\/\/lovable\.dev\/opengraph-image/i,
  /^https:\/\/[^/]*softr-files\.com\/.*default/i,
  /^https:\/\/[^/]*gstatic\.com\/chrome\/webstore\//i,
  /^https:\/\/is\d+-ssl\.mzstatic\.com\//i,
  /^https:\/\/[^/]*(webflow|framer|wix|squarespace|carrd|notion|super|bubble|base44|bolt|v0)\.[a-z.]+\/.*(default|placeholder)/i,
  /\/(og[_-]?)?(default|placeholder)[_-]?(og|share|social)?[_-]?image\.(png|jpe?g|webp)$/i,
];
/** Stock photo libraries: a generic picture, not the product. */
const STOCK_HOST =
  /(^|\.)(unsplash\.com|pexels\.com|pixabay\.com|shutterstock\.com|istockphoto\.com|gettyimages\.[a-z.]+|freepik\.com|stock\.adobe\.com|depositphotos\.com|dreamstime\.com|123rf\.com|stocksy\.com)$/i;

/** True for a platform's default preview or an app-store icon card. */
export function isPlatformDefaultImage(imageUrl: string): boolean {
  return PLATFORM_DEFAULT.some((pattern) => pattern.test(imageUrl));
}

/** True for an image served by a stock photo library. */
export function isStockImage(imageUrl: string): boolean {
  try {
    return STOCK_HOST.test(new URL(imageUrl).hostname);
  } catch {
    return false;
  }
}
const LOGO_NAME = /(^|[/_.-])(logo|logos|favicon|icon|icons|avatar|apple-touch)([/_.-]|\d|$)/i;
const RASTER = new Set(["image/png", "image/jpeg", "image/webp"]);
/**
 * Query parameters of signed or token-bearing URLs (S3/GCS presigned,
 * Firebase download tokens, JWTs, SAS): they expire and carry credentials,
 * so they are never a stable reference and are never recorded.
 */
const SIGNED_PARAM =
  /^(token|access_token|auth|authorization|key|apikey|api_key|sig|signature|credential|expires|policy|se|sp|sv|x-amz-.+|x-goog-.+)$/i;

/** True when the URL carries a signature, a token or credentials in its query. */
export function isSignedUrl(url: URL): boolean {
  for (const name of url.searchParams.keys()) if (SIGNED_PARAM.test(name)) return true;
  return false;
}

function safeDecode(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** Checks a candidate from its URL, format, dimensions and (when known) its size in bytes. */
export function checkVisualReference(
  kind: VisualReferenceKind,
  imageUrl: string,
  info: { contentType: string; width: number; height: number; byteLength?: number },
): VisualReferenceRejection[] {
  const errors: VisualReferenceRejection[] = [];
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    return ["not_https"];
  }
  if (url.protocol !== "https:") errors.push("not_https");
  if (isSignedUrl(url)) errors.push("signed_url");
  const path = safeDecode(url.pathname);
  if (!RASTER.has(info.contentType.toLowerCase())) errors.push("unsupported_format");
  const min = MIN[kind];
  if (info.width < min.width || info.height < min.height) errors.push("too_small");
  if (info.height > 0 && info.width / info.height < min.ratio) errors.push("logo_like_shape");
  if (info.height > 0 && info.width / info.height > min.maxRatio) errors.push("too_tall");
  if (LOGO_NAME.test(path)) errors.push("logo_like_name");
  if (isPlatformDefaultImage(url.toString())) errors.push("platform_default");
  if (isStockImage(url.toString())) errors.push("stock_image");
  const pixels = info.width * info.height;
  if (
    info.byteLength !== undefined &&
    pixels > 0 &&
    info.byteLength / pixels < MIN_BYTES_PER_PIXEL[kind]
  ) {
    errors.push("low_detail");
  }
  return errors;
}

/** Sniffs downloaded bytes (format and dimensions), then applies the rules. */
export function checkVisualReferenceBytes(
  kind: VisualReferenceKind,
  imageUrl: string,
  bytes: Uint8Array,
): { ok: true; info: ImageInfo } | { ok: false; errors: VisualReferenceRejection[] } {
  const info = sniffImage(bytes);
  if (!info) return { ok: false, errors: ["not_an_image"] };
  const errors = checkVisualReference(kind, imageUrl, { ...info, byteLength: bytes.length });
  return errors.length ? { ok: false, errors } : { ok: true, info };
}

/**
 * An image found on the official sites of two or more different products is
 * a template or a builder default, not the visual of any of them: it is
 * dropped for all (visref-2). Products are told apart by the registrable
 * domain of the page that showed the image; listings of one product from
 * several sources share that domain and do not count twice.
 */
export function dropSharedImages<
  T extends { content_hash: string; image_url: string; page_url: string },
>(references: T[], domainOf: (pageUrl: string) => string | null): { kept: T[]; dropped: number } {
  const owners = new Map<string, Set<string>>();
  const note = (key: string, owner: string) => {
    const set = owners.get(key) ?? new Set<string>();
    set.add(owner);
    owners.set(key, set);
  };
  for (const r of references) {
    const owner = domainOf(r.page_url) ?? r.page_url;
    note(`h:${r.content_hash}`, owner);
    note(`u:${r.image_url}`, owner);
  }
  const shared = (r: T) =>
    (owners.get(`h:${r.content_hash}`)?.size ?? 0) > 1 ||
    (owners.get(`u:${r.image_url}`)?.size ?? 0) > 1;
  const kept = references.filter((r) => !shared(r));
  return { kept, dropped: references.length - kept.length };
}
