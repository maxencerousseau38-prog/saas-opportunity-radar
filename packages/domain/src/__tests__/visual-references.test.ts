import { describe, expect, it } from "vitest";
import {
  attributionRequired,
  checkVisualReference,
  checkVisualReferenceBytes,
  isOnProductDomain,
  normalizeFreeLicence,
  plainAttribution,
} from "../discover/visual-references";

/** Synthetic PNG header with the given dimensions (test fixture, not an image of a product). */
function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
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
