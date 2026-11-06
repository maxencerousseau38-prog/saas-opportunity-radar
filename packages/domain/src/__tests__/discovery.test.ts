// Discovery deterministic rules: fit score (§6.8, fit-1), planner guard (§6.2), budgets.
import { describe, expect, it } from "vitest";
import { CatalogFiltersSchema, QueryPlanSchema, type CatalogFiltersInput } from "@sor/contracts";
import {
  DISCOVERY_BUDGETS,
  computeFit,
  configurableExclusionHits,
  excludedThemeRule,
  mergeFitFilters,
  sanitizeQueryPlan,
  type FitFacts,
} from "../index";

const Y = 2026;
const filters = (f: CatalogFiltersInput = {}) => CatalogFiltersSchema.parse(f);

const facts = (over: Partial<FitFacts> = {}): FitFacts => ({
  customer_type: "b2b",
  employee_min: 2,
  employee_max: 8,
  hq_country: "US",
  founded_year: 2021,
  launch_year: null,
  category_slugs: ["marketing-analytics", "marketing-growth"],
  primary_parent_category_slug: "marketing-growth",
  billing_models: ["monthly_subscription"],
  pricing_status: "paid",
  min_monthly_eur: 29,
  has_custom_plan: false,
  has_paid_plan: true,
  verified_paying_evidence_count: 0,
  has_customer_feedback: false,
  signal_types: [],
  company_type: "independent",
  funding_status: "bootstrapped",
  founder_led: true,
  product_status: "active",
  workspace_status: null,
  ...over,
});

const unknownFacts = (): FitFacts =>
  facts({
    customer_type: "unknown",
    employee_min: null,
    employee_max: null,
    hq_country: null,
    founded_year: null,
    category_slugs: [],
    primary_parent_category_slug: null,
    billing_models: [],
    pricing_status: "unknown",
    min_monthly_eur: null,
    has_paid_plan: false,
    company_type: "unknown",
    funding_status: "unknown",
    founder_led: null,
  });

const fit = (
  explicit: CatalogFiltersInput,
  f: FitFacts,
  inferred: CatalogFiltersInput | null = null,
  exclusionStatus: "eligible" | "excluded" | "needs_review" = "eligible",
) =>
  computeFit({
    explicitFilters: filters(explicit),
    inferredFilters: inferred ? filters(inferred) : null,
    facts: f,
    exclusionStatus,
    currentYear: Y,
  });

describe("computeFit — score and coverage", () => {
  it("scores the share of satisfied groups among known groups", () => {
    const r = fit(
      {
        customer_types: { values: ["b2b"] },
        hq_countries: { values: ["FR"] },
        team_size: { presets: ["1-20"] },
        company_profile: { values: ["founder_led"] },
      },
      facts(),
    );
    // 4 explicit groups + pref_paid_offer; company_profile and team cover the
    // other preferences. Satisfied: customer, team, profile, paid offer = 4/5.
    expect(r.groups.map((g) => g.key).sort()).toEqual(
      ["company_profile", "customer_types", "hq_countries", "pref_paid_offer", "team_size"].sort(),
    );
    expect(r.fit_score).toBe(80);
    expect(r.fit_coverage).toBe(100);
    expect(r.hard_filter_failures).toEqual(["hq_countries"]);
  });

  it("excludes unknown groups from numerator and denominator (PRD §4.3)", () => {
    const r = fit(
      { customer_types: { values: ["b2b"] }, hq_countries: { values: ["US"] } },
      facts({ hq_country: null }),
    );
    const hq = r.groups.find((g) => g.key === "hq_countries");
    expect(hq?.outcome).toBe("unknown");
    expect(r.missing_information).toContain("hq_countries");
    expect(r.hard_filter_failures).toEqual([]);
    // customer ok + 4 preferences (all satisfied) = 5/5 known; 6 requested.
    expect(r.fit_score).toBe(100);
    expect(r.fit_coverage).toBe(83.33);
  });

  it("has no fit score when no requested group is known", () => {
    const r = fit({ hq_countries: { values: ["US"] } }, unknownFacts());
    expect(r.fit_coverage).toBe(0);
    expect(r.fit_score).toBeNull();
    expect(r.not_scored_reason).toBe("no_known_group");
  });

  it("never scores a candidate that is not eligible", () => {
    for (const status of ["excluded", "needs_review"] as const) {
      const r = fit({ customer_types: { values: ["b2b"] } }, facts(), null, status);
      expect(r.fit_score).toBeNull();
      expect(r.fit_coverage).toBeNull();
      expect(r.not_scored_reason).toBe("not_eligible");
    }
  });

  it("is deterministic", () => {
    const a = fit({ team_size: { presets: ["1-5", "20-50"] } }, facts());
    const b = fit({ team_size: { presets: ["1-5", "20-50"] } }, facts());
    expect(a).toEqual(b);
  });
});

describe("computeFit — explicit vs inferred vs preferences", () => {
  it("explicit groups outrank inferred ones and only explicit mismatches are hard", () => {
    const r = fit({ hq_countries: { values: ["US"] } }, facts(), {
      hq_countries: { values: ["FR"] },
      customer_types: { values: ["b2c"] },
    });
    expect(r.groups.find((g) => g.key === "hq_countries")).toEqual({
      key: "hq_countries",
      origin: "explicit",
      outcome: "satisfied",
    });
    expect(r.groups.find((g) => g.key === "customer_types")).toEqual({
      key: "customer_types",
      origin: "inferred",
      outcome: "not_satisfied",
    });
    expect(r.hard_filter_failures).toEqual([]);
  });

  it("adds research preferences only when no filter covers them", () => {
    const none = fit({}, facts());
    expect(none.groups.map((g) => g.key)).toEqual([
      "pref_independent",
      "pref_founder_led",
      "pref_small_team",
      "pref_paid_offer",
    ]);
    const covered = fit({ company_profile: { values: ["funded"] } }, facts());
    expect(covered.groups.some((g) => g.key === "pref_independent")).toBe(false);
    expect(covered.groups.some((g) => g.key === "pref_small_team")).toBe(false);
  });

  it("a paid plan is a paid offer, never a paying customer", () => {
    const r = fit({ commercial_validation: ["paying_customers_confirmed"] }, facts());
    expect(r.groups.find((g) => g.key === "commercial_validation")?.outcome).toBe("unknown");
    const verified = fit(
      { commercial_validation: ["paying_customers_confirmed"] },
      facts({ verified_paying_evidence_count: 1 }),
    );
    expect(verified.groups.find((g) => g.key === "commercial_validation")?.outcome).toBe(
      "satisfied",
    );
  });

  it("merge never carries inferred configurable exclusions or hidden products", () => {
    const { merged } = mergeFitFilters(
      filters({}),
      filters({ configurable_exclusions: ["b2c_only"], include_hidden: true }),
    );
    expect(merged.configurable_exclusions).toEqual([]);
    expect(merged.include_hidden).toBe(false);
  });
});

describe("computeFit — group semantics mirror the catalog filters", () => {
  const outcome = (explicit: CatalogFiltersInput, f: FitFacts, key: string) =>
    fit(explicit, f).groups.find((g) => g.key === key)?.outcome;

  it("team size uses employee_max, else employee_min", () => {
    expect(
      outcome({ team_size: { presets: ["1-5"] } }, facts({ employee_max: 8 }), "team_size"),
    ).toBe("not_satisfied");
    expect(
      outcome(
        { team_size: { presets: ["1-5"] } },
        facts({ employee_min: 3, employee_max: null }),
        "team_size",
      ),
    ).toBe("satisfied");
  });

  it("age uses founding year, else launch year", () => {
    expect(outcome({ age: { buckets: ["5_10"] } }, facts({ founded_year: 2018 }), "age")).toBe(
      "satisfied",
    );
    expect(
      outcome(
        { age: { buckets: ["lt_1"] } },
        facts({ founded_year: null, launch_year: 2026 }),
        "age",
      ),
    ).toBe("satisfied");
  });

  it("a parent category slug matches its children", () => {
    expect(outcome({ categories: { slugs: ["marketing-growth"] } }, facts(), "categories")).toBe(
      "satisfied",
    );
    expect(outcome({ categories: { slugs: ["finance"] } }, facts(), "categories")).toBe(
      "not_satisfied",
    );
  });

  it("price bands: max exclusive, free and custom flags", () => {
    expect(
      outcome(
        { price_bands: { values: ["10_30"] } },
        facts({ min_monthly_eur: 30 }),
        "price_bands",
      ),
    ).toBe("not_satisfied");
    expect(
      outcome(
        { price_bands: { values: ["30_100"] } },
        facts({ min_monthly_eur: 30 }),
        "price_bands",
      ),
    ).toBe("satisfied");
    expect(
      outcome(
        { price_bands: { values: ["free"] } },
        facts({ pricing_status: "free", min_monthly_eur: null, has_paid_plan: false }),
        "price_bands",
      ),
    ).toBe("satisfied");
    expect(
      outcome(
        { price_bands: { values: ["lt_10"] } },
        facts({ pricing_status: "unknown", min_monthly_eur: null }),
        "price_bands",
      ),
    ).toBe("unknown");
  });

  it("indie SaaS (PD-17 A) is three-valued", () => {
    expect(
      outcome({ company_profile: { values: ["indie_saas"] } }, facts(), "company_profile"),
    ).toBe("satisfied");
    expect(
      outcome(
        { company_profile: { values: ["indie_saas"] } },
        facts({ funding_status: "externally_funded" }),
        "company_profile",
      ),
    ).toBe("not_satisfied");
    expect(
      outcome(
        { company_profile: { values: ["indie_saas"] } },
        facts({ funding_status: "unknown" }),
        "company_profile",
      ),
    ).toBe("unknown");
  });
});

describe("configurableExclusionHits", () => {
  it("applies only when the candidate is known to match", () => {
    expect(configurableExclusionHits(["b2c_only"], facts({ customer_type: "b2c" }), Y)).toEqual([
      "b2c_only",
    ]);
    expect(configurableExclusionHits(["b2c_only"], facts({ customer_type: "unknown" }), Y)).toEqual(
      [],
    );
    expect(
      configurableExclusionHits(
        ["too_recent_without_demand_proof"],
        facts({ founded_year: 2026 }),
        Y,
      ),
    ).toEqual(["too_recent_without_demand_proof"]);
    expect(
      configurableExclusionHits(
        ["very_technical_devtools"],
        facts({ primary_parent_category_slug: "developer-tools" }),
        Y,
      ),
    ).toEqual(["very_technical_devtools"]);
  });

  it("are reported by computeFit from explicit filters only", () => {
    const r = fit(
      { configurable_exclusions: ["free_without_monetization"] },
      facts({ pricing_status: "free" }),
    );
    expect(r.configurable_exclusion_hits).toEqual(["free_without_monetization"]);
  });
});

describe("sanitizeQueryPlan (§6.2)", () => {
  const basePlan = QueryPlanSchema.parse({
    interpreted_intent: "US marketing analytics SaaS",
    mandatory_constraints: [],
    optional_preferences: [],
    category_slugs: ["marketing-analytics", "excluded-affiliate-networks"],
    inferred_filters: {
      customer_types: { values: ["b2b"] },
      configurable_exclusions: ["b2c_only"],
      include_hidden: true,
      maturity: { values: ["growing"] },
      categories: { slugs: ["excluded-partner-management"] },
    },
    queries_by_source: [
      {
        source_key: "hacker_news",
        queries: [
          "marketing analytics",
          "Marketing   Analytics",
          "affiliate tracking software",
          "partner management platform",
          "email deliverability",
        ],
      },
      { source_key: "product_hunt", queries: ["analytics"] },
    ],
    max_candidates: 80,
  });

  const run = (over: Partial<Parameters<typeof sanitizeQueryPlan>[0]> = {}) =>
    sanitizeQueryPlan({
      plan: basePlan,
      prompt: "Find small US marketing analytics SaaS",
      availableSearchSources: ["hacker_news"],
      maxQueriesPerSource: 5,
      maxResults: 30,
      ...over,
    });

  it("drops queries with an excluded theme, duplicates and unavailable sources", () => {
    const { plan, limitations } = run();
    expect(plan.queries_by_source).toEqual([
      { source_key: "hacker_news", queries: ["marketing analytics", "email deliverability"] },
    ]);
    const codes = limitations.map((l) => l.code);
    expect(codes).toContain("query_dropped_excluded_theme");
    expect(limitations).toContainEqual({ code: "source_not_available", detail: "product_hunt" });
  });

  it("drops excluded categories and planner-set exclusions or hidden products", () => {
    const { plan, limitations } = run();
    expect(plan.category_slugs).toEqual(["marketing-analytics"]);
    expect(plan.inferred_filters.categories).toBeUndefined();
    expect(plan.inferred_filters.configurable_exclusions).toEqual([]);
    expect(plan.inferred_filters.include_hidden).toBe(false);
    expect(plan.inferred_filters.maturity).toBeUndefined();
    expect(limitations).toContainEqual({
      code: "inferred_filter_not_supported",
      detail: "maturity",
    });
  });

  it("caps queries per source and candidates by the request", () => {
    const { plan, limitations } = run({ maxQueriesPerSource: 1 });
    expect(plan.queries_by_source[0]?.queries).toEqual(["marketing analytics"]);
    expect(limitations.map((l) => l.code)).toContain("query_budget_reached");
    expect(plan.max_candidates).toBe(30);
  });

  it("warns when the prompt itself targets an excluded theme", () => {
    const { limitations } = run({ prompt: "Find affiliate marketing tools" });
    expect(limitations).toContainEqual({ code: "excluded_theme_in_prompt", detail: "R2" });
  });

  it("matches the classifier's R2–R5 themes", () => {
    expect(excludedThemeRule("Affiliate-tracking software")).toBe("R2");
    expect(excludedThemeRule("partner portal")).toBe("R3");
    expect(excludedThemeRule("customer referral program")).toBeNull(); // R6: boundary, not excluded
  });
});

describe("DISCOVERY_BUDGETS", () => {
  it("deep is never smaller than standard", () => {
    const s = DISCOVERY_BUDGETS.standard;
    const d = DISCOVERY_BUDGETS.deep;
    for (const k of Object.keys(s) as Array<keyof typeof s>)
      expect(d[k]).toBeGreaterThanOrEqual(s[k]);
  });
});
