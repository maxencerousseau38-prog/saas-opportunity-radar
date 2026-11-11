// Baseline of the evaluation fixtures with the fake provider. Hard
// invariants hold for any provider; recall thresholds are set per agent
// after the first real baseline (PD-22).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AIGateway, FAKE_MODELS, FakeProvider } from "@sor/ai-gateway";
import { fakeEnrichmentHandlers } from "../enrichment/fake";
import { evaluateAll, type EnrichmentFixture } from "../evals/enrichment";

const fixtures = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../../evals/enrichment/fixtures.json", import.meta.url)),
    "utf8",
  ),
) as EnrichmentFixture[];

describe("enrichment evaluation fixtures (fake-provider baseline)", () => {
  it("accepts no unsupported or forbidden claim and gets every exclusion right", async () => {
    const gateway = new AIGateway({
      provider: new FakeProvider(fakeEnrichmentHandlers),
      models: FAKE_MODELS,
    });
    const report = await evaluateAll(fixtures, gateway);
    expect(report.unsupportedClaimRate).toBe(0);
    expect(report.exclusionAccuracy).toBe(1);
    // The fake provider's deterministic heuristics find the structured facts of these fixtures.
    expect(report.recall).toBeGreaterThanOrEqual(0.8);
  });
});
