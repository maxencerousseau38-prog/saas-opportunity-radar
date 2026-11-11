// Catalog repository (Implementation Blueprint §10 "Catalog"). Runs with a
// user client: RLS only returns visible products (active + eligible) and
// their dependent rows, so a hidden or excluded product reads as absent.
import type { DbClient } from "../clients";
import { mapPostgresError } from "../errors";
import type { Database, Json } from "../generated";

type Fn = Database["public"]["Functions"];
export type CatalogSearchRow = Fn["catalog_search"]["Returns"][number];

export interface CatalogSearchParams {
  workspaceId: string;
  plan: Json;
  sort: string;
  seed: number;
  after: { value: string; id: string } | null;
  limit: number;
}

export async function searchCatalog(
  client: DbClient,
  p: CatalogSearchParams,
): Promise<CatalogSearchRow[]> {
  const { data, error } = await client.rpc("catalog_search_v2", {
    p_workspace_id: p.workspaceId,
    p_plan: p.plan,
    p_sort: p.sort,
    p_seed: p.seed,
    p_limit: p.limit,
    ...(p.after
      ? { p_after_value: p.after.value as unknown as number, p_after_id: p.after.id }
      : {}),
  });
  if (error) throw mapPostgresError(error);
  return data ?? [];
}

export async function countCatalog(
  client: DbClient,
  workspaceId: string,
  plan: Json,
): Promise<number> {
  const { data, error } = await client.rpc("catalog_count_v2", {
    p_workspace_id: workspaceId,
    p_plan: plan,
  });
  if (error) throw mapPostgresError(error);
  return Number(data ?? 0);
}

export async function discoverMetadata(client: DbClient, productIds: string[]) {
  if (productIds.length === 0) return [];
  const { data, error } = await client.rpc("catalog_discover_metadata", {
    p_product_ids: productIds,
  });
  if (error) throw mapPostgresError(error);
  return data ?? [];
}

export async function listCategories(client: DbClient) {
  const { data, error } = await client
    .from("categories")
    .select("id, parent_id, name, slug, priority_weight")
    .order("priority_weight", { ascending: false })
    .order("name");
  if (error) throw mapPostgresError(error);
  return data ?? [];
}

const PRODUCT_COLUMNS =
  "id, company_id, name, slug, website_url, primary_domain, logo_url, tagline, short_description, description, problem_solved, value_proposition, use_cases, compatibilities, customer_type, billing_models, pricing_status, launch_year, product_status, maturity_stage, languages, technology_tags, served_countries, customer_countries, france_presence, europe_presence, french_version, complexity_level, documentation_url, first_discovered_at, verification_status, last_verified_at";

const COMPANY_COLUMNS =
  "id, name, legal_name, website_url, country_code, city, founded_year, employee_min, employee_max, company_type, founder_led, funding_status, linkedin_url, description, verification_status, last_verified_at";

/** Visible product by slug, with its company and categories; null when absent or hidden. */
export async function getProductBySlug(client: DbClient, slug: string) {
  const { data, error } = await client
    .from("saas_products")
    .select(
      `${PRODUCT_COLUMNS}, companies(${COMPANY_COLUMNS}), product_categories(is_primary, categories(slug, name, parent_id))`,
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw mapPostgresError(error);
  return data;
}

export async function getProductById(client: DbClient, id: string) {
  const { data, error } = await client
    .from("saas_products")
    .select(
      `${PRODUCT_COLUMNS}, companies(${COMPANY_COLUMNS}), product_categories(is_primary, categories(slug, name, parent_id))`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw mapPostgresError(error);
  return data;
}

export async function listProductsByIds(client: DbClient, ids: string[]) {
  const { data, error } = await client
    .from("saas_products")
    .select(
      `${PRODUCT_COLUMNS}, companies(${COMPANY_COLUMNS}), product_categories(is_primary, categories(slug, name, parent_id))`,
    )
    .in("id", ids);
  if (error) throw mapPostgresError(error);
  return data ?? [];
}

export async function listProvenance(
  client: DbClient,
  productId: string,
  companyId: string | null,
) {
  let query = client
    .from("catalog_field_provenance")
    .select(
      "product_id, company_id, field_key, evidence_id, fact_status, selected_at, evidence_items(verified_at)",
    )
    .eq("is_current", true);
  query = companyId
    ? query.or(`product_id.eq.${productId},company_id.eq.${companyId}`)
    : query.eq("product_id", productId);
  const { data, error } = await query;
  if (error) throw mapPostgresError(error);
  return data ?? [];
}

export async function listFeatures(client: DbClient, productId: string) {
  const { data, error } = await client
    .from("product_features")
    .select(
      "id, name, description, feature_category, is_primary, availability, evidence_id, confidence, last_verified_at",
    )
    .eq("product_id", productId)
    .order("is_primary", { ascending: false })
    .order("name");
  if (error) throw mapPostgresError(error);
  return data ?? [];
}

export async function listIntegrations(client: DbClient, productId: string) {
  const { data, error } = await client
    .from("product_integrations")
    .select("id, name, integration_category, availability, evidence_id")
    .eq("product_id", productId)
    .order("name");
  if (error) throw mapPostgresError(error);
  return data ?? [];
}

export async function listPricing(client: DbClient, productIds: string[]) {
  const { data, error } = await client
    .from("pricing_plans")
    .select(
      "id, product_id, plan_name, billing_period, price_amount, currency, price_per_user, minimum_seats, has_free_trial, has_free_plan, custom_pricing, is_entry_plan, is_enterprise_plan, evidence_id, checked_at",
    )
    .in("product_id", productIds)
    .is("superseded_at", null)
    .order("price_amount", { ascending: true, nullsFirst: false });
  if (error) throw mapPostgresError(error);
  return data ?? [];
}

export async function listSignals(client: DbClient, productId: string, companyId: string | null) {
  let query = client
    .from("company_signals")
    .select(
      "id, signal_type, signal_value, signal_date, evidence_id, fact_status, confidence, verification_status, created_at",
    );
  query = companyId
    ? query.or(`product_id.eq.${productId},company_id.eq.${companyId}`)
    : query.eq("product_id", productId);
  const { data, error } = await query.order("signal_date", { ascending: false, nullsFirst: false });
  if (error) throw mapPostgresError(error);
  return data ?? [];
}

export async function listPeople(client: DbClient, companyId: string) {
  const { data, error } = await client
    .from("company_people")
    .select("id, full_name, role, public_profile_url, evidence_id, fact_status")
    .eq("company_id", companyId)
    .order("full_name");
  if (error) throw mapPostgresError(error);
  return data ?? [];
}

/** Outgoing competitor links; RLS hides links to non-visible products. */
export async function listCompetitors(client: DbClient, productId: string) {
  const { data, error } = await client
    .from("competitor_links")
    .select(
      `id, relationship_type, similarity_score, explanation, evidence_id, last_verified_at, competitor:saas_products!competitor_links_competitor_product_id_fkey(${PRODUCT_COLUMNS}, companies(${COMPANY_COLUMNS}), product_categories(is_primary, categories(slug, name, parent_id)))`,
    )
    .eq("product_id", productId);
  if (error) throw mapPostgresError(error);
  return data ?? [];
}

export async function listFeedback(client: DbClient, productId: string, limit = 50) {
  const { data, error } = await client
    .from("customer_feedback")
    .select(
      "id, published_at, rating, rating_scale_max, summarized_text, original_text, language, sentiment, content_storage_status, is_near_duplicate_of, evidence_item_id, source_snapshots(retrieved_at, source_records(canonical_url, sources(name, source_type)))",
    )
    .eq("product_id", productId)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw mapPostgresError(error);
  return data ?? [];
}

/** Evidence of a product (and its company) with snapshot, record and source. */
export async function listEvidence(client: DbClient, productId: string, companyId: string | null) {
  let query = client
    .from("evidence_items")
    .select(
      "id, claim_type, claim_text, claim_value, evidence_type, fact_status, monetization_signal, reliability_level, confidence, verification_status, verified_at, published_at, observed_at, source_snapshots(id, retrieved_at, last_retrieved_at, published_at, fetch_status, licence:extracted_metadata->>licence, source_records(canonical_url, title, sources(source_key, name, source_type)))",
    );
  query = companyId
    ? query.or(`product_id.eq.${productId},company_id.eq.${companyId}`)
    : query.eq("product_id", productId);
  const { data, error } = await query.order("observed_at", { ascending: false });
  if (error) throw mapPostgresError(error);
  return data ?? [];
}

export async function listSources(client: DbClient) {
  const { data, error } = await client
    .from("sources")
    .select(
      "source_key, name, source_type, access_method, integration_status, is_enabled, default_reliability_level, rate_limit_per_minute, quota_per_day, last_sync_at, last_error_code, last_error_at",
    )
    .order("name");
  if (error) throw mapPostgresError(error);
  return data ?? [];
}

export async function latestFxRates(client: DbClient) {
  const { data, error } = await client
    .from("fx_rates")
    .select("currency, rate_date, rate_to_eur")
    .order("rate_date", { ascending: false })
    .limit(200);
  if (error) throw mapPostgresError(error);
  const latest = new Map<string, { rate: number; date: string }>();
  for (const row of data ?? []) {
    if (!latest.has(row.currency))
      latest.set(row.currency, { rate: Number(row.rate_to_eur), date: row.rate_date });
  }
  return latest;
}
