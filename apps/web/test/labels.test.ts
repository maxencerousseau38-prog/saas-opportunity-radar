import { describe, expect, it } from "vitest";
import { countryName, formatDateTime, isDemoUrl, teamLabel } from "@/lib/labels";

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

  it("formats quota reset times in UTC", () => {
    expect(formatDateTime("2026-11-07T00:00:00+00:00")).toBe("07/11/2026 00:00 UTC");
  });
});
