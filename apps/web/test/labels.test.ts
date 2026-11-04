import { describe, expect, it } from "vitest";
import { countryName, isDemoUrl, teamLabel } from "@/lib/labels";

describe("labels", () => {
  it("flags reserved demo domains only", () => {
    expect(isDemoUrl("https://metricflow.test/")).toBe(true);
    expect(isDemoUrl("https://example.com")).toBe(false);
    expect(isDemoUrl(null)).toBe(false);
  });

  it("formats team sizes and countries in French", () => {
    expect(teamLabel(3, 5)).toBe("3–5 pers.");
    expect(teamLabel(null, null)).toBeNull();
    expect(countryName("US")).toBe("États-Unis");
  });
});
