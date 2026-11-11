// Admission rules of product visuals (ADR-016, PD-36). Deterministic checks on
// the bytes actually received and on the documented rights; no I/O here.

export const VISUAL_ASSET_RULES_VERSION = "visual-1";
export const VISUAL_ASSET_TYPES = [
  "official_hero",
  "product_screenshot",
  "official_illustration",
] as const;
export type VisualAssetType = (typeof VISUAL_ASSET_TYPES)[number];

/** Raster formats only: SVG can carry scripts and is refused. */
export const VISUAL_ASSET_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type VisualAssetContentType = (typeof VISUAL_ASSET_CONTENT_TYPES)[number];
export const VISUAL_ASSET_MAX_BYTES = 2 * 1024 * 1024;

export interface ImageInfo {
  contentType: VisualAssetContentType;
  width: number;
  height: number;
}

function u16be(b: Uint8Array, i: number): number {
  return (b[i]! << 8) | b[i + 1]!;
}
function u32be(b: Uint8Array, i: number): number {
  return ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
}
function u24le(b: Uint8Array, i: number): number {
  return b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
}

/**
 * Format and dimensions read from the magic bytes and headers, whatever the
 * server declared. Returns null for anything that is not a well-formed PNG,
 * JPEG or WebP image.
 */
export function sniffImage(bytes: Uint8Array): ImageInfo | null {
  const b = bytes;
  // PNG: signature + IHDR first.
  if (
    b.length >= 24 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a &&
    String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!) === "IHDR"
  ) {
    return { contentType: "image/png", width: u32be(b, 16), height: u32be(b, 20) };
  }
  // JPEG: SOI, then walk the segments to the first start-of-frame marker.
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1]!;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const length = u16be(b, i + 2);
      if (length < 2) return null;
      const isSof =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        return { contentType: "image/jpeg", height: u16be(b, i + 5), width: u16be(b, i + 7) };
      }
      i += 2 + length;
    }
    return null;
  }
  // WebP: RIFF....WEBP + VP8 / VP8L / VP8X chunk.
  if (
    b.length >= 30 &&
    String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!) === "RIFF" &&
    String.fromCharCode(b[8]!, b[9]!, b[10]!, b[11]!) === "WEBP"
  ) {
    const chunk = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
    if (chunk === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
      return {
        contentType: "image/webp",
        width: (b[26]! | (b[27]! << 8)) & 0x3fff,
        height: (b[28]! | (b[29]! << 8)) & 0x3fff,
      };
    }
    if (chunk === "VP8L" && b[20] === 0x2f) {
      const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
      return {
        contentType: "image/webp",
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      };
    }
    if (chunk === "VP8X") {
      return { contentType: "image/webp", width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
    }
  }
  return null;
}

export type VisualAssetRejection =
  | "rights_not_approved"
  | "rights_do_not_cover_private_copy"
  | "missing_rights_basis"
  | "missing_rights_evidence"
  | "not_an_image"
  | "unsupported_format"
  | "declared_type_mismatch"
  | "too_large"
  | "too_small"
  | "logo_like_shape";

export interface VisualAssetCandidate {
  assetType: VisualAssetType;
  rights: {
    status: "approved" | "unknown" | "restricted" | "removed";
    basis: string;
    evidenceUrl: string | null;
    /** The documented rights explicitly allow copying and private storage. */
    coversPrivateCopy: boolean;
  };
}

/**
 * Rights gate, checked BEFORE any network request: nothing is downloaded or
 * stored unless the documented rights cover a private copy (ADR-016 §3).
 * Remote embedding (hotlinking) is not implemented and never used instead.
 */
export function checkVisualAssetRights(c: VisualAssetCandidate): VisualAssetRejection[] {
  const errors: VisualAssetRejection[] = [];
  if (c.rights.status !== "approved") errors.push("rights_not_approved");
  if (!c.rights.coversPrivateCopy) errors.push("rights_do_not_cover_private_copy");
  if (!c.rights.basis.trim()) errors.push("missing_rights_basis");
  if (!c.rights.evidenceUrl || !/^https:\/\//i.test(c.rights.evidenceUrl)) {
    errors.push("missing_rights_evidence");
  }
  return errors;
}

/** Minimum sizes: a Hero or screenshot is a wide, detailed image, never a logo. */
const MIN: Record<VisualAssetType, { width: number; height: number; ratio: number }> = {
  official_hero: { width: 600, height: 200, ratio: 1.2 },
  product_screenshot: { width: 600, height: 200, ratio: 1.0 },
  official_illustration: { width: 400, height: 200, ratio: 1.0 },
};

/** Checks on the downloaded bytes (format sniffed, size, dimensions, shape). */
export function checkVisualAssetBytes(
  assetType: VisualAssetType,
  bytes: Uint8Array,
  declaredContentType: string | null,
): { ok: true; info: ImageInfo } | { ok: false; errors: VisualAssetRejection[] } {
  if (bytes.byteLength > VISUAL_ASSET_MAX_BYTES) return { ok: false, errors: ["too_large"] };
  const info = sniffImage(bytes);
  if (!info) return { ok: false, errors: ["not_an_image"] };
  const errors: VisualAssetRejection[] = [];
  const declared = (declaredContentType ?? "").split(";")[0]!.trim().toLowerCase();
  if (
    declared &&
    declared !== info.contentType &&
    !(declared === "image/jpg" && info.contentType === "image/jpeg")
  ) {
    errors.push("declared_type_mismatch");
  }
  const min = MIN[assetType];
  if (info.width < min.width || info.height < min.height) errors.push("too_small");
  if (info.width / info.height < min.ratio) errors.push("logo_like_shape");
  return errors.length ? { ok: false, errors } : { ok: true, info };
}
