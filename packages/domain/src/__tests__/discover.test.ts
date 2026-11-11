// S8.3 (ADR-016, ADR-017): channel registry, channel confidence and visual
// asset admission rules. Synthetic inputs only.
import { describe, expect, it } from "vitest";
import {
  ACQUISITION_CHANNELS,
  ACQUISITION_CHANNEL_CATEGORIES,
  checkVisualAssetBytes,
  checkVisualAssetRights,
  channelConfidence,
  channelDefinition,
  normalizeChannelKey,
  sniffImage,
  validateChannelClaim,
  type ChannelClaimInput,
} from "../index";

describe("acquisition channel registry", () => {
  it("normalizes spellings, accents and synonyms to one canonical key", () => {
    expect(normalizeChannelKey("Twitter")).toBe("x");
    expect(normalizeChannelKey("X.com")).toBe("x");
    expect(normalizeChannelKey("  Search Engine Optimization ")).toBe("seo");
    expect(normalizeChannelKey("Référencement naturel")).toBe("seo");
    expect(normalizeChannelKey("Google Ads")).toBe("paid_advertising");
    expect(normalizeChannelKey("ProductHunt")).toBe("product_hunt");
    expect(normalizeChannelKey("product_hunt")).toBe("product_hunt");
    expect(normalizeChannelKey("Show HN")).toBe("hacker_news");
    expect(normalizeChannelKey("bouche-à-oreille")).toBe("referral");
  });

  it("refuses free text instead of inventing a key", () => {
    expect(normalizeChannelKey("")).toBeNull();
    expect(normalizeChannelKey("magic growth hack")).toBeNull();
    expect(normalizeChannelKey("unknown")).toBeNull();
  });

  it("keeps platform and paid placements apart (Facebook vs Facebook Ads)", () => {
    expect(normalizeChannelKey("Facebook")).toBe("facebook");
    expect(normalizeChannelKey("Facebook Ads")).toBe("paid_advertising");
    expect(channelDefinition("facebook")?.category).toBe("social");
    expect(channelDefinition("paid_advertising")?.category).toBe("paid");
  });

  it("maps every key to one of the eight stable categories, never unknown", () => {
    expect(ACQUISITION_CHANNEL_CATEGORIES).toHaveLength(8);
    const keys = new Set<string>();
    for (const c of ACQUISITION_CHANNELS) {
      expect(c.key).toMatch(/^[a-z][a-z0-9_]{0,59}$/);
      expect(c.key).not.toBe("unknown");
      expect(ACQUISITION_CHANNEL_CATEGORIES).toContain(c.category);
      expect(c.category).not.toBe("unknown");
      expect(keys.has(c.key)).toBe(false);
      keys.add(c.key);
      expect(normalizeChannelKey(c.key)).toBe(c.key);
      expect(normalizeChannelKey(c.label)).toBe(c.key);
      for (const alias of c.aliases) expect(normalizeChannelKey(alias)).toBe(c.key);
    }
  });
});

const now = new Date("2026-11-11T12:00:00Z");
const claim = (over: Partial<ChannelClaimInput> = {}): ChannelClaimInput => ({
  status: "declared",
  evidenceKind: "official_statement",
  role: "secondary",
  verified: true,
  directExcerpt: true,
  primacyExcerpt: null,
  rationale: null,
  observedAt: new Date("2026-10-01T00:00:00Z"),
  now,
  ...over,
});

describe("channel claim rules and confidence (chanconf-1)", () => {
  it("scores a verified official declaration with its reasons", () => {
    const c = channelConfidence(claim());
    expect(c).toMatchObject({ method: "chanconf-1", score: 70 });
    expect(c.reasons).toHaveLength(3);
  });

  it("gives confirmed independent evidence more confidence than a declaration", () => {
    const confirmed = channelConfidence(
      claim({ status: "confirmed", evidenceKind: "third_party_report" }),
    );
    expect(confirmed.score).toBe(90);
    expect(confirmed.score).toBeGreaterThan(channelConfidence(claim()).score);
  });

  it("keeps an estimate low and explained", () => {
    const c = channelConfidence(
      claim({
        status: "estimated",
        evidenceKind: "inference",
        directExcerpt: false,
        verified: false,
        rationale: "Plusieurs posts LinkedIn du fondateur renvoient vers l’essai gratuit",
      }),
    );
    expect(c.score).toBe(30);
  });

  it("lowers stale evidence and never goes below zero", () => {
    expect(channelConfidence(claim({ observedAt: new Date("2025-06-01T00:00:00Z") })).score).toBe(
      60,
    );
    expect(channelConfidence(claim({ observedAt: new Date("2023-01-01T00:00:00Z") })).score).toBe(
      50,
    );
  });

  it("refuses a confirmed channel without verified direct evidence", () => {
    expect(validateChannelClaim(claim({ status: "confirmed", verified: false }))).toContain(
      "confirmed_requires_verified_source",
    );
    expect(validateChannelClaim(claim({ status: "confirmed", directExcerpt: false }))).toContain(
      "confirmed_requires_direct_excerpt",
    );
    expect(() => channelConfidence(claim({ status: "confirmed", verified: false }))).toThrow();
  });

  it("refuses an estimate without rationale and a declaration made of inference", () => {
    expect(
      validateChannelClaim(
        claim({ status: "estimated", evidenceKind: "inference", rationale: " " }),
      ),
    ).toEqual(["estimated_requires_rationale"]);
    expect(validateChannelClaim(claim({ evidenceKind: "inference" }))).toEqual([
      "declared_cannot_be_inference",
    ]);
  });

  it("allows a primary channel only with a primacy excerpt (ambiguous case refused)", () => {
    expect(validateChannelClaim(claim({ role: "primary" }))).toEqual([
      "primary_requires_primacy_evidence",
    ]);
    expect(
      validateChannelClaim(
        claim({ role: "primary", primacyExcerpt: "« Most of our customers find us on Reddit »" }),
      ),
    ).toEqual([]);
  });

  it("refuses an observation dated in the future", () => {
    expect(validateChannelClaim(claim({ observedAt: new Date("2027-01-01T00:00:00Z") }))).toEqual([
      "observed_in_future",
    ]);
  });
});

// Synthetic image headers (test data, not real product visuals).
function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}
function jpeg(width: number, height: number): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00];
  const sof = [
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    3,
  ];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, ...new Array(12).fill(0)]);
}
function webpVp8x(width: number, height: number): Uint8Array {
  const b = new Uint8Array(30);
  b.set([...Buffer.from("RIFF"), 22, 0, 0, 0, ...Buffer.from("WEBPVP8X"), 10, 0, 0, 0]);
  const w = width - 1;
  const h = height - 1;
  b.set(
    [w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff],
    24,
  );
  return b;
}

describe("visual asset admission (visual-1)", () => {
  it("reads the real format and size from the bytes", () => {
    expect(sniffImage(png(1600, 700))).toEqual({
      contentType: "image/png",
      width: 1600,
      height: 700,
    });
    expect(sniffImage(jpeg(1200, 630))).toEqual({
      contentType: "image/jpeg",
      width: 1200,
      height: 630,
    });
    expect(sniffImage(webpVp8x(1280, 560))).toEqual({
      contentType: "image/webp",
      width: 1280,
      height: 560,
    });
    expect(
      sniffImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")),
    ).toBeNull();
    expect(sniffImage(new TextEncoder().encode("<html>not an image</html>"))).toBeNull();
  });

  it("accepts a wide official Hero with matching content type", () => {
    const r = checkVisualAssetBytes("official_hero", png(1600, 700), "image/png");
    expect(r.ok).toBe(true);
  });

  it("refuses non-images, mismatched types, logos and tiny images", () => {
    expect(checkVisualAssetBytes("official_hero", new Uint8Array(40), "image/png")).toEqual({
      ok: false,
      errors: ["not_an_image"],
    });
    expect(checkVisualAssetBytes("official_hero", png(1600, 700), "image/jpeg")).toEqual({
      ok: false,
      errors: ["declared_type_mismatch"],
    });
    expect(checkVisualAssetBytes("official_hero", png(512, 512), "image/png")).toEqual({
      ok: false,
      errors: ["too_small", "logo_like_shape"],
    });
    expect(checkVisualAssetBytes("official_hero", png(800, 800), "image/png")).toEqual({
      ok: false,
      errors: ["logo_like_shape"],
    });
  });

  it("refuses oversized content", () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(png(1600, 700));
    expect(checkVisualAssetBytes("official_hero", big, "image/png")).toEqual({
      ok: false,
      errors: ["too_large"],
    });
  });

  it("downloads nothing unless the documented rights cover a private copy", () => {
    const rights = {
      status: "approved" as const,
      basis: "Kit presse : réutilisation autorisée avec attribution",
      evidenceUrl: "https://example.test/press",
      coversPrivateCopy: true,
    };
    expect(checkVisualAssetRights({ assetType: "official_hero", rights })).toEqual([]);
    expect(
      checkVisualAssetRights({
        assetType: "official_hero",
        rights: { ...rights, status: "unknown" },
      }),
    ).toEqual(["rights_not_approved"]);
    expect(
      checkVisualAssetRights({
        assetType: "official_hero",
        rights: { ...rights, coversPrivateCopy: false },
      }),
    ).toEqual(["rights_do_not_cover_private_copy"]);
    expect(
      checkVisualAssetRights({
        assetType: "official_hero",
        rights: { ...rights, status: "restricted", basis: " ", evidenceUrl: null },
      }),
    ).toEqual(["rights_not_approved", "missing_rights_basis", "missing_rights_evidence"]);
  });
});
