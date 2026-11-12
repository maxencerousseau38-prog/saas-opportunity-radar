// Visual references (PD-38, amendment of ADR-016). Deterministic rules for the
// two automatic kinds of product visuals, displayed by reference (no copy):
// free-licence images from Wikimedia Commons and the share image a publisher
// declares on its own official site. No I/O here.
import { sniffImage, type ImageInfo } from "./visual-assets";

export const VISUAL_REFERENCE_RULES_VERSION = "visref-1";
export const VISUAL_REFERENCE_KINDS = ["licensed", "publisher"] as const;
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

export type VisualReferenceRejection =
  | "not_https"
  | "not_an_image"
  | "unsupported_format"
  | "too_small"
  | "logo_like_shape"
  | "logo_like_name";

/** Minimum size and shape: a card visual is a wide image, never a logo or an icon. */
const MIN: Record<VisualReferenceKind, { width: number; height: number; ratio: number }> = {
  licensed: { width: 500, height: 280, ratio: 1.0 },
  publisher: { width: 600, height: 300, ratio: 1.2 },
};
const LOGO_NAME = /(^|[/_.-])(logo|logos|favicon|icon|icons|avatar|apple-touch)([/_.-]|\d|$)/i;
const RASTER = new Set(["image/png", "image/jpeg", "image/webp"]);

function safeDecode(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** Checks a candidate from its URL, format and dimensions (declared or sniffed). */
export function checkVisualReference(
  kind: VisualReferenceKind,
  imageUrl: string,
  info: { contentType: string; width: number; height: number },
): VisualReferenceRejection[] {
  const errors: VisualReferenceRejection[] = [];
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    return ["not_https"];
  }
  if (url.protocol !== "https:") errors.push("not_https");
  const path = safeDecode(url.pathname);
  if (!RASTER.has(info.contentType.toLowerCase())) errors.push("unsupported_format");
  const min = MIN[kind];
  if (info.width < min.width || info.height < min.height) errors.push("too_small");
  if (info.height > 0 && info.width / info.height < min.ratio) errors.push("logo_like_shape");
  if (LOGO_NAME.test(path)) errors.push("logo_like_name");
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
  const errors = checkVisualReference(kind, imageUrl, info);
  return errors.length ? { ok: false, errors } : { ok: true, info };
}
