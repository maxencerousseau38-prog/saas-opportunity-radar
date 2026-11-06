// SaaS Fit Score (Implementation Blueprint §6.8, rule set `fit-1`):
// deterministic share of the requested filter groups satisfied among the
// groups whose value is known, weighted equally. Unknown groups count in
// neither numerator nor denominator (PRD §4.3), are listed as missing
// information and lower the coverage. Never mixed with the evidence
// confidence or the opportunity score; never computed by an LLM.
import type { CatalogFilters, ConfigurableExclusion } from "@sor/contracts";
import { buildCatalogPlan, type CatalogPlan, type PlanRange } from "../filters";

export const FIT_RULES_VERSION = "fit-1";

/** Filter groups evaluated for fit (MVP groups A–G, I, J; text is relevance, not fit). */
export const FIT_FILTER_GROUPS = [
  "customer_types",
  "team_size",
  "hq_countries",
  "age",
  "categories",
  "billing_models",
  "price_bands",
  "commercial_validation",
  "company_profile",
] as const;
export type FitFilterGroup = (typeof FIT_FILTER_GROUPS)[number];

/**
 * Research preferences of PRD §1.3 used as extra criteria only when no
 * explicit or inferred filter covers them. [ASSUMPTION] they count like the
 * other groups (equal weight); "underdeveloped" has no deterministic
 * definition and is not evaluated.
 */
export const FIT_PREFERENCES = [
  "pref_independent",
  "pref_founder_led",
  "pref_small_team",
  "pref_paid_offer",
] as const;
export type FitPreference = (typeof FIT_PREFERENCES)[number];

export type FitOutcome = "satisfied" | "not_satisfied" | "unknown";
export type FitOrigin = "explicit" | "inferred" | "preference";

/** Facts of a candidate, read from the catalog by the caller. Null = unknown. */
export interface FitFacts {
  customer_type: "b2b" | "b2c" | "b2b_b2c" | "unknown" | null;
  employee_min: number | null;
  employee_max: number | null;
  hq_country: string | null;
  founded_year: number | null;
  launch_year: number | null;
  /** Category slugs of the product and their parent slugs. Empty = unknown. */
  category_slugs: string[];
  /** Parent slug of the primary category, if any. */
  primary_parent_category_slug: string | null;
  billing_models: string[];
  pricing_status: "free" | "paid" | "freemium" | "custom" | "unknown";
  /** Lowest monthly entry price in EUR of a current paid plan. */
  min_monthly_eur: number | null;
  has_custom_plan: boolean;
  has_paid_plan: boolean;
  /** Verified `payment_confirmed` / `customer_verified` evidence items. */
  verified_paying_evidence_count: number;
  has_customer_feedback: boolean;
  /** `company_signals.signal_type` values present. */
  signal_types: string[];
  company_type: "independent" | "subsidiary" | "public_company" | "unknown" | null;
  funding_status: "bootstrapped" | "externally_funded" | "unknown" | null;
  founder_led: boolean | null;
  product_status: "active" | "beta" | "discontinued" | "unknown";
  /** The workspace's status for this product, if any. */
  workspace_status: string | null;
}

export interface FitGroupResult {
  key: FitFilterGroup | FitPreference;
  origin: FitOrigin;
  outcome: FitOutcome;
}

export interface FitResult {
  rules_version: typeof FIT_RULES_VERSION;
  /** Null when the candidate is not eligible or no requested group is known. */
  fit_score: number | null;
  /** Share (0–100) of requested groups with a known value; null if none requested. */
  fit_coverage: number | null;
  groups: FitGroupResult[];
  /** Requested groups whose value is unknown (PRD §6.3 "informations manquantes"). */
  missing_information: string[];
  /** Explicit (user) groups known not to be satisfied: hard filters (§6 rules). */
  hard_filter_failures: FitFilterGroup[];
  /** Explicit configurable exclusions (PRD §4.2.O) the candidate is known to match. */
  configurable_exclusion_hits: ConfigurableExclusion[];
  not_scored_reason: "not_eligible" | "no_known_group" | "no_requested_group" | null;
}

const PLAN_KEY: Record<FitFilterGroup, keyof CatalogPlan> = {
  customer_types: "customer_types",
  team_size: "team",
  hq_countries: "hq_countries",
  age: "founded",
  categories: "category_slugs",
  billing_models: "billing_models",
  price_bands: "price",
  commercial_validation: "commercial_validation",
  company_profile: "company_profile",
};

const SMALL_TEAM_MAX = 20;
const TRACTION_SIGNALS = [
  "review_count",
  "customer_logo",
  "commercial_reference",
  "product_hunt_presence",
  "headcount_change",
  "launch_or_update",
  "commercial_activity",
];

const known = <T>(v: T | null | undefined, unknownValue?: T): v is T =>
  v !== null && v !== undefined && v !== unknownValue;

/** Three-valued OR: satisfied if any is satisfied, else unknown if any is unknown. */
function anyOf(outcomes: FitOutcome[]): FitOutcome {
  if (outcomes.includes("satisfied")) return "satisfied";
  if (outcomes.includes("unknown")) return "unknown";
  return "not_satisfied";
}
/** Three-valued AND. */
function allOf(outcomes: FitOutcome[]): FitOutcome {
  if (outcomes.includes("not_satisfied")) return "not_satisfied";
  if (outcomes.includes("unknown")) return "unknown";
  return "satisfied";
}
const bool = (v: boolean | null): FitOutcome =>
  v === null ? "unknown" : v ? "satisfied" : "not_satisfied";

const teamSize = (f: FitFacts): number | null => f.employee_max ?? f.employee_min;
const startYear = (f: FitFacts): number | null => f.founded_year ?? f.launch_year;

function inRanges(value: number, ranges: PlanRange[], maxExclusive: boolean): boolean {
  return ranges.some(
    (r) =>
      (r.min === null || value >= r.min) &&
      (r.max === null || (maxExclusive ? value < r.max : value <= r.max)),
  );
}

function smallTeam(f: FitFacts): FitOutcome {
  const size = teamSize(f);
  return size === null ? "unknown" : bool(size <= SMALL_TEAM_MAX);
}

function companyProfileValue(value: string, f: FitFacts): FitOutcome {
  const type = known(f.company_type, "unknown") ? f.company_type : null;
  const funding = known(f.funding_status, "unknown") ? f.funding_status : null;
  switch (value) {
    case "founder_led":
      return bool(f.founder_led);
    case "small_team":
      return smallTeam(f);
    case "independent":
      return type === null ? "unknown" : bool(type === "independent");
    case "funded":
      return funding === null ? "unknown" : bool(funding === "externally_funded");
    case "bootstrapped":
      return funding === null ? "unknown" : bool(funding === "bootstrapped");
    case "subsidiary_or_group":
      return type === null ? "unknown" : bool(type === "subsidiary" || type === "public_company");
    case "indie_saas": // PD-17 A
      return allOf([
        type === null ? "unknown" : bool(type === "independent"),
        smallTeam(f),
        funding === null ? "unknown" : bool(funding !== "externally_funded"),
      ]);
    case "unknown":
      return bool(type === null);
    default:
      return "unknown";
  }
}

/**
 * Commercial validation: evidence-based, so a value not observed is unknown,
 * never "not satisfied" (a lack of evidence is not evidence of absence).
 */
function commercialValidationValue(value: string, f: FitFacts): FitOutcome {
  const has = (t: string) => f.signal_types.includes(t);
  switch (value) {
    case "paying_customers_confirmed":
      return f.verified_paying_evidence_count > 0 ? "satisfied" : "unknown";
    case "customer_reviews":
      return f.has_customer_feedback || has("review_count") ? "satisfied" : "unknown";
    case "testimonials":
      return has("testimonial") ? "satisfied" : "unknown";
    case "case_studies":
      return has("case_study") ? "satisfied" : "unknown";
    case "paid_subscriptions":
      return f.has_paid_plan ? "satisfied" : "unknown";
    case "traction_signals":
      return TRACTION_SIGNALS.some(has) ? "satisfied" : "unknown";
    case "monetization_unverified":
      return f.has_paid_plan && f.verified_paying_evidence_count === 0 ? "satisfied" : "unknown";
    case "insufficient_data":
      return !f.has_paid_plan &&
        f.verified_paying_evidence_count === 0 &&
        f.signal_types.length === 0
        ? "satisfied"
        : "not_satisfied";
    default:
      return "unknown";
  }
}

function evaluateGroup(group: FitFilterGroup, plan: CatalogPlan, f: FitFacts): FitOutcome {
  switch (group) {
    case "customer_types": {
      const g = plan.customer_types!;
      if (!known(f.customer_type, "unknown")) return "unknown";
      return bool(g.values.includes(f.customer_type));
    }
    case "team_size": {
      const size = teamSize(f);
      return size === null ? "unknown" : bool(inRanges(size, plan.team!.ranges, false));
    }
    case "hq_countries": {
      if (f.hq_country === null) return "unknown";
      return bool(plan.hq_countries!.values.includes(f.hq_country.toUpperCase()));
    }
    case "age": {
      const year = startYear(f);
      return year === null ? "unknown" : bool(inRanges(year, plan.founded!.ranges, false));
    }
    case "categories": {
      if (f.category_slugs.length === 0) return "unknown";
      return bool(plan.category_slugs!.some((s) => f.category_slugs.includes(s)));
    }
    case "billing_models": {
      if (f.billing_models.length === 0) return "unknown";
      return bool(plan.billing_models!.values.some((v) => f.billing_models.includes(v)));
    }
    case "price_bands": {
      const p = plan.price!;
      if (p.free && f.pricing_status === "free") return "satisfied";
      if (p.custom && (f.pricing_status === "custom" || f.has_custom_plan)) return "satisfied";
      if (f.min_monthly_eur !== null) return bool(inRanges(f.min_monthly_eur, p.ranges, true));
      if (f.pricing_status === "free" || f.pricing_status === "custom") return "not_satisfied";
      return "unknown";
    }
    case "commercial_validation":
      return anyOf(plan.commercial_validation!.map((v) => commercialValidationValue(v, f)));
    case "company_profile":
      return anyOf(plan.company_profile!.values.map((v) => companyProfileValue(v, f)));
  }
}

function evaluatePreference(pref: FitPreference, f: FitFacts): FitOutcome {
  switch (pref) {
    case "pref_independent":
      return companyProfileValue("independent", f);
    case "pref_founder_led":
      return bool(f.founder_led);
    case "pref_small_team":
      return smallTeam(f);
    case "pref_paid_offer":
      // A paid plan proves a paid offer, never paying customers (§4.1).
      if (f.has_paid_plan || f.verified_paying_evidence_count > 0) return "satisfied";
      return f.pricing_status === "free" ? "not_satisfied" : "unknown";
  }
}

/** The filter groups a plan requests (a group with no value does not filter). */
function requestedGroups(plan: CatalogPlan): FitFilterGroup[] {
  return FIT_FILTER_GROUPS.filter((g) => {
    const v = plan[PLAN_KEY[g]];
    if (v === undefined) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (g === "team_size" || g === "age") return (v as { ranges: PlanRange[] }).ranges.length > 0;
    if (g === "price_bands") {
      const p = v as NonNullable<CatalogPlan["price"]>;
      return p.ranges.length > 0 || p.free || p.custom;
    }
    return (v as { values: string[] }).values.length > 0;
  });
}

/** Explicit groups win over inferred ones, group by group (§6 "explicit constraints first"). */
export function mergeFitFilters(
  explicit: CatalogFilters,
  inferred: CatalogFilters | null,
): { merged: CatalogFilters; origins: Partial<Record<FitFilterGroup, FitOrigin>> } {
  const merged: CatalogFilters = { ...explicit };
  const origins: Partial<Record<FitFilterGroup, FitOrigin>> = {};
  for (const g of FIT_FILTER_GROUPS) {
    if (explicit[g] !== undefined) origins[g] = "explicit";
    else if (inferred && inferred[g] !== undefined) {
      (merged as Record<string, unknown>)[g] = inferred[g];
      origins[g] = "inferred";
    }
  }
  // Only the user's own configurable exclusions apply; never hidden products.
  merged.configurable_exclusions = explicit.configurable_exclusions;
  merged.include_hidden = false;
  return { merged, origins };
}

const PREFERENCE_COVERED_BY: Record<FitPreference, FitFilterGroup[]> = {
  pref_independent: ["company_profile"],
  pref_founder_led: ["company_profile"],
  pref_small_team: ["team_size", "company_profile"],
  pref_paid_offer: ["commercial_validation"],
};

/** PRD §4.2.O exclusions, applied only when the candidate is known to match. */
export function configurableExclusionHits(
  exclusions: readonly ConfigurableExclusion[],
  f: FitFacts,
  currentYear: number,
): ConfigurableExclusion[] {
  return [...new Set(exclusions)].filter((x) => {
    switch (x) {
      case "b2c_only":
        return f.customer_type === "b2c";
      case "groups_and_large_companies":
        return (
          f.company_type === "subsidiary" ||
          f.company_type === "public_company" ||
          (f.employee_min !== null && f.employee_min > 100)
        );
      case "free_without_monetization":
        return f.pricing_status === "free";
      case "no_identifiable_activity":
        return f.product_status === "discontinued";
      case "too_recent_without_demand_proof": {
        const year = startYear(f);
        return (
          year !== null &&
          year >= currentYear - 1 &&
          f.verified_paying_evidence_count === 0 &&
          !f.has_customer_feedback &&
          !f.signal_types.some((t) => ["review_count", "testimonial", "case_study"].includes(t))
        );
      }
      case "very_technical_devtools":
        return f.primary_parent_category_slug === "developer-tools";
      case "already_analyzed_and_rejected":
        return f.workspace_status === "rejected";
    }
  });
}

const round2 = (x: number) => Math.round(x * 100) / 100;

export interface ComputeFitInput {
  explicitFilters: CatalogFilters;
  inferredFilters: CatalogFilters | null;
  facts: FitFacts;
  exclusionStatus: "eligible" | "excluded" | "needs_review" | "unassessed";
  currentYear: number;
}

export function computeFit(input: ComputeFitInput): FitResult {
  const empty = (reason: FitResult["not_scored_reason"]): FitResult => ({
    rules_version: FIT_RULES_VERSION,
    fit_score: null,
    fit_coverage: null,
    groups: [],
    missing_information: [],
    hard_filter_failures: [],
    configurable_exclusion_hits: [],
    not_scored_reason: reason,
  });
  // Only eligible candidates are scored (§6.8).
  if (input.exclusionStatus !== "eligible") return empty("not_eligible");

  const { merged, origins } = mergeFitFilters(input.explicitFilters, input.inferredFilters);
  const plan = buildCatalogPlan(merged, { currentYear: input.currentYear });
  const f = input.facts;

  const groups: FitGroupResult[] = requestedGroups(plan).map((g) => ({
    key: g,
    origin: origins[g] ?? "explicit",
    outcome: evaluateGroup(g, plan, f),
  }));
  const covered = new Set(groups.map((g) => g.key));
  for (const pref of FIT_PREFERENCES) {
    if (PREFERENCE_COVERED_BY[pref].some((g) => covered.has(g))) continue;
    groups.push({ key: pref, origin: "preference", outcome: evaluatePreference(pref, f) });
  }

  const hits = configurableExclusionHits(
    input.explicitFilters.configurable_exclusions,
    f,
    input.currentYear,
  );
  const hard = groups
    .filter((g) => g.origin === "explicit" && g.outcome === "not_satisfied")
    .map((g) => g.key as FitFilterGroup);
  const knownGroups = groups.filter((g) => g.outcome !== "unknown");
  const satisfied = knownGroups.filter((g) => g.outcome === "satisfied").length;

  const result: FitResult = {
    rules_version: FIT_RULES_VERSION,
    fit_score: null,
    fit_coverage: null,
    groups,
    missing_information: groups.filter((g) => g.outcome === "unknown").map((g) => g.key),
    hard_filter_failures: hard,
    configurable_exclusion_hits: hits,
    not_scored_reason: null,
  };
  if (groups.length === 0) return { ...result, not_scored_reason: "no_requested_group" };
  result.fit_coverage = round2((knownGroups.length / groups.length) * 100);
  if (knownGroups.length === 0) return { ...result, not_scored_reason: "no_known_group" };
  result.fit_score = round2((satisfied / knownGroups.length) * 100);
  return result;
}
