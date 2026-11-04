// Catalog service: search, count, profile, competitors, comparison and
// manual add (Implementation Blueprint §10 "Catalog"). Runs with the user's
// client except for manual add, which goes through the server RPC.
import "server-only";
import { randomInt } from "node:crypto";
import {
  CatalogFiltersSchema,
  type CatalogFilters,
  type CatalogPage,
  type CatalogQuery,
  type CategoryRef,
  type ManualAddResult,
  type ManualProductEntry,
  type ProductCard,
  type SourcedValue,
} from "@sor/contracts";
import {
  DbError,
  catalogRepo,
  pipelineRepo,
  serverRepo,
  workspaceRepo,
  type DbClient,
  type Json,
} from "@sor/database";
import {
  assertSupportedQuery,
  buildCatalogPlan,
  classifyExclusion,
  normalizeUrl,
  slugify,
} from "@sor/domain";
import { ApiError } from "@/lib/api/http";
import { decodeCursor, encodeCursor, queryHash } from "@/lib/api/cursor";
import { getServiceClient } from "@/lib/supabase/server";
import type { CompetitorView } from "./catalog-types";
import { createJob } from "./jobs";

const currentYear = () => new Date().getUTCFullYear();

function planFor(filters: CatalogFilters) {
  return buildCatalogPlan(filters, { currentYear: currentYear() });
}

type SearchRow = catalogRepo.CatalogSearchRow;

function toCard(row: SearchRow): ProductCard {
  const categories = Array.isArray(row.categories)
    ? (row.categories as unknown as CategoryRef[])
    : [];
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline ?? null,
    short_description: row.short_description ?? null,
    website_url: row.website_url ?? null,
    logo_url: row.logo_url ?? null,
    customer_type: row.customer_type,
    pricing_status: row.pricing_status,
    billing_models: row.billing_models ?? [],
    country_code: row.country_code ?? null,
    employee_min: row.employee_min ?? null,
    employee_max: row.employee_max ?? null,
    start_year: row.start_year ?? null,
    categories,
    workspace: {
      is_favorite: row.is_favorite ?? false,
      is_hidden: row.is_hidden ?? false,
      status: row.workspace_status ?? null,
      last_viewed_at: row.last_viewed_at ?? null,
      in_collection: row.in_collection ?? false,
    },
  };
}

export async function searchProducts(
  client: DbClient,
  workspaceId: string,
  query: CatalogQuery,
): Promise<CatalogPage> {
  assertSupportedQuery(query.filters, query.sort);
  const plan = planFor(query.filters);
  const q = queryHash({ plan: { ...plan, current_year: undefined }, sort: query.sort });

  let after: { value: string; id: string } | null = null;
  let seed = query.random_seed ?? randomInt(0, 2_147_483_647);
  if (query.cursor) {
    const c = decodeCursor(query.cursor);
    if (!c || c.q !== q || c.sort !== query.sort) {
      throw new ApiError("VALIDATION_ERROR", "Curseur invalide pour cette recherche");
    }
    after = { value: c.v, id: c.id };
    seed = c.seed;
  }

  const rows = await catalogRepo.searchCatalog(client, {
    workspaceId,
    plan: plan as unknown as Json,
    sort: query.sort,
    seed,
    after,
    limit: query.limit + 1,
  });
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  const next_cursor =
    rows.length > query.limit && last
      ? encodeCursor({ v: String(last.sort_value), id: last.id, sort: query.sort, seed, q })
      : null;
  return { data: page.map(toCard), next_cursor };
}

export async function countProducts(
  client: DbClient,
  workspaceId: string,
  filters: CatalogFilters,
) {
  assertSupportedQuery(filters, "relevance");
  return catalogRepo.countCatalog(client, workspaceId, planFor(filters) as unknown as Json);
}

// ------------------------------------------------------------------ profile
type ProductRow = NonNullable<Awaited<ReturnType<typeof catalogRepo.getProductBySlug>>>;
type ProvenanceRow = Awaited<ReturnType<typeof catalogRepo.listProvenance>>[number];

function sourced<T>(
  value: T | null | undefined,
  provenance: ProvenanceRow | undefined,
): SourcedValue<T> {
  const v = value === undefined || (Array.isArray(value) && value.length === 0) ? null : value;
  if (provenance) {
    return {
      value: v,
      fact_status: provenance.fact_status,
      verified_at: provenance.evidence_items?.verified_at ?? null,
      evidence_ids: [provenance.evidence_id],
    };
  }
  // No recorded source: the value (if any) is shown as unsourced.
  return { value: v, fact_status: "unknown", verified_at: null, evidence_ids: [] };
}

function categoriesOf(row: Pick<ProductRow, "product_categories">): CategoryRef[] {
  return (row.product_categories ?? [])
    .flatMap((pc) =>
      pc.categories
        ? [{ slug: pc.categories.slug, name: pc.categories.name, is_primary: pc.is_primary }]
        : [],
    )
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.name.localeCompare(b.name));
}

export function buildGeneral(product: ProductRow, provenance: ProvenanceRow[]) {
  const company = product.companies;
  const pf = (key: string) =>
    provenance.find((p) => p.product_id === product.id && p.field_key === key);
  const cf = (key: string) =>
    company
      ? provenance.find((p) => p.company_id === company.id && p.field_key === key)
      : undefined;
  return {
    id: product.id,
    slug: product.slug,
    name: sourced(product.name, pf("name")),
    logo_url: product.logo_url,
    website_url: sourced(product.website_url, pf("website_url")),
    tagline: sourced(product.tagline, pf("tagline")),
    short_description: sourced(product.short_description, pf("short_description")),
    description: sourced(product.description, pf("description")),
    categories: categoriesOf(product),
    customer_type: sourced(
      product.customer_type === "unknown" ? null : product.customer_type,
      pf("customer_type"),
    ),
    pricing_status: sourced(
      product.pricing_status === "unknown" ? null : product.pricing_status,
      pf("pricing_status"),
    ),
    billing_models: sourced(product.billing_models, pf("billing_models")),
    launch_year: sourced(product.launch_year, pf("launch_year")),
    product_status: sourced(
      product.product_status === "unknown" ? null : product.product_status,
      pf("product_status"),
    ),
    maturity_stage: sourced(
      product.maturity_stage === "unknown" ? null : product.maturity_stage,
      pf("maturity_stage"),
    ),
    problem_solved: sourced(product.problem_solved, pf("problem_solved")),
    value_proposition: sourced(product.value_proposition, pf("value_proposition")),
    use_cases: sourced(product.use_cases, pf("use_cases")),
    compatibilities: sourced(product.compatibilities, pf("compatibilities")),
    technology_tags: sourced(product.technology_tags, pf("technology_tags")),
    languages: sourced(product.languages, pf("languages")),
    served_countries: sourced(product.served_countries, pf("served_countries")),
    complexity_level: sourced(
      product.complexity_level === "unknown" ? null : product.complexity_level,
      pf("complexity_level"),
    ),
    documentation_url: sourced(product.documentation_url, pf("documentation_url")),
    france_presence: sourced(
      product.france_presence === "unknown" ? null : product.france_presence,
      pf("france_presence"),
    ),
    french_version: sourced(
      product.french_version === "unknown" ? null : product.french_version,
      pf("french_version"),
    ),
    first_discovered_at: product.first_discovered_at,
    last_verified_at: product.last_verified_at,
    company: company
      ? {
          id: company.id,
          name: sourced(company.name, cf("name")),
          legal_name: sourced(company.legal_name, cf("legal_name")),
          website_url: sourced(company.website_url, cf("website_url")),
          country_code: sourced(company.country_code, cf("country_code")),
          city: sourced(company.city, cf("city")),
          founded_year: sourced(company.founded_year, cf("founded_year")),
          employee_min: sourced(company.employee_min, cf("employee_min") ?? cf("employee_count")),
          employee_max: sourced(company.employee_max, cf("employee_max") ?? cf("employee_count")),
          company_type: sourced(
            company.company_type === "unknown" ? null : company.company_type,
            cf("company_type"),
          ),
          founder_led: sourced(company.founder_led, cf("founder_led")),
          funding_status: sourced(
            company.funding_status === "unknown" ? null : company.funding_status,
            cf("funding_status"),
          ),
          linkedin_url: sourced(company.linkedin_url, cf("linkedin_url")),
          description: sourced(company.description, cf("description")),
        }
      : null,
  };
}

async function visibleProduct(client: DbClient, idOrSlug: { id?: string; slug?: string }) {
  const product = idOrSlug.id
    ? await catalogRepo.getProductById(client, idOrSlug.id)
    : await catalogRepo.getProductBySlug(client, idOrSlug.slug ?? "");
  if (!product) throw new ApiError("NOT_FOUND");
  return product;
}

export async function getProductGeneral(client: DbClient, productId: string) {
  const product = await visibleProduct(client, { id: productId });
  const provenance = await catalogRepo.listProvenance(client, product.id, product.company_id);
  return buildGeneral(product, provenance);
}

export type ProductSection =
  | "features"
  | "pricing"
  | "integrations"
  | "signals"
  | "competitors"
  | "feedback"
  | "evidence"
  | "sources"
  | "conflicts";

export async function getProductSection(
  client: DbClient,
  productId: string,
  section: ProductSection,
) {
  const product = await visibleProduct(client, { id: productId });
  switch (section) {
    case "features":
      return catalogRepo.listFeatures(client, product.id);
    case "pricing":
      return catalogRepo.listPricing(client, [product.id]);
    case "integrations":
      return catalogRepo.listIntegrations(client, product.id);
    case "signals":
      return catalogRepo.listSignals(client, product.id, product.company_id);
    case "competitors":
      return getCompetitors(client, product);
    case "feedback":
      return catalogRepo.listFeedback(client, product.id);
    case "evidence":
      return catalogRepo.listEvidence(client, product.id, product.company_id);
    case "sources":
      return sourcesOf(await catalogRepo.listEvidence(client, product.id, product.company_id));
    case "conflicts":
      return pipelineRepo.listConflicts(client, product.id);
  }
}

type EvidenceRow = Awaited<ReturnType<typeof catalogRepo.listEvidence>>[number];

/** One row per source document, with the evidence it supports (PRD §5.10). */
export function sourcesOf(evidence: EvidenceRow[]) {
  const bySnapshot = new Map<
    string,
    {
      snapshot_id: string;
      url: string | null;
      title: string | null;
      source_name: string | null;
      source_type: string | null;
      retrieved_at: string | null;
      last_retrieved_at: string | null;
      evidence: Array<
        Pick<
          EvidenceRow,
          | "id"
          | "claim_type"
          | "claim_text"
          | "fact_status"
          | "reliability_level"
          | "verification_status"
        >
      >;
    }
  >();
  for (const e of evidence) {
    const snap = e.source_snapshots;
    if (!snap) continue;
    const entry = bySnapshot.get(snap.id) ?? {
      snapshot_id: snap.id,
      url: snap.source_records?.canonical_url ?? null,
      title: snap.source_records?.title ?? null,
      source_name: snap.source_records?.sources?.name ?? null,
      source_type: snap.source_records?.sources?.source_type ?? null,
      retrieved_at: snap.retrieved_at,
      last_retrieved_at: snap.last_retrieved_at,
      evidence: [],
    };
    entry.evidence.push({
      id: e.id,
      claim_type: e.claim_type,
      claim_text: e.claim_text,
      fact_status: e.fact_status,
      reliability_level: e.reliability_level,
      verification_status: e.verification_status,
    });
    bySnapshot.set(snap.id, entry);
  }
  return [...bySnapshot.values()];
}

// ------------------------------------------------------------------ pricing helpers
type PricingRow = Awaited<ReturnType<typeof catalogRepo.listPricing>>[number];
type FxMap = Awaited<ReturnType<typeof catalogRepo.latestFxRates>>;

/** Indicative monthly entry price in EUR (PD-20 A); null when unknown or unconvertible. */
export function entryMonthlyEur(plans: PricingRow[], fx: FxMap): number | null {
  let best: number | null = null;
  for (const p of plans) {
    if (p.price_amount === null || Number(p.price_amount) <= 0 || !p.currency) continue;
    if (p.billing_period !== "month" && p.billing_period !== "year") continue;
    const monthly =
      p.billing_period === "year" ? Number(p.price_amount) / 12 : Number(p.price_amount);
    const rate = p.currency === "EUR" ? 1 : fx.get(p.currency)?.rate;
    if (rate === undefined) continue;
    const eur = monthly * rate;
    if (best === null || eur < best) best = eur;
  }
  return best === null ? null : Math.round(best * 100) / 100;
}

// ------------------------------------------------------------------ competitors

export async function getCompetitors(client: DbClient, product: ProductRow) {
  const links = (await catalogRepo.listCompetitors(client, product.id)).filter((l) => l.competitor);
  const ids = [product.id, ...links.map((l) => (l.competitor as { id: string }).id)];
  const [pricing, fx, features] = await Promise.all([
    catalogRepo.listPricing(client, ids),
    catalogRepo.latestFxRates(client),
    Promise.all(ids.map((id) => catalogRepo.listFeatures(client, id))),
  ]);
  const featuresOf = (id: string) =>
    (features[ids.indexOf(id)] ?? [])
      .filter((f) => f.availability === "available" || f.availability === "beta")
      .map((f) => f.name);
  const priceOf = (id: string) =>
    entryMonthlyEur(
      pricing.filter((p) => p.product_id === id),
      fx,
    );
  const subjectPrice = priceOf(product.id);
  const subjectFeatures = featuresOf(product.id).length;

  const competitors: CompetitorView[] = links.map((l) => {
    const c = l.competitor as unknown as ProductRow;
    const price = priceOf(c.id);
    const feats = featuresOf(c.id);
    const plans = pricing.filter((p) => p.product_id === c.id);
    return {
      link_id: l.id,
      relationship_type: l.relationship_type,
      explanation: l.explanation,
      similarity_score: l.similarity_score === null ? null : Number(l.similarity_score),
      evidence_id: l.evidence_id,
      product: {
        id: c.id,
        slug: c.slug,
        name: c.name,
        tagline: c.tagline,
        website_url: c.website_url,
        logo_url: c.logo_url,
        country_code: c.companies?.country_code ?? null,
        pricing_status: c.pricing_status,
        categories: categoriesOf(c),
        entry_monthly_eur: price,
        available_features: feats,
      },
      // [ASSUMPTION] deterministic facet definitions, documented in IB §10.
      facets: {
        cheaper: price !== null && subjectPrice !== null && price < subjectPrice,
        more_advanced: subjectFeatures > 0 && feats.length > subjectFeatures,
        free: c.pricing_status === "free" || plans.some((p) => p.has_free_plan === true),
        french: c.companies?.country_code === "FR",
        us: c.companies?.country_code === "US",
      },
    };
  });
  return {
    subject: {
      id: product.id,
      entry_monthly_eur: subjectPrice,
      available_feature_count: subjectFeatures,
    },
    competitors,
  };
}

// ------------------------------------------------------------------ comparison
export async function compareProducts(client: DbClient, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length < 2 || unique.length > 10) {
    throw new ApiError("VALIDATION_ERROR", "Sélectionnez entre 2 et 10 produits");
  }
  const [products, pricing, fx, features, integrations] = await Promise.all([
    catalogRepo.listProductsByIds(client, unique),
    catalogRepo.listPricing(client, unique),
    catalogRepo.latestFxRates(client),
    Promise.all(unique.map((id) => catalogRepo.listFeatures(client, id))),
    Promise.all(unique.map((id) => catalogRepo.listIntegrations(client, id))),
  ]);
  // Products the user cannot see are omitted, with a count (CLAUDE.md §9).
  const rows = unique.flatMap((id, i) => {
    const p = products.find((x) => x.id === id);
    if (!p) return [];
    const plans = pricing.filter((x) => x.product_id === id);
    return [
      {
        id: p.id,
        slug: p.slug,
        name: p.name,
        tagline: p.tagline,
        website_url: p.website_url,
        logo_url: p.logo_url,
        categories: categoriesOf(p),
        customer_type: p.customer_type,
        pricing_status: p.pricing_status,
        billing_models: p.billing_models,
        country_code: p.companies?.country_code ?? null,
        founded_year: p.companies?.founded_year ?? p.launch_year,
        employee_min: p.companies?.employee_min ?? null,
        employee_max: p.companies?.employee_max ?? null,
        company_type: p.companies?.company_type ?? "unknown",
        entry_monthly_eur: entryMonthlyEur(plans, fx),
        has_free_trial: plans.some((x) => x.has_free_trial === true),
        has_free_plan: plans.some((x) => x.has_free_plan === true),
        plan_count: plans.length,
        features: (features[i] ?? [])
          .filter((f) => f.availability === "available" || f.availability === "beta")
          .map((f) => f.name),
        integrations: (integrations[i] ?? [])
          .filter((f) => f.availability === "available")
          .map((f) => f.name),
      },
    ];
  });
  return { data: rows, omitted_count: unique.length - rows.length };
}

// ------------------------------------------------------------------ manual add
export async function manualAdd(
  client: DbClient,
  workspaceId: string,
  userId: string,
  entry: ManualProductEntry,
): Promise<ManualAddResult> {
  let normalized;
  try {
    normalized = normalizeUrl(entry.website_url);
  } catch {
    throw new ApiError("VALIDATION_ERROR", "URL invalide");
  }
  // §5.4 classifier, run by the API before the RPC. The one-line description
  // is the closest equivalent of a tagline for a declared product.
  const exclusion = classifyExclusion({
    primaryCategorySlugs: entry.category_slugs.slice(0, 1),
    name: entry.name,
    tagline: entry.short_description,
    primaryUseCase: null,
    secondaryTexts: entry.note ? [entry.note] : [],
    featureTexts: [],
  });
  const result = await serverRepo.manualAddProduct(getServiceClient(), {
    workspaceId,
    requestedBy: userId,
    entry: {
      canonical_url: normalized.canonicalUrl,
      domain: normalized.registrableDomain ?? normalized.host,
      name: entry.name,
      slug_base: slugify(entry.name),
      company_name: entry.company_name,
      company_slug_base: entry.company_name ? slugify(entry.company_name) : null,
      short_description: entry.short_description,
      note: entry.note,
      category_slugs: entry.category_slugs,
    },
    exclusion: {
      status: exclusion.status,
      rule_set_version: exclusion.ruleSetVersion,
      matched_rules: exclusion.matchedRules,
      incidental_mentions: exclusion.incidentalMentions,
    } as unknown as Json,
  });
  // Only disclose the id of a product the user is allowed to see.
  const visible = (await catalogRepo.getProductById(client, result.product_id)) !== null;
  // From Sprint 3, a newly created eligible product is enriched from its official website.
  let enrichmentJobId: string | null = null;
  let enrichmentNote: ManualAddResult["enrichment_note"] = "not_applicable";
  if (result.status === "created" && visible) {
    try {
      const job = await createJob({
        kind: "product_enrichment",
        workspaceId,
        userId,
        idempotencyKey: `manual-add-enrichment-${result.product_id}`,
        payload: { product_id: result.product_id },
      });
      enrichmentJobId = job.jobId;
      enrichmentNote = "queued";
    } catch (err) {
      if (!(err instanceof DbError) || err.code !== "LIMIT_EXCEEDED") throw err;
      enrichmentNote = "limit_reached";
    }
  }
  return {
    status: result.status,
    product_id: visible ? result.product_id : null,
    exclusion_status: result.exclusion_status,
    visible,
    enrichment_job_id: enrichmentJobId,
    enrichment_note: enrichmentNote,
  };
}

/** Records a profile view (member+ only; viewers cannot write workspace state). */
export async function recordView(
  client: DbClient,
  workspaceId: string,
  productId: string,
  userId: string,
) {
  try {
    await workspaceRepo.upsertProductState(client, workspaceId, productId, userId, {
      last_viewed_at: new Date().toISOString(),
    });
  } catch {
    // Best effort: a failed view timestamp must not break the profile.
  }
}

export function parseFilters(input: unknown): CatalogFilters {
  const parsed = CatalogFiltersSchema.safeParse(input ?? {});
  return parsed.success ? parsed.data : CatalogFiltersSchema.parse({});
}
