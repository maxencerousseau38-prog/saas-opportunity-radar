// Server-side guard on the D1 Query Planner output (Implementation Blueprint
// §6.2). The planner cannot remove or weaken permanent exclusions: they are
// not part of its output, and this guard drops planned queries and inferred
// categories touching an excluded theme, queries for sources that are not
// integrated and enabled, and anything beyond the run budget.
import { MVP_UNSUPPORTED_FILTER_KEYS, type CatalogFilters, type QueryPlan } from "@sor/contracts";
import { excludedThemeRule, isPermanentlyExcludedCategory } from "../exclusion";

export type PlanLimitationCode =
  | "excluded_theme_in_prompt"
  | "query_dropped_excluded_theme"
  | "category_dropped_excluded"
  | "source_not_available"
  | "query_budget_reached"
  | "inferred_filter_not_supported";

export interface PlanLimitation {
  code: PlanLimitationCode;
  detail: string;
}

export interface SanitizePlanInput {
  plan: QueryPlan;
  prompt: string;
  /** Search sources that are integrated and enabled for this run. */
  availableSearchSources: readonly string[];
  maxQueriesPerSource: number;
  maxResults: number;
}

export interface SanitizedPlan {
  plan: QueryPlan;
  limitations: PlanLimitation[];
}

const normalizeQuery = (q: string) => q.trim().replace(/\s+/g, " ").toLowerCase();

/** Keys the planner may never set in inferred filters. */
function cleanInferredFilters(
  filters: CatalogFilters,
  limitations: PlanLimitation[],
): CatalogFilters {
  const out: CatalogFilters = { ...filters, configurable_exclusions: [], include_hidden: false };
  delete out.text;
  for (const key of MVP_UNSUPPORTED_FILTER_KEYS) {
    if (out[key] !== undefined) {
      delete out[key];
      limitations.push({ code: "inferred_filter_not_supported", detail: key });
    }
  }
  if (out.categories) {
    const kept = out.categories.slugs.filter((s) => !isPermanentlyExcludedCategory(s));
    for (const s of out.categories.slugs) {
      if (isPermanentlyExcludedCategory(s)) {
        limitations.push({ code: "category_dropped_excluded", detail: s });
      }
    }
    if (kept.length > 0) out.categories = { slugs: kept };
    else delete out.categories;
  }
  return out;
}

export function sanitizeQueryPlan(input: SanitizePlanInput): SanitizedPlan {
  const limitations: PlanLimitation[] = [];
  const promptRule = excludedThemeRule(input.prompt);
  if (promptRule) {
    // §6.2: the run continues without the excluded theme, with a warning.
    limitations.push({ code: "excluded_theme_in_prompt", detail: promptRule });
  }

  const available = new Set(input.availableSearchSources);
  const bySource = new Map<string, string[]>();
  for (const entry of input.plan.queries_by_source) {
    if (!available.has(entry.source_key)) {
      limitations.push({ code: "source_not_available", detail: entry.source_key });
      continue;
    }
    const kept = bySource.get(entry.source_key) ?? [];
    const seen = new Set(kept.map(normalizeQuery));
    for (const q of entry.queries) {
      const rule = excludedThemeRule(q);
      if (rule) {
        limitations.push({
          code: "query_dropped_excluded_theme",
          detail: `${entry.source_key}: ${rule}`,
        });
        continue;
      }
      const n = normalizeQuery(q);
      if (seen.has(n)) continue;
      if (kept.length >= input.maxQueriesPerSource) {
        limitations.push({ code: "query_budget_reached", detail: entry.source_key });
        break;
      }
      seen.add(n);
      kept.push(q.trim());
    }
    bySource.set(entry.source_key, kept);
  }

  const category_slugs = input.plan.category_slugs.filter((s) => {
    if (!isPermanentlyExcludedCategory(s)) return true;
    limitations.push({ code: "category_dropped_excluded", detail: s });
    return false;
  });

  const plan: QueryPlan = {
    ...input.plan,
    category_slugs,
    inferred_filters: cleanInferredFilters(input.plan.inferred_filters, limitations),
    queries_by_source: [...bySource.entries()]
      .filter(([, queries]) => queries.length > 0)
      .map(([source_key, queries]) => ({ source_key, queries })),
    max_candidates: Math.min(input.plan.max_candidates, input.maxResults),
  };
  // Duplicate limitation entries add nothing to the run report.
  const unique = [...new Map(limitations.map((l) => [`${l.code}|${l.detail}`, l])).values()];
  return { plan, limitations: unique };
}
