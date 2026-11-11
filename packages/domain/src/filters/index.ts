// Catalog filter engine (Implementation Blueprint §4.3): turns validated
// CatalogFilters into the plan executed by `public.catalog_search` /
// `public.catalog_count`. Permanent exclusions are enforced by the database
// (RLS on visible products) and cannot be expressed in a plan.
import {
  MVP_UNSUPPORTED_FILTER_KEYS,
  UNSUPPORTED_SORT_KEYS,
  type CatalogFilters,
  type CatalogSort,
} from "@sor/contracts";

export interface PlanRange {
  min: number | null;
  max: number | null;
}
interface ValuesGroup<T> {
  values: T[];
  include_unknown: boolean;
}

/** JSON plan read by `private.catalog_filtered` (keys documented there). */
export interface CatalogPlan {
  text?: string;
  customer_types?: ValuesGroup<string>;
  team?: { ranges: PlanRange[]; include_unknown: boolean };
  hq_countries?: ValuesGroup<string>;
  founded?: { ranges: PlanRange[]; include_unknown: boolean };
  category_slugs?: string[];
  billing_models?: ValuesGroup<string>;
  price?: { ranges: PlanRange[]; free: boolean; custom: boolean; include_unknown: boolean };
  commercial_validation?: string[];
  company_profile?: ValuesGroup<string>;
  acquisition_channels?: {
    values: string[];
    statuses: string[];
    include_unknown: boolean;
  };
  configurable_exclusions: string[];
  include_hidden: boolean;
  current_year: number;
}

export class UnsupportedFilterError extends Error {
  readonly keys: string[];
  constructor(keys: string[]) {
    super(`Not available yet: ${keys.join(", ")}`);
    this.name = "UnsupportedFilterError";
    this.keys = keys;
  }
}

// PRD §4.2.B presets; `team size` = employee_max, else employee_min.
const TEAM_PRESETS: Record<string, PlanRange> = {
  "1-5": { min: 1, max: 5 },
  "1-10": { min: 1, max: 10 },
  "1-20": { min: 1, max: 20 },
  "20-50": { min: 20, max: 50 },
  "50-100": { min: 50, max: 100 },
  "100+": { min: 100, max: null },
};

// PRD §4.2.D buckets on age = current year − founding (else launch) year.
// [ASSUMPTION] integer ages: lt_1 = 0, 1_2 = 1–2, 2_5 = 3–5, 5_10 = 6–10, gt_10 = ≥ 11.
const AGE_BUCKETS: Record<string, { minAge: number; maxAge: number | null }> = {
  lt_1: { minAge: 0, maxAge: 0 },
  "1_2": { minAge: 1, maxAge: 2 },
  "2_5": { minAge: 3, maxAge: 5 },
  "5_10": { minAge: 6, maxAge: 10 },
  gt_10: { minAge: 11, maxAge: null },
};

// PRD §4.2.G bands in EUR per month: min inclusive, max exclusive.
const PRICE_BANDS: Record<string, PlanRange> = {
  lt_10: { min: 0, max: 10 },
  "10_30": { min: 10, max: 30 },
  "30_100": { min: 30, max: 100 },
  "100_500": { min: 100, max: 500 },
  gt_500: { min: 500, max: null },
};

const range = (r: { min?: number; max?: number }): PlanRange => ({
  min: r.min ?? null,
  max: r.max ?? null,
});

/** Throws UnsupportedFilterError for Phase 2 filter groups and S5 sort keys. */
export function assertSupportedQuery(filters: CatalogFilters, sort: CatalogSort): void {
  const keys: string[] = MVP_UNSUPPORTED_FILTER_KEYS.filter((k) => filters[k] !== undefined);
  if ((UNSUPPORTED_SORT_KEYS as readonly string[]).includes(sort)) keys.push(`sort:${sort}`);
  if (keys.length > 0) throw new UnsupportedFilterError(keys);
}

/** A group with no value and no unknown toggle does not filter. */
function valuesGroup<T extends string>(
  g: { values: T[]; include_unknown: boolean } | undefined,
): ValuesGroup<string> | undefined {
  if (!g || (g.values.length === 0 && !g.include_unknown)) return undefined;
  return { values: [...new Set(g.values)], include_unknown: g.include_unknown };
}

export function buildCatalogPlan(
  filters: CatalogFilters,
  options: { currentYear: number },
): CatalogPlan {
  const plan: CatalogPlan = {
    configurable_exclusions: [...new Set(filters.configurable_exclusions)],
    include_hidden: filters.include_hidden,
    current_year: options.currentYear,
  };

  const text = filters.text?.trim();
  if (text) plan.text = text;

  plan.customer_types = valuesGroup(filters.customer_types);
  plan.hq_countries = valuesGroup(filters.hq_countries);
  plan.billing_models = valuesGroup(filters.billing_models);
  plan.company_profile = valuesGroup(filters.company_profile);

  if (filters.acquisition_channels) {
    const { values, statuses, include_unknown } = filters.acquisition_channels;
    if (values.length || statuses.length || include_unknown) {
      plan.acquisition_channels = {
        values: [...new Set(values)],
        statuses: [...new Set(statuses)],
        include_unknown,
      };
    }
  }

  if (filters.team_size) {
    const ranges = filters.team_size.presets.map((p) => TEAM_PRESETS[p] as PlanRange);
    if (filters.team_size.custom) ranges.push(range(filters.team_size.custom));
    if (ranges.length > 0 || filters.team_size.include_unknown) {
      plan.team = { ranges, include_unknown: filters.team_size.include_unknown };
    }
  }

  if (filters.age) {
    const y = options.currentYear;
    const ranges: PlanRange[] = filters.age.buckets.map((b) => {
      const { minAge, maxAge } = AGE_BUCKETS[b] as { minAge: number; maxAge: number | null };
      return { min: maxAge === null ? null : y - maxAge, max: y - minAge };
    });
    if (filters.age.founded_year) ranges.push(range(filters.age.founded_year));
    if (ranges.length > 0 || filters.age.include_unknown) {
      plan.founded = { ranges, include_unknown: filters.age.include_unknown };
    }
  }

  if (filters.categories) plan.category_slugs = [...new Set(filters.categories.slugs)];

  if (filters.price_bands) {
    const values = filters.price_bands.values;
    const ranges = values.filter((v) => v in PRICE_BANDS).map((v) => PRICE_BANDS[v] as PlanRange);
    const free = values.includes("free");
    const custom = values.includes("custom");
    if (ranges.length > 0 || free || custom || filters.price_bands.include_unknown) {
      plan.price = { ranges, free, custom, include_unknown: filters.price_bands.include_unknown };
    }
  }

  if (filters.commercial_validation && filters.commercial_validation.length > 0) {
    plan.commercial_validation = [...new Set(filters.commercial_validation)];
  }

  for (const key of Object.keys(plan) as Array<keyof CatalogPlan>) {
    if (plan[key] === undefined) delete plan[key];
  }
  return plan;
}

/** Sort keys accepted by `public.catalog_search` before Sprint 5. */
export type SupportedCatalogSort = Exclude<CatalogSort, (typeof UNSUPPORTED_SORT_KEYS)[number]>;
