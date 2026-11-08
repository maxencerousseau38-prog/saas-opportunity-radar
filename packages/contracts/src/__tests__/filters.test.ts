import { describe, expect, it } from "vitest";
import { CatalogFiltersSchema, CatalogQuerySchema } from "../filters";
import {
  ResearchPreferencesSchema,
  SavedSearchSchema,
  ProductStatePatchSchema,
} from "../workspace";
import { ManualProductEntrySchema } from "../catalog";

describe("CatalogQuerySchema", () => {
  it("fills defaults from an empty body", () => {
    const q = CatalogQuerySchema.parse({});
    expect(q.sort).toBe("relevance");
    expect(q.limit).toBe(30);
    expect(q.filters.include_hidden).toBe(false);
    expect(q.filters.configurable_exclusions).toEqual([]);
  });

  it("rejects unknown keys, so a permanent exclusion cannot be expressed", () => {
    expect(() => CatalogFiltersSchema.parse({ permanent_exclusions: [] })).toThrow();
    expect(() => CatalogFiltersSchema.parse({ include_excluded: true })).toThrow();
    expect(() =>
      CatalogFiltersSchema.parse({ configurable_exclusions: ["affiliate_partner"] }),
    ).toThrow();
  });

  it("rejects inverted ranges and out-of-range limits", () => {
    expect(() =>
      CatalogFiltersSchema.parse({ team_size: { custom: { min: 10, max: 2 } } }),
    ).toThrow();
    expect(() => CatalogQuerySchema.parse({ limit: 101 })).toThrow();
  });

  it("does not accept 'unknown' as a customer type value (unknown is a toggle)", () => {
    expect(() => CatalogFiltersSchema.parse({ customer_types: { values: ["unknown"] } })).toThrow();
    const f = CatalogFiltersSchema.parse({ customer_types: { values: ["b2b"] } });
    expect(f.customer_types?.include_unknown).toBe(false);
  });

  it("normalises country codes to upper case", () => {
    const f = CatalogFiltersSchema.parse({ hq_countries: { values: ["us", "Fr"] } });
    expect(f.hq_countries?.values).toEqual(["US", "FR"]);
  });

  it("accepts sourced acquisition channel filters and unknowns explicitly", () => {
    const f = CatalogFiltersSchema.parse({
      acquisition_channels: {
        values: ["x", "seo"],
        statuses: ["confirmed", "declared"],
        include_unknown: true,
      },
    });
    expect(f.acquisition_channels).toEqual({
      values: ["x", "seo"],
      statuses: ["confirmed", "declared"],
      include_unknown: true,
    });
    expect(() =>
      CatalogFiltersSchema.parse({ acquisition_channels: { values: ["Product Hunt"] } }),
    ).toThrow();
    expect(() =>
      CatalogFiltersSchema.parse({ acquisition_channels: { values: ["unknown"] } }),
    ).toThrow();
  });
});

describe("workspace schemas", () => {
  it("defaults research preferences to the PRD §21 profile", () => {
    const p = ResearchPreferencesSchema.parse({});
    expect(p.priority_countries).toEqual(["US"]);
    expect(p.team_size_max).toBe(20);
    expect(p.customer_types).toEqual(["b2b"]);
    expect(p.stricter_build_thresholds).toEqual({ min_score: 75, min_wtp: 10 });
  });

  it("only allows stricter BUILD thresholds (PD-23 A)", () => {
    expect(() =>
      ResearchPreferencesSchema.parse({ stricter_build_thresholds: { min_score: 70 } }),
    ).toThrow();
    expect(() =>
      ResearchPreferencesSchema.parse({ stricter_build_thresholds: { min_wtp: 9 } }),
    ).toThrow();
  });

  it("saved searches carry a full filter object", () => {
    const s = SavedSearchSchema.parse({
      name: "US indie",
      filters: {
        acquisition_channels: {
          values: ["product_hunt", "x"],
          statuses: ["confirmed"],
          include_unknown: true,
        },
      },
    });
    expect(s.kind).toBe("catalog");
    expect(s.filters.include_hidden).toBe(false);
    expect(s.filters.acquisition_channels?.values).toEqual(["product_hunt", "x"]);
  });

  it("rejects an empty product-state patch", () => {
    expect(() => ProductStatePatchSchema.parse({})).toThrow();
  });

  it("manual entries require an http(s) URL", () => {
    expect(() =>
      ManualProductEntrySchema.parse({ name: "X", website_url: "javascript:alert(1)" }),
    ).toThrow();
    expect(
      ManualProductEntrySchema.parse({ name: " X ", website_url: "https://x.test" }).name,
    ).toBe("X");
  });
});
