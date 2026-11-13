// S8.3 contracts (ADR-016, ADR-017): operator channel claims and the visual
// asset manifest. Synthetic values only.
import { describe, expect, it } from "vitest";
import {
  OperatorChannelRecordSchema,
  ProductVisualAssetSchema,
  VisualAssetManifestSchema,
} from "../index";

const claim = {
  product_slug: "metricflow",
  channel: "Reddit",
  role: "secondary",
  status: "declared",
  evidence_kind: "official_statement",
  verified: true,
  direct_excerpt: true,
  source_url: "https://metricflow.test/blog",
  excerpt: "We grew on Reddit",
  observed_at: "2026-11-01",
};

describe("operator channel claim", () => {
  it("accepts a sourced claim", () => {
    expect(OperatorChannelRecordSchema.safeParse(claim).success).toBe(true);
  });
  it("refuses http sources, unknown statuses and extra fields", () => {
    expect(
      OperatorChannelRecordSchema.safeParse({ ...claim, source_url: "http://x.test" }).success,
    ).toBe(false);
    expect(OperatorChannelRecordSchema.safeParse({ ...claim, status: "unknown" }).success).toBe(
      false,
    );
    expect(OperatorChannelRecordSchema.safeParse({ ...claim, confidence: 99 }).success).toBe(false);
  });
});

describe("visual asset manifest", () => {
  const entry = {
    product_slug: "metricflow",
    asset_type: "official_hero",
    image_url: "https://metricflow.test/hero.png",
    page_url: "https://metricflow.test/press",
    alt_text: "Dashboard",
    rights: {
      status: "approved",
      basis: "Press kit licence",
      evidence_url: "https://metricflow.test/press/licence",
      covers_private_copy: true,
    },
  };
  it("accepts an entry with documented rights", () => {
    expect(
      VisualAssetManifestSchema.safeParse({ manifest_version: "visual-assets-1", assets: [entry] })
        .success,
    ).toBe(true);
  });
  it("refuses unknown versions, http images and missing rights", () => {
    expect(
      VisualAssetManifestSchema.safeParse({ manifest_version: "v0", assets: [entry] }).success,
    ).toBe(false);
    expect(
      VisualAssetManifestSchema.safeParse({
        manifest_version: "visual-assets-1",
        assets: [{ ...entry, image_url: "http://metricflow.test/hero.png" }],
      }).success,
    ).toBe(false);
    const noRights: Record<string, unknown> = { ...entry };
    delete noRights.rights;
    expect(
      VisualAssetManifestSchema.safeParse({
        manifest_version: "visual-assets-1",
        assets: [noRights],
      }).success,
    ).toBe(false);
  });
});

describe("Discover visual DTO", () => {
  it("only accepts the authenticated SOR delivery path, never a remote URL", () => {
    const base = {
      asset_type: "official_hero",
      alt_text: "Dashboard",
      source_url: "https://metricflow.test/press",
      observed_at: "2026-11-01T00:00:00+00:00",
      rights_basis: "Press kit licence",
      confidence: null,
      width: 1600,
      height: 700,
    };
    expect(
      ProductVisualAssetSchema.safeParse({
        ...base,
        url: "/api/v1/catalog/assets/6f1c1c1e-2a6b-4f5e-9d3a-1b2c3d4e5f60",
      }).success,
    ).toBe(true);
    expect(
      ProductVisualAssetSchema.safeParse({ ...base, url: "https://cdn.example.test/hero.png" })
        .success,
    ).toBe(false);
    expect(
      ProductVisualAssetSchema.safeParse({ ...base, url: "//cdn.example.test/hero.png" }).success,
    ).toBe(false);
  });
});

describe("Discover visual DTO, references (PD-38)", () => {
  const base = {
    alt_text: "Dashboard",
    source_url: "https://commons.wikimedia.org/wiki/File:Dashboard.png",
    observed_at: "2026-11-12T10:00:00+00:00",
    rights_basis: "CC-BY-SA-4.0, Jane Doe (Wikimedia Commons)",
    confidence: null,
    width: 1280,
    height: 720,
    delivery_mode: "external_reference",
  };
  const licensed = {
    ...base,
    asset_type: "licensed_image",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Dashboard.png/1280px-Dashboard.png",
    rights_status: "licensed",
    licence_code: "CC-BY-SA-4.0",
    licence_url: "https://creativecommons.org/licenses/by-sa/4.0",
    attribution: "Jane Doe",
  };
  it("accepts a free-licence image and a publisher share image by https reference", () => {
    expect(ProductVisualAssetSchema.safeParse(licensed).success).toBe(true);
    expect(
      ProductVisualAssetSchema.safeParse({
        ...base,
        asset_type: "publisher_share_image",
        url: "https://cdn.example.test/og.png",
        rights_status: "publisher_published",
        source_url: "https://example.test/",
      }).success,
    ).toBe(true);
  });
  it("accepts the official hero and screenshot shown on the product's site (PD-40)", () => {
    for (const asset_type of ["official_hero", "product_screenshot"]) {
      expect(
        ProductVisualAssetSchema.safeParse({
          ...base,
          asset_type,
          url: "https://cdn.example.test/hero.webp",
          rights_status: "publisher_published",
          source_url: "https://example.test/",
        }).success,
      ).toBe(true);
    }
    expect(
      ProductVisualAssetSchema.safeParse({
        ...base,
        asset_type: "official_illustration",
        url: "https://cdn.example.test/hero.webp",
        rights_status: "publisher_published",
        source_url: "https://example.test/",
      }).success,
    ).toBe(false);
  });
  it("refuses a reference that is not https, a licensed image without licence, or a mixed kind", () => {
    expect(
      ProductVisualAssetSchema.safeParse({ ...licensed, url: "http://upload.wikimedia.org/x.png" })
        .success,
    ).toBe(false);
    expect(ProductVisualAssetSchema.safeParse({ ...licensed, licence_code: null }).success).toBe(
      false,
    );
    expect(
      ProductVisualAssetSchema.safeParse({
        ...licensed,
        asset_type: "official_hero",
        rights_status: "approved",
      }).success,
    ).toBe(false);
    expect(
      ProductVisualAssetSchema.safeParse({ ...licensed, delivery_mode: "private_copy" }).success,
    ).toBe(false);
  });
});
