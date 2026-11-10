// Evidence pipeline repository (server role): snapshots, enrichment
// application, imports and the lookups of D4 identity resolution.
import type { DbClient } from "../clients";
import { mapPostgresError } from "../errors";
import type { Database, Json } from "../generated";

type JsonValue = NonNullable<Json>;
type Snapshot = {
  sourceKey: string;
  canonicalUrl: string;
  externalId: string | null;
  title: string | null;
  contentHash: string;
  fetchStatus: Database["public"]["Enums"]["fetch_status"];
  httpStatus: number | null;
  publishedAt: string | null;
  retrievedAt: string;
  storageStatus: Database["public"]["Enums"]["content_storage_status"];
  metadata: JsonValue;
};

function check<T>(res: { data: T; error: { code?: string; message?: string } | null }): T {
  if (res.error) throw mapPostgresError(res.error);
  return res.data;
}

export async function recordSnapshot(service: DbClient, s: Snapshot): Promise<string> {
  const id = check(
    await service.rpc("sor_record_snapshot", {
      p_source_key: s.sourceKey,
      p_canonical_url: s.canonicalUrl,
      p_external_id: s.externalId as string,
      p_title: s.title as string,
      p_content_hash: s.contentHash,
      p_fetch_status: s.fetchStatus,
      p_http_status: s.httpStatus as number,
      p_published_at: s.publishedAt as string,
      p_retrieved_at: s.retrievedAt,
      p_storage_status: s.storageStatus,
      p_metadata: s.metadata,
    }),
  );
  if (!id) throw new Error("sor_record_snapshot returned no id");
  return id;
}

export async function applyEnrichment(
  service: DbClient,
  args: { jobId: string; stepId: string; productId: string; plan: JsonValue },
): Promise<{ status: string; evidence_count?: number }> {
  const res = check(
    await service.rpc("sor_apply_enrichment", {
      p_job_id: args.jobId,
      p_step_id: args.stepId,
      p_product_id: args.productId,
      p_plan: args.plan,
    }),
  );
  return res as unknown as { status: string; evidence_count?: number };
}

export async function importProductRow(
  service: DbClient,
  args: {
    jobId: string;
    rowIndex: number;
    row: JsonValue;
    decision: JsonValue;
    exclusion: JsonValue;
  },
): Promise<{ status: string; product_id?: string; exclusion_status?: string }> {
  const res = check(
    await service.rpc("sor_import_product_row", {
      p_job_id: args.jobId,
      p_row_index: args.rowIndex,
      p_row: args.row,
      p_decision: args.decision,
      p_exclusion: args.exclusion,
    }),
  );
  return res as unknown as { status: string; product_id?: string; exclusion_status?: string };
}

/** Id of a registered source (null when the key is unknown). */
export async function sourceIdByKey(service: DbClient, sourceKey: string): Promise<string | null> {
  const row = check(
    await service.from("sources").select("id").eq("source_key", sourceKey).maybeSingle(),
  );
  return row?.id ?? null;
}

/**
 * Writes one collected catalog listing through the provenance pipeline
 * (first bulk collection, migration 20261116090001_catalog_sources).
 */
export async function ingestCatalogListing(
  service: DbClient,
  args: { row: JsonValue; decision: JsonValue; exclusion: JsonValue },
): Promise<{
  status: "created" | "matched_existing";
  product_id?: string;
  exclusion_status?: string;
}> {
  const res = check(
    await service.rpc("sor_ingest_catalog_listing", {
      p_row: args.row,
      p_decision: args.decision,
      p_exclusion: args.exclusion,
    }),
  );
  return res as unknown as {
    status: "created" | "matched_existing";
    product_id?: string;
    exclusion_status?: string;
  };
}

/** Refreshes planner statistics of the catalog tables after a bulk load. */
export async function refreshCatalogStatistics(service: DbClient): Promise<void> {
  check(await service.rpc("sor_catalog_refresh_statistics"));
}

export async function importFeedbackRow(
  service: DbClient,
  args: { jobId: string; productId: string; row: JsonValue },
): Promise<{ status: string; feedback_id?: string }> {
  const res = check(
    await service.rpc("sor_import_feedback_row", {
      p_job_id: args.jobId,
      p_product_id: args.productId,
      p_row: args.row,
    }),
  );
  return res as unknown as { status: string; feedback_id?: string };
}

// ------------------------------------------------------------------ reads used by the pipeline
export async function loadProductForEnrichment(service: DbClient, productId: string) {
  return check(
    await service
      .from("saas_products")
      .select(
        "id, name, website_url, company_id, tagline, short_description, description, record_status, exclusion_status, product_categories(is_primary, categories(slug))",
      )
      .eq("id", productId)
      .maybeSingle(),
  );
}

/** Currently selected claims (provenance) of a product and its company, with their evidence. */
export async function loadCurrentClaims(
  service: DbClient,
  productId: string,
  companyId: string | null,
) {
  let query = service
    .from("catalog_field_provenance")
    .select(
      "field_key, product_id, company_id, evidence_items(id, claim_value, verification_status, fact_status, reliability_level, observed_at)",
    )
    .eq("is_current", true);
  query = companyId
    ? query.or(`product_id.eq.${productId},company_id.eq.${companyId}`)
    : query.eq("product_id", productId);
  return check(await query) ?? [];
}

export async function currentValues(service: DbClient, productId: string) {
  return check(
    await service
      .from("saas_products")
      .select(
        "tagline, short_description, description, problem_solved, value_proposition, use_cases, languages, customer_type, pricing_status, billing_models, launch_year, documentation_url, technology_tags, served_countries, companies(legal_name, founded_year, country_code, city, employee_min, employee_max, founder_led, linkedin_url)",
      )
      .eq("id", productId)
      .maybeSingle(),
  );
}

export async function identityLookups(
  service: DbClient,
  args: {
    canonicalUrl: string;
    registrableDomain: string | null;
    sourceId?: string | null;
    externalId?: string | null;
    name: string;
  },
) {
  const byUrl = check(
    await service
      .from("entity_identifiers")
      .select("product_id")
      .eq("identifier_type", "canonical_url")
      .eq("value_normalized", args.canonicalUrl)
      .is("valid_to", null)
      .not("product_id", "is", null)
      .limit(1),
  );
  const byDomain = args.registrableDomain
    ? check(
        await service
          .from("entity_identifiers")
          .select("product_id")
          .eq("identifier_type", "domain")
          .eq("value_normalized", args.registrableDomain)
          .is("valid_to", null)
          .not("product_id", "is", null),
      )
    : [];
  const company = args.registrableDomain
    ? check(
        await service
          .from("companies")
          .select("id")
          .eq("primary_domain", args.registrableDomain)
          .limit(1),
      )
    : [];
  const similar = check(
    await service
      .from("saas_products")
      .select("id, name")
      .ilike("name", args.name.replace(/[%_\\]/g, (c) => `\\${c}`).slice(0, 200))
      .limit(10),
  );
  const byExternal =
    args.sourceId && args.externalId
      ? check(
          await service
            .from("entity_identifiers")
            .select("product_id")
            .eq("identifier_type", "external_id")
            .eq("source_id", args.sourceId)
            .eq("value_normalized", args.externalId)
            .is("valid_to", null)
            .not("product_id", "is", null)
            .limit(1),
        )
      : [];
  return {
    productByCanonicalUrl: byUrl?.[0]?.product_id ?? null,
    productByExternalId: byExternal?.[0]?.product_id ?? null,
    productsByDomain: (byDomain ?? []).flatMap((r) => (r.product_id ? [r.product_id] : [])),
    companyByDomain: company?.[0]?.id ?? null,
    similarNameProducts: similar ?? [],
  };
}

export async function visibleProductsBySlug(service: DbClient, slugs: string[]) {
  if (slugs.length === 0) return [];
  return (
    check(
      await service
        .from("saas_products")
        .select("id, slug")
        .in("slug", slugs)
        .eq("record_status", "active")
        .eq("exclusion_status", "eligible"),
    ) ?? []
  );
}

/** Evidence conflicts of a visible product (RLS also allows members to read them). */
export async function listConflicts(client: DbClient, productId: string) {
  return (
    check(
      await client
        .from("evidence_conflicts")
        .select(
          "id, field_key, status, detected_at, a:evidence_items!evidence_conflicts_evidence_a_id_fkey(id, claim_text, claim_value, observed_at, verification_status), b:evidence_items!evidence_conflicts_evidence_b_id_fkey(id, claim_text, claim_value, observed_at, verification_status)",
        )
        .eq("product_id", productId)
        .order("detected_at", { ascending: false }),
    ) ?? []
  );
}
