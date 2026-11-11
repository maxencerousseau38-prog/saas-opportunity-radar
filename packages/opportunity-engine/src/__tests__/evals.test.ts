// Fake-provider baseline on evals/opportunity/fixtures.json: the server rules
// must give the expected verdicts whatever the (simulated) agents propose.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AIGateway, FAKE_MODELS, FakeProvider } from "@sor/ai-gateway";
import { evaluateOpportunityFixtures, type OpportunityFixture } from "../evals";
import { fakeOpportunityHandlers } from "../fake";

const fixtures = (
  JSON.parse(
    readFileSync(new URL("../../../../evals/opportunity/fixtures.json", import.meta.url), "utf8"),
  ) as { fixtures: OpportunityFixture[] }
).fixtures;

describe("opportunity evaluation fixtures (fake baseline)", () => {
  it("gives the expected verdicts, reproducibly, citing only the evidence index", async () => {
    const gateway = new AIGateway({
      provider: new FakeProvider(fakeOpportunityHandlers),
      models: FAKE_MODELS,
    });
    const result = await evaluateOpportunityFixtures(fixtures, gateway);
    for (const s of result.scores) expect(s.failures, s.id).toEqual([]);
    expect(result.verdictConsistency).toBe(1);
    expect(result.reproducibility).toBe(1);
    expect(result.unsupportedClaims).toBe(0);
  });
});
