import { describe, expect, it } from "vitest";
import { confidenceLabel, countryName, formatDateTime, isDemoUrl, teamLabel } from "@/lib/labels";

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

  // Regression (audit 11 Nov 2026): an unknown confidence rendered "confiance inconnue%".
  it("shows a confidence percentage only when the confidence is known", () => {
    expect(confidenceLabel(80)).toBe("confiance 80%");
    expect(confidenceLabel(0)).toBe("confiance 0%");
    expect(confidenceLabel(null)).toBe("confiance inconnue");
    expect(confidenceLabel(undefined)).toBe("confiance inconnue");
    expect(confidenceLabel(null)).not.toContain("%");
  });

  it("formats quota reset times in UTC", () => {
    expect(formatDateTime("2026-11-07T00:00:00+00:00")).toBe("07/11/2026 00:00 UTC");
  });
});
