import { describe, expect, it } from "vitest";
import { CatalogFiltersSchema, ResearchPreferencesSchema } from "@sor/contracts";
import { activeChips, filtersFromPreferences } from "@/components/discover/filter-model";

const parse = (v: unknown) => CatalogFiltersSchema.parse(v);

describe("active filter chips", () => {
  it("removes one condition without resetting the others (PRD §4.3)", () => {
    const f = parse({
      customer_types: { values: ["b2b", "b2c"] },
      hq_countries: { values: ["US"], include_unknown: true },
      configurable_exclusions: ["b2c_only"],
    });
    const chips = activeChips(f, (s) => s);
    expect(chips.map((c) => c.key)).toEqual([
      "ct:b2b",
      "ct:b2c",
      "hq:US",
      "hq:unknown",
      "ex:b2c_only",
    ]);
    const after = chips.find((c) => c.key === "ct:b2c")!.remove(f);
    expect(after.customer_types?.values).toEqual(["b2b"]);
    expect(after.hq_countries).toEqual(f.hq_countries);
    expect(after.configurable_exclusions).toEqual(["b2c_only"]);
  });
});

describe("research preferences as filters", () => {
  it("maps the PRD §21 defaults and keeps unknown values visible", () => {
    const f = filtersFromPreferences(ResearchPreferencesSchema.parse({}), parse({}));
    expect(f.customer_types).toEqual({ values: ["b2b"], include_unknown: true });
    expect(f.hq_countries).toEqual({ values: ["US"], include_unknown: true });
    expect(f.team_size).toEqual({ presets: ["1-20"], include_unknown: true });
    expect(CatalogFiltersSchema.safeParse(f).success).toBe(true);
  });
});
