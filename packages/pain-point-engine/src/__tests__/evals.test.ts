// Fake-provider baseline of the pain point evaluation fixtures (CLAUDE.md §13).
// Hard invariants hold for any provider; grouping recall thresholds are set
// per agent after the first real baseline (PD-22).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AIGateway, FAKE_MODELS, FakeProvider } from "@sor/ai-gateway";
import { fakePainPointHandlers } from "../fake";
import { evaluatePainFixtures, type PainFixture } from "../evals";

const fixtures = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../../evals/pain-points/fixtures.json", import.meta.url)),
    "utf8",
  ),
) as PainFixture[];

describe("pain point evaluation fixtures (fake-provider baseline)", () => {
  it("never merges different problems, counts authors once and computes relative frequency", async () => {
    const gateway = new AIGateway({
      provider: new FakeProvider(fakePainPointHandlers),
      models: FAKE_MODELS,
    });
    const report = await evaluatePainFixtures(fixtures, gateway);
    console.warn(
      JSON.stringify({
        groupingRecall: report.groupingRecall,
        incorrectMergeRate: report.incorrectMergeRate,
        countingAccuracy: report.countingAccuracy,
        failures: report.scores.flatMap((s) => s.failures),
      }),
    );
    expect(report.incorrectMergeRate).toBe(0);
    expect(report.countingAccuracy).toBe(1);
  });
});
