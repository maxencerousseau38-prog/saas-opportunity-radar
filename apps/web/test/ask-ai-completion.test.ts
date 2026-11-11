// S8.4 Ask AI completion: analysis types A–D, coverage statement, SOR grid
// as a frame only, cluster provenance warning, deterministic bounding.
// Synthetic context (test data, not catalog products).
import { describe, expect, it } from "vitest";
import {
  RESEARCH_STRATEGIES,
  buildExternalResearchPrompt,
  coverageLines,
  fitExternalResearchPrompt,
} from "@/lib/ask-ai/prompt";
import type { ExternalResearchContext } from "@/lib/ask-ai/types";

const ID = "11111111-1111-4111-8111-111111111111";
const unknown = { value: null, status: "unknown", verified_at: null, evidence_ids: [] };

function context(
  feedbackItems: number,
  extra: Partial<ExternalResearchContext> = {},
): ExternalResearchContext {
  return {
    context_version: "sor-context.v2",
    subject: {
      type: "product",
      label: "Synthetic Tool",
      product_ids: [ID],
      products: [{ id: ID, slug: "synthetic-tool", name: "Synthetic Tool", website_url: null }],
    },
    overview: [
      {
        id: ID,
        slug: "synthetic-tool",
        name: { value: "Synthetic Tool", status: "confirmed", verified_at: null, evidence_ids: [] },
        official_website: unknown,
        tagline: unknown,
        short_description: unknown,
        description: unknown,
        problem_solved: unknown,
        value_proposition: unknown,
        categories: [],
        customer_type: unknown,
        pricing_status: unknown,
        billing_models: unknown,
        launch_year: unknown,
        company: null,
      },
    ],
    sections: {
      feedback: [
        {
          product: { id: ID },
          items: Array.from({ length: feedbackItems }, (_, i) => ({
            summary: `Synthetic complaint ${i} ${"x".repeat(400)}`,
          })),
        },
      ],
    },
    evidence_index: [],
    information_gaps: [],
    coverage: {
      products: [
        { product_id: ID, name: "Synthetic Tool", feedback_available: 40, evidence_available: 3 },
      ],
    },
    ...extra,
  };
}

const input = (strategy: keyof typeof RESEARCH_STRATEGIES, ctx = context(3)) => ({
  destination: "claude" as const,
  strategy,
  subjectLabel: ctx.subject.label,
  context: ctx,
});

describe("Ask AI analysis types (PRODUCT_VISION §4 A–D)", () => {
  it("offers discovery, customer voice, cross-competitor pain and opportunity analysis", () => {
    for (const key of [
      "saas_discovery",
      "customer_voice",
      "cross_competitor_pain_intelligence",
      "opportunity_analysis",
    ] as const) {
      expect(RESEARCH_STRATEGIES[key].checklist.length).toBeGreaterThan(2);
    }
    expect(buildExternalResearchPrompt(input("saas_discovery"))).toContain(
      "rien n’est importé automatiquement",
    );
  });

  it("gives SOR's grid only to the opportunity analysis, as a frame and not a SOR result", () => {
    const opportunity = buildExternalResearchPrompt(input("opportunity_analysis"));
    expect(opportunity).toContain(
      "Grille de référence SOR (cadre d’évaluation, pas un calcul vérifié par SOR)",
    );
    expect(opportunity).toContain("Volonté de payer : 15 points");
    expect(buildExternalResearchPrompt(input("customer_voice"))).not.toContain(
      "Grille de référence SOR",
    );
  });
});

describe("coverage statement", () => {
  it("says how many reviews and sources are included, never all of them", () => {
    const lines = coverageLines(context(3));
    expect(lines).toContain("Synthetic Tool : 3 avis client(s) transmis sur 40 détenu(s) par SOR.");
    expect(lines.at(-1)).toContain("ne contient pas tous les avis");
  });

  it("states a category sample and a cluster's members", () => {
    const lines = coverageLines(
      context(1, {
        coverage: {
          products: [],
          category: {
            slug: "marketing",
            name: "Marketing",
            total_products: 812,
            sample_rule: "échantillon test",
          },
          cluster_members_available: 9,
        },
        cluster: {
          id: ID,
          name: "Exports cassés",
          description: "Synthetic",
          problem_category: "bugs",
          review_status: "machine_proposed",
          algorithm_version: "test",
          statistics: {},
          provenance_warning: "Avertissement de test",
          members: [],
        },
      }),
    );
    expect(lines[0]).toBe(
      "Catégorie « Marketing » : 1 SaaS transmis sur 812 SaaS visibles dans SOR (échantillon test).",
    );
    expect(lines[1]).toBe(
      "Pain Point Cluster : 0 problème(s) transmis sur 9 rattaché(s) au cluster.",
    );
  });

  it("says when reviews were not selected", () => {
    expect(coverageLines({ ...context(3), sections: {} })[0]).toBe(
      "Synthetic Tool : avis clients non inclus (section non sélectionnée).",
    );
  });
});

describe("deterministic bounding", () => {
  it("keeps a small dossier unchanged", () => {
    const fitted = fitExternalResearchPrompt(input("customer_voice"));
    expect(fitted?.context.reductions).toBeUndefined();
  });

  it("halves the lists of a large dossier until it fits, and says so", () => {
    const big = context(400);
    expect(buildExternalResearchPrompt(input("customer_voice", big)).length).toBeGreaterThan(
      75_000,
    );
    const fitted = fitExternalResearchPrompt(input("customer_voice", big));
    expect(fitted).not.toBeNull();
    expect(fitted!.prompt.length).toBeLessThanOrEqual(75_000);
    expect(fitted!.context.reductions?.[0]).toMatch(/^Réduction automatique n°1/);
    expect(fitted!.prompt).toContain("Réduction automatique n°1");
    expect(coverageLines(fitted!.context)[0]).toMatch(/avis client\(s\) transmis sur 40/);
  });

  it("refuses when even the smallest dossier cannot fit", () => {
    expect(fitExternalResearchPrompt(input("customer_voice"), 500)).toBeNull();
  });
});
