import { describe, expect, it } from "vitest";
import {
  CreateExternalResearchSchema,
  ImportExternalResearchAnswerSchema,
} from "../external-research";

const ID = "11111111-1111-4111-8111-111111111111";

describe("external AI research contracts", () => {
  it("accepts a bounded product research request", () => {
    expect(
      CreateExternalResearchSchema.safeParse({
        product_ids: [ID],
        destination: "claude",
        strategy: "better_alternative",
        included_sections: ["features", "feedback"],
      }).success,
    ).toBe(true);
  });

  it("rejects duplicate products, unsupported destinations, and unknown fields", () => {
    const base = {
      product_ids: [ID],
      destination: "chatgpt",
      strategy: "red_team",
      included_sections: [],
    };
    expect(CreateExternalResearchSchema.safeParse({ ...base, product_ids: [ID, ID] }).success).toBe(
      false,
    );
    expect(
      CreateExternalResearchSchema.safeParse({ ...base, destination: "openai-model-x" }).success,
    ).toBe(false);
    expect(CreateExternalResearchSchema.safeParse({ ...base, model: "model-x" }).success).toBe(
      false,
    );
  });

  it("bounds imported answers and strips no unsupported fields", () => {
    expect(
      ImportExternalResearchAnswerSchema.safeParse({ answer_text: "Analyse externe" }).success,
    ).toBe(true);
    expect(
      ImportExternalResearchAnswerSchema.safeParse({ answer_text: "x".repeat(50_001) }).success,
    ).toBe(false);
    expect(
      ImportExternalResearchAnswerSchema.safeParse({ answer_text: "ok", verified: true }).success,
    ).toBe(false);
  });
});
