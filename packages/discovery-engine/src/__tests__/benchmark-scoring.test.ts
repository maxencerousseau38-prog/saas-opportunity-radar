// Annotation matchers of the PD-24a scorer: short needles are whole words.
import { describe, expect, it } from "vitest";
import { matchesNeedle } from "../evals/benchmark";

describe("annotation matchers", () => {
  it("matches short needles only as whole words", () => {
    expect(matchesNeedle("Email campaigns", "ai")).toBe(false);
    expect(matchesNeedle("AI writing assistant", "ai")).toBe(true);
    expect(matchesNeedle("Rapid setup", "api")).toBe(false);
    expect(matchesNeedle("REST API access", "api")).toBe(true);
    expect(matchesNeedle("Xero sync", "x")).toBe(false);
    expect(matchesNeedle("X (Twitter)", "x")).toBe(true);
    expect(matchesNeedle("Navigate faster", "gat")).toBe(false);
    expect(matchesNeedle("A/B testing", "a/b")).toBe(true);
    expect(matchesNeedle("Stage pipeline", "tag")).toBe(false);
  });

  it("lets longer needles match word prefixes, never word middles", () => {
    expect(matchesNeedle("Scheduling links", "schedul")).toBe(true);
    expect(matchesNeedle("Rescheduling", "schedul")).toBe(false);
    expect(matchesNeedle("Partial submissions", "partial submission")).toBe(true);
  });
});
