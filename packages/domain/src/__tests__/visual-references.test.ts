import { describe, expect, it } from "vitest";
import {
  attributionRequired,
  checkVisualReference,
  checkVisualReferenceBytes,
  dropSharedImages,
  isOnProductDomain,
  isPlatformDefaultImage,
  isStockImage,
  VISUAL_REFERENCE_RANK,
  normalizeFreeLicence,
  plainAttribution,
} from "../discover/visual-references";

/** Synthetic PNG header with the given dimensions (test fixture, not an image of a product). */
function png(width: number, height: number, bytesPerPixel = 0.05): Uint8Array {
  const b = new Uint8Array(Math.max(33, Math.ceil(width * height * bytesPerPixel)));
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

describe("normalizeFreeLicence", () => {
  it.each([
    ["CC BY-SA 4.0", "CC-BY-SA-4.0"],
    ["CC BY 3.0", "CC-BY-3.0"],
    ["CC BY-SA 3.0 de", "CC-BY-SA-3.0"],
    ["CC BY 2.5", "CC-BY-2.5"],
    ["CC0", "CC0-1.0"],
    ["Public domain", "Public-Domain"],
    ["PD-self", "Public-Domain"],
  ])("accepts %s", (input, code) => {
    expect(normalizeFreeLicence(input)).toBe(code);
  });

  it.each([
    "CC BY-NC 4.0",
    "CC BY-ND 4.0",
    "CC BY-NC-SA 3.0",
    "GFDL",
    "Fair use",
    "",
    null,
    "Copyrighted",
  ])("refuses %s", (input) => {
    expect(normalizeFreeLicence(input)).toBeNull();
  });

  it("knows which licences require attribution", () => {
    expect(attributionRequired("CC-BY-SA-4.0")).toBe(true);
    expect(attributionRequired("CC-BY-3.0")).toBe(true);
    expect(attributionRequired("CC0-1.0")).toBe(false);
    expect(attributionRequired("Public-Domain")).toBe(false);
  });
});

describe("plainAttribution", () => {
  it("turns Commons' HTML credit into plain text", () => {
    expect(
      plainAttribution('<a href="//commons.wikimedia.org/wiki/User:Jane">Jane &amp; Co</a>'),
    ).toBe("Jane & Co");
    expect(plainAttribution("<span></span>")).toBeNull();
    expect(plainAttribution(null)).toBeNull();
  });
});

describe("isOnProductDomain", () => {
  it("accepts the product's domain and its subdomains over https only", () => {
    expect(isOnProductDomain("https://example.com/", "example.com")).toBe(true);
    expect(isOnProductDomain("https://www.example.com/pricing", "example.com")).toBe(true);
    expect(isOnProductDomain("http://example.com/", "example.com")).toBe(false);
    expect(isOnProductDomain("https://notexample.com/", "example.com")).toBe(false);
    expect(isOnProductDomain("https://example.com.evil.test/", "example.com")).toBe(false);
    expect(isOnProductDomain("https://example.com/", null)).toBe(false);
  });
});

describe("checkVisualReference", () => {
  it("accepts a wide share image", () => {
    expect(
      checkVisualReference("publisher", "https://cdn.example.com/og/home.png", {
        contentType: "image/png",
        width: 1200,
        height: 630,
      }),
    ).toEqual([]);
  });

  it("refuses logos, icons, small or square images and non-raster formats", () => {
    expect(
      checkVisualReference("publisher", "https://example.com/static/logo-dark.png", {
        contentType: "image/png",
        width: 1200,
        height: 630,
      }),
    ).toEqual(["logo_like_name"]);
    expect(
      checkVisualReference("publisher", "https://example.com/og.png", {
        contentType: "image/png",
        width: 512,
        height: 512,
      }),
    ).toEqual(["too_small", "logo_like_shape"]);
    expect(
      checkVisualReference("licensed", "https://upload.wikimedia.org/x/Screenshot.svg", {
        contentType: "image/svg+xml",
        width: 1200,
        height: 800,
      }),
    ).toEqual(["unsupported_format"]);
    expect(
      checkVisualReference("publisher", "http://example.com/og.png", {
        contentType: "image/png",
        width: 1200,
        height: 630,
      }),
    ).toEqual(["not_https"]);
  });

  it("refuses signed or token-bearing URLs (they expire and carry credentials)", () => {
    const wide = { contentType: "image/png", width: 1200, height: 630 };
    for (const url of [
      "https://firebasestorage.googleapis.com/v0/b/x/o/og.png?alt=media&token=abc",
      "https://bucket.s3.amazonaws.com/og.png?X-Amz-Credential=AKIA&X-Amz-Signature=f00",
      "https://storage.googleapis.com/b/og.png?X-Goog-Signature=f00",
      "https://cdn.example.com/og.png?sig=abc&se=2026-11-12",
    ]) {
      expect(checkVisualReference("publisher", url, wide)).toContain("signed_url");
    }
    expect(
      checkVisualReference("publisher", "https://cdn.example.com/og.png?v=3&w=1200", wide),
    ).toEqual([]);
  });

  it("reads the real format and size from the bytes", () => {
    expect(
      checkVisualReferenceBytes("publisher", "https://example.com/og.png", png(1200, 630)),
    ).toEqual({
      ok: true,
      info: { contentType: "image/png", width: 1200, height: 630 },
    });
    expect(
      checkVisualReferenceBytes("publisher", "https://example.com/og.png", png(64, 64)),
    ).toEqual({
      ok: false,
      errors: ["too_small", "logo_like_shape"],
    });
    expect(
      checkVisualReferenceBytes(
        "publisher",
        "https://example.com/og.png",
        new TextEncoder().encode("<html>"),
      ),
    ).toEqual({ ok: false, errors: ["not_an_image"] });
  });
});

describe("visref-2: site images, generic and low-detail images", () => {
  const wide = { contentType: "image/png", width: 1600, height: 900 };

  it("ranks the product's own hero, then its screenshot, above share images", () => {
    expect(VISUAL_REFERENCE_RANK.site_hero).toBeGreaterThan(VISUAL_REFERENCE_RANK.site_screenshot);
    expect(VISUAL_REFERENCE_RANK.site_screenshot).toBeGreaterThan(VISUAL_REFERENCE_RANK.licensed);
    expect(VISUAL_REFERENCE_RANK.licensed).toBeGreaterThan(VISUAL_REFERENCE_RANK.publisher);
  });

  it("asks more of site images: size and shape", () => {
    expect(checkVisualReference("site_hero", "https://example.com/hero.png", wide)).toEqual([]);
    expect(
      checkVisualReference("site_hero", "https://example.com/hero.png", {
        ...wide,
        width: 900,
        height: 500,
      }),
    ).toEqual(["too_small"]);
    expect(
      checkVisualReference("site_screenshot", "https://example.com/app.png", {
        ...wide,
        width: 3000,
        height: 600,
      }),
    ).toEqual(["too_tall"]);
    expect(
      checkVisualReference("site_screenshot", "https://example.com/app.png", {
        ...wide,
        width: 1000,
        height: 1000,
      }),
    ).toEqual(["logo_like_shape"]);
  });

  it("refuses platform defaults, app-store icon cards and stock photos", () => {
    for (const url of [
      "https://lovable.dev/opengraph-image-p98pqg.png",
      "https://assets.softr-files.com/assets/images/random/og_default_image.png",
      "https://ssl.gstatic.com/chrome/webstore/images/chrome_web_store_v2_1200x630.png",
      "https://is1-ssl.mzstatic.com/image/thumb/Purple/v4/placeholder.mill/1200x630wa.jpg",
    ]) {
      expect(isPlatformDefaultImage(url)).toBe(true);
      expect(checkVisualReference("publisher", url, wide)).toContain("platform_default");
    }
    // A site's own branded default stays acceptable.
    expect(isPlatformDefaultImage("https://acme.io/og-default.png")).toBe(false);
    expect(isStockImage("https://images.unsplash.com/photo-123?w=1600")).toBe(true);
    expect(isStockImage("https://acme.io/hero.jpg")).toBe(false);
    expect(
      checkVisualReference("site_hero", "https://images.pexels.com/photos/1/a.jpeg", wide),
    ).toEqual(["stock_image"]);
  });

  it("refuses near-blank images (too few bytes for their size)", () => {
    expect(
      checkVisualReferenceBytes("site_screenshot", "https://acme.io/app.png", png(1600, 900, 0.01)),
    ).toEqual({ ok: false, errors: ["low_detail"] });
    expect(
      checkVisualReferenceBytes("site_screenshot", "https://acme.io/app.png", png(1600, 900, 0.2)),
    ).toMatchObject({ ok: true });
    expect(
      checkVisualReferenceBytes("publisher", "https://acme.io/og.png", png(1200, 630, 0.005)),
    ).toEqual({ ok: false, errors: ["low_detail"] });
  });

  it("drops an image shown by two different products, keeps one product's listings", () => {
    const ref = (hash: string, page: string, url = `https://cdn.test/${hash}.png`) => ({
      content_hash: hash,
      image_url: url,
      page_url: page,
    });
    const domain = (u: string) => new URL(u).hostname.replace(/^www\./, "");
    const { kept, dropped } = dropSharedImages(
      [
        ref("aaaa", "https://alpha.io/"),
        ref("aaaa", "https://beta.io/"), // template shared by two products
        ref("bbbb", "https://gamma.io/"),
        ref("bbbb", "https://www.gamma.io/"), // same product from two sources
        ref("cccc", "https://delta.io/", "https://cdn.test/same.png"),
        ref("dddd", "https://epsilon.io/", "https://cdn.test/same.png"),
      ],
      domain,
    );
    expect(kept.map((r) => r.page_url)).toEqual(["https://gamma.io/", "https://www.gamma.io/"]);
    expect(dropped).toBe(4);
  });
});
