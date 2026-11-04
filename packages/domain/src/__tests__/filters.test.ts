import { describe, expect, it } from "vitest";
import { CatalogFiltersSchema } from "@sor/contracts";
import { UnsupportedFilterError, assertSupportedQuery, buildCatalogPlan } from "../filters";

const plan = (input: unknown) =>
  buildCatalogPlan(CatalogFiltersSchema.parse(input), { currentYear: 2026 });

describe("buildCatalogPlan", () => {
  it("an empty filter set only carries the defaults", () => {
    expect(plan({})).toEqual({
      configurable_exclusions: [],
      include_hidden: false,
      current_year: 2026,
    });
  });

  it("maps team presets and a custom range to ranges (OR inside the group)", () => {
    expect(
      plan({ team_size: { presets: ["1-5", "100+"], custom: { min: 7, max: 9 } } }).team,
    ).toEqual({
      ranges: [
        { min: 1, max: 5 },
        { min: 100, max: null },
        { min: 7, max: 9 },
      ],
      include_unknown: false,
    });
  });

  it("maps age buckets to founding-year ranges", () => {
    expect(plan({ age: { buckets: ["lt_1", "2_5", "gt_10"] } }).founded?.ranges).toEqual([
      { min: 2026, max: 2026 },
      { min: 2021, max: 2023 },
      { min: null, max: 2015 },
    ]);
  });

  it("maps price bands, free and custom", () => {
    expect(plan({ price_bands: { values: ["free", "10_30", "gt_500", "custom"] } }).price).toEqual({
      ranges: [
        { min: 10, max: 30 },
        { min: 500, max: null },
      ],
      free: true,
      custom: true,
      include_unknown: false,
    });
  });

  it("keeps 'unknown only' groups and drops empty ones", () => {
    const p = plan({
      customer_types: { values: [], include_unknown: true },
      hq_countries: { values: [] },
    });
    expect(p.customer_types).toEqual({ values: [], include_unknown: true });
    expect(p.hq_countries).toBeUndefined();
  });

  it("trims text and deduplicates values", () => {
    const p = plan({ text: "  crm  ", billing_models: { values: ["per_user", "per_user"] } });
    expect(p.text).toBe("crm");
    expect(p.billing_models?.values).toEqual(["per_user"]);
  });
});

describe("assertSupportedQuery", () => {
  it("rejects Phase 2 filter groups instead of ignoring them", () => {
    const f = CatalogFiltersSchema.parse({ maturity: { values: ["new"] }, complaints: ["ux"] });
    expect(() => assertSupportedQuery(f, "relevance")).toThrow(UnsupportedFilterError);
  });

  it("rejects sort keys that need analyses (Sprint 5)", () => {
    expect(() => assertSupportedQuery(CatalogFiltersSchema.parse({}), "ai_potential")).toThrow(
      /sort:ai_potential/,
    );
  });

  it("accepts the MVP groups", () => {
    const f = CatalogFiltersSchema.parse({
      customer_types: { values: ["b2b"] },
      company_profile: { values: ["indie_saas"] },
      configurable_exclusions: ["b2c_only"],
    });
    expect(() => assertSupportedQuery(f, "newest")).not.toThrow();
  });
});
