// Golden set for the permanent exclusion classifier (Implementation Blueprint §5.4).
import { describe, expect, it } from "vitest";
import {
  EXCLUSION_RULE_KEYS,
  PERMANENTLY_EXCLUDED_CATEGORY_SLUGS,
  classifyExclusion,
  type ExclusionInput,
} from "../exclusion";

const product = (over: Partial<ExclusionInput>): ExclusionInput => ({
  primaryCategorySlugs: [],
  name: "Acme",
  tagline: null,
  primaryUseCase: null,
  secondaryTexts: [],
  featureTexts: [],
  ...over,
});
const rules = (input: ExclusionInput) =>
  classifyExclusion(input).matchedRules.map((m) => m.ruleKey);

describe("excluded outcomes", () => {
  it.each([
    [
      "R1 excluded category",
      product({ primaryCategorySlugs: ["excluded-affiliate-networks"] }),
      "R1",
    ],
    ["R2 in the name", product({ name: "AffiliateHub — Affiliate Tracking" }), "R2"],
    ["R2 plural", product({ tagline: "Launch affiliate programs in minutes" }), "R2"],
    ["R3 PRM", product({ tagline: "The PRM for SaaS companies" }), "R3"],
    [
      "R3 channel partners",
      product({ primaryUseCase: "Recruit and manage channel partners" }),
      "R3",
    ],
    ["R3 partner portal", product({ tagline: "A partner portal for resellers" }), "R3"],
    ["R4 referral network", product({ tagline: "The referral network for agencies" }), "R4"],
    [
      "R5 payouts with partners",
      product({ primaryUseCase: "Automate payouts to your partners" }),
      "R5",
    ],
    ["R5 commissions with affiliates", product({ tagline: "Commissions for affiliates" }), "R5"],
    ["accents and punctuation", product({ tagline: "AFFILIATE-MARKETING, simplified!" }), "R2"],
  ])("%s", (_label, input, rule) => {
    const r = classifyExclusion(input);
    expect(r.status).toBe("excluded");
    expect(r.ruleSetVersion).toBe("excl-1");
    expect(rules(input)).toContain(rule);
  });
});

describe("needs_review outcomes", () => {
  it("R7: standalone 'affiliate' in a core text", () => {
    const input = product({ tagline: "Grow your affiliate revenue" });
    expect(classifyExclusion(input).status).toBe("needs_review");
    expect(rules(input)).toEqual(["R7"]);
  });

  it("R7: standalone 'partners' in the primary use case", () => {
    expect(classifyExclusion(product({ primaryUseCase: "Onboard new partners" })).status).toBe(
      "needs_review",
    );
  });

  it("R8: excluded phrase in the description only", () => {
    const input = product({
      tagline: "Marketing dashboards",
      secondaryTexts: ["Also works as an affiliate tracking platform."],
    });
    expect(classifyExclusion(input).status).toBe("needs_review");
    expect(rules(input)).toEqual(["R8"]);
  });

  it("R10: an LLM flag escalates to review", () => {
    const input = product({
      tagline: "Revenue sharing",
      llmCorePurposeFlag: "affiliate_or_partner",
    });
    expect(classifyExclusion(input).status).toBe("needs_review");
  });
});

describe("products that must stay eligible", () => {
  it("a CRM with a referral feature (R9 incidental)", () => {
    const r = classifyExclusion(
      product({
        name: "PipeCRM",
        tagline: "Simple CRM for small sales teams",
        featureTexts: ["Referral program", "Affiliate tracking add-on", "Email sequences"],
      }),
    );
    expect(r.status).toBe("eligible");
    expect(r.incidentalMentions.map((m) => m.text)).toEqual([
      "Referral program",
      "Affiliate tracking add-on",
    ]);
  });

  it("a marketing tool that calls itself 'your growth partner'", () => {
    expect(
      classifyExclusion(product({ name: "Growthly", tagline: "Your growth partner for SEO" }))
        .status,
    ).toBe("eligible");
  });

  it("a marketing-attribution tool under the visible Attribution category", () => {
    expect(
      classifyExclusion(
        product({
          primaryCategorySlugs: ["marketing-growth-attribution"],
          tagline: "Multi-touch marketing attribution for B2B",
        }),
      ).status,
    ).toBe("eligible");
  });

  it("employee sales-commission software is a flagged boundary case (PD-11 A)", () => {
    const input = product({ tagline: "Sales commission management for RevOps" });
    expect(classifyExclusion(input).status).toBe("eligible");
    expect(rules(input)).toEqual(["R6"]);
  });

  it("customer-referral-program software is a flagged boundary case (PD-11 A)", () => {
    const input = product({ tagline: "Customer referral programs for ecommerce" });
    expect(classifyExclusion(input).status).toBe("eligible");
    expect(rules(input)).toEqual(["R6"]);
  });

  it("'partner' in the tagline alone is not ambiguous", () => {
    expect(
      classifyExclusion(product({ tagline: "The analytics partner of 300 shops" })).status,
    ).toBe("eligible");
  });

  it("an LLM cannot make an excluded product eligible", () => {
    expect(
      classifyExclusion(
        product({
          tagline: "Affiliate marketing platform",
          llmCorePurposeFlag: "not_affiliate_or_partner",
        }),
      ).status,
    ).toBe("excluded");
  });

  it("words that merely contain the tokens do not match", () => {
    expect(
      classifyExclusion(product({ tagline: "Partnering with affiliated hospitals" })).status,
    ).toBe("eligible");
  });
});

describe("rule-set mirror", () => {
  it("lists the rule keys seeded in exclusion_rules (excl-1)", () => {
    expect([...EXCLUSION_RULE_KEYS]).toEqual([
      "R1",
      "R2",
      "R3",
      "R4",
      "R5",
      "R6",
      "R7",
      "R8",
      "R10",
    ]);
  });

  it("lists the seven excluded categories of migration M4", () => {
    expect(PERMANENTLY_EXCLUDED_CATEGORY_SLUGS).toHaveLength(7);
  });

  it("precedence: excluded > needs_review > eligible", () => {
    expect(
      classifyExclusion(
        product({
          tagline: "Affiliate marketing platform",
          primaryUseCase: "Onboard new partners",
          secondaryTexts: ["partner portal"],
        }),
      ).status,
    ).toBe("excluded");
  });
});
