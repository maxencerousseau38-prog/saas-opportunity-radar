import { describe, expect, it } from "vitest";
import { resolveIdentity, type IdentityLookup } from "../identity";

const empty: IdentityLookup = {
  productByCanonicalUrl: null,
  productByExternalId: null,
  productsByDomain: [],
  companyByDomain: null,
  similarNameProducts: [],
};
const candidate = {
  name: "MetricFlow",
  officialUrl: "https://www.metricflow.test/",
  description: null,
  sourceKey: "user_import",
  externalId: null,
};

describe("D4 identity resolution (§6.5)", () => {
  it("matches on the canonical URL first", () => {
    expect(
      resolveIdentity(candidate, {
        ...empty,
        productByCanonicalUrl: "p1",
        productsByDomain: ["p2"],
      }),
    ).toEqual({
      outcome: "matched_existing",
      productId: "p1",
      rule: "canonical_url",
    });
  });

  it("then on a source external id", () => {
    expect(resolveIdentity(candidate, { ...empty, productByExternalId: "p3" })).toMatchObject({
      productId: "p3",
      rule: "external_id",
    });
  });

  it("matches on a registrable domain only when it maps to exactly one product", () => {
    expect(resolveIdentity(candidate, { ...empty, productsByDomain: ["p4"] })).toMatchObject({
      productId: "p4",
      rule: "domain",
    });
    expect(resolveIdentity(candidate, { ...empty, productsByDomain: ["p4", "p5"] })).toMatchObject({
      outcome: "needs_review",
      reason: "domain_maps_to_several_products",
    });
  });

  it("never matches on a shared-host domain", () => {
    const hosted = { ...candidate, officialUrl: "https://apps.shopify.com/metricflow" };
    expect(resolveIdentity(hosted, { ...empty, productsByDomain: ["p6"] })).toEqual({
      outcome: "new",
      companyId: null,
      rule: "no_match",
    });
  });

  it("creates a new product under a known company domain", () => {
    expect(resolveIdentity(candidate, { ...empty, companyByDomain: "c1" })).toEqual({
      outcome: "new",
      companyId: "c1",
      rule: "company_domain",
    });
  });

  it("sends name similarity to review, never merges on a name", () => {
    expect(
      resolveIdentity(candidate, {
        ...empty,
        similarNameProducts: [{ id: "p7", name: "Metric-Flow" }],
      }),
    ).toEqual({
      outcome: "needs_review",
      reason: "similar_name",
      possibleDuplicateOf: "p7",
    });
  });

  it("requires a credible official URL", () => {
    expect(resolveIdentity({ ...candidate, officialUrl: null }, empty)).toMatchObject({
      outcome: "needs_review",
      reason: "missing_official_url",
    });
    expect(resolveIdentity({ ...candidate, officialUrl: "javascript:x" }, empty)).toMatchObject({
      reason: "invalid_official_url",
    });
  });
});
