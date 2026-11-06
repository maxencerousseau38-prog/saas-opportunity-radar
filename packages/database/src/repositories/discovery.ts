// Discovery repository (server role): what the discovery_run worker and the
// API read and write (Implementation Blueprint §6, §10 "Discovery", M8).
// Writes go through the M8 RPCs; the API reads with the service client only
// after it has checked membership.
import type { DbClient } from "../clients";
import { mapPostgresError } from "../errors";
import type { Database, Json } from "../generated";

type JsonValue = NonNullable<Json>;
type Tables = Database["public"]["Tables"];
export type DiscoveryRunRow = Tables["discovery_runs"]["Row"];
export type DiscoveryCandidateRow = Tables["discovery_candidates"]["Row"];
export type DiscoveryStage =
  | "planning"
  | "searching"
  | "extracting"
  | "resolving_identity"
  | "enriching"
  | "verifying"
  | "classifying_exclusion"
  | "filtering"
  | "ranking"
  | "persisting";

function check<T>(res: { data: T; error: { code?: string; message?: string } | null }): T {
  if (res.error) throw mapPostgresError(res.error);
  return res.data;
}
function need<T>(res: {
  data: T;
  error: { code?: string; message?: string } | null;
}): NonNullable<T> {
  const data = check(res);
  if (data === null || data === undefined) throw new Error("empty database result");
  return data as NonNullable<T>;
}

// ------------------------------------------------------------------ API

export async function requestDiscoveryRun(
  service: DbClient,
  args: {
    workspaceId: string;
    userId: string;
    idempotencyKey: string;
    requestHash: string;
    request: JsonValue;
  },
) {
  const rows = need(
    await service.rpc("sor_request_discovery_run", {
      p_workspace_id: args.workspaceId,
      p_requested_by: args.userId,
      p_idempotency_key: args.idempotencyKey,
      p_request_hash: args.requestHash,
      p_request: args.request,
    }),
  );
  const row = rows[0];
  if (!row) throw new Error("sor_request_discovery_run returned no row");
  return { runId: row.run_id, jobId: row.job_id, created: row.created };
}

export async function retryDiscoveryRun(
  service: DbClient,
  args: {
    workspaceId: string;
    userId: string;
    runId: string;
    idempotencyKey: string;
    requestHash: string;
  },
) {
  const rows = need(
    await service.rpc("sor_retry_discovery_run", {
      p_workspace_id: args.workspaceId,
      p_actor: args.userId,
      p_run_id: args.runId,
      p_idempotency_key: args.idempotencyKey,
      p_request_hash: args.requestHash,
    }),
  );
  const row = rows[0];
  if (!row) throw new Error("sor_retry_discovery_run returned no row");
  return { jobId: row.job_id, created: row.created };
}

export async function deleteDiscoveryRun(
  service: DbClient,
  args: { workspaceId: string; userId: string; runId: string; requestId: string },
) {
  check(
    await service.rpc("sor_delete_discovery_run", {
      p_workspace_id: args.workspaceId,
      p_actor: args.userId,
      p_run_id: args.runId,
      p_request_id: args.requestId,
    }),
  );
}

export async function reviewCandidate(
  service: DbClient,
  args: {
    workspaceId: string;
    userId: string;
    candidateId: string;
    decision: "accept" | "reject";
    reason: string | null;
    requestId: string;
  },
) {
  const out = need(
    await service.rpc("sor_review_discovery_candidate", {
      p_workspace_id: args.workspaceId,
      p_actor: args.userId,
      p_candidate_id: args.candidateId,
      p_decision: args.decision,
      // PostgREST passes null for an omitted text argument.
      p_reason: args.reason as string,
      p_request_id: args.requestId,
    }),
  );
  return out as {
    candidate_id: string;
    product_id: string;
    review_status: "accepted" | "rejected";
  };
}

export async function getRun(service: DbClient, runId: string): Promise<DiscoveryRunRow | null> {
  return check(await service.from("discovery_runs").select("*").eq("id", runId).maybeSingle());
}

export async function listCandidates(
  service: DbClient,
  runId: string,
): Promise<DiscoveryCandidateRow[]> {
  return need(
    await service
      .from("discovery_candidates")
      .select("*")
      .eq("run_id", runId)
      .order("fit_score", { ascending: false, nullsFirst: false })
      .order("id"),
  );
}

// ------------------------------------------------------------------ worker

export async function setStage(service: DbClient, runId: string, stage: DiscoveryStage) {
  check(await service.rpc("sor_discovery_set_stage", { p_run_id: runId, p_stage: stage }));
}

export async function savePlan(
  service: DbClient,
  args: {
    runId: string;
    interpretedFilters: JsonValue;
    queryPlan: JsonValue;
    limitations: JsonValue;
  },
) {
  check(
    await service.rpc("sor_discovery_save_plan", {
      p_run_id: args.runId,
      p_interpreted_filters: args.interpretedFilters,
      p_query_plan: args.queryPlan,
      p_limitations: args.limitations,
    }),
  );
}

/** Daily quota check; throws INVALID_STATE for a source that is not enabled. */
export async function consumeSource(
  service: DbClient,
  sourceKey: string,
  requests: number,
): Promise<boolean> {
  return need(
    await service.rpc("sor_source_consume", { p_source_key: sourceKey, p_requests: requests }),
  );
}

export interface CandidateWriteResult {
  candidate_id: string;
  product_id: string;
  identity_decision: "new" | "matched_existing" | "needs_review";
  is_new_to_catalog: boolean;
  exclusion_status: "eligible" | "excluded" | "needs_review";
  review_status: "pending" | "rejected" | "needs_review";
}

export async function upsertCandidate(
  service: DbClient,
  runId: string,
  candidate: JsonValue,
): Promise<CandidateWriteResult> {
  const out = need(
    await service.rpc("sor_discovery_upsert_candidate", {
      p_run_id: runId,
      p_candidate: candidate,
    }),
  );
  return out as unknown as CandidateWriteResult;
}

export async function finalizeRun(service: DbClient, runId: string, summary: JsonValue) {
  check(await service.rpc("sor_discovery_finalize", { p_run_id: runId, p_summary: summary }));
}

// ------------------------------------------------------------------ worker reads

export interface SourceStateRow {
  sourceKey: string;
  enabled: boolean;
  termsUrl: string | null;
  storagePolicy: "full" | "metadata_only" | "transient";
}

/** Registry state of sources: usable only when integrated and enabled. */
export async function sourceStates(service: DbClient, keys: string[]): Promise<SourceStateRow[]> {
  const rows = need(
    await service
      .from("sources")
      .select("source_key, integration_status, is_enabled, terms_url, storage_policy")
      .in("source_key", keys),
  );
  return rows.map((r) => ({
    sourceKey: r.source_key,
    enabled: r.is_enabled && r.integration_status === "integrated",
    termsUrl: r.terms_url,
    storagePolicy: r.storage_policy,
  }));
}

/** Visible, active, non-excluded categories with their parent slug (small reference table). */
async function visibleCategories(service: DbClient) {
  const rows = need(
    await service
      .from("categories")
      .select("id, slug, parent_id")
      .eq("is_user_visible", true)
      .eq("is_active", true)
      .eq("is_permanently_excluded", false),
  );
  const slugById = new Map(rows.map((r) => [r.id, r.slug]));
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    parentSlug: r.parent_id ? (slugById.get(r.parent_id) ?? null) : null,
  }));
}

/** Visible catalog products used as rebound seeds (explicit ids, else category members). */
export async function loadSeeds(
  service: DbClient,
  args: { productIds: string[]; categorySlugs: string[]; max: number },
): Promise<Array<{ id: string; name: string; websiteUrl: string }>> {
  if (args.max <= 0) return [];
  let ids = args.productIds;
  if (ids.length === 0) {
    if (args.categorySlugs.length === 0) return [];
    const wanted = (await visibleCategories(service))
      .filter(
        (c) =>
          args.categorySlugs.includes(c.slug) ||
          (c.parentSlug !== null && args.categorySlugs.includes(c.parentSlug)),
      )
      .map((c) => c.id);
    if (wanted.length === 0) return [];
    const members = need(
      await service.from("product_categories").select("product_id").in("category_id", wanted),
    );
    ids = [...new Set(members.map((m) => m.product_id))];
    if (ids.length === 0) return [];
  }
  const rows = need(
    await service
      .from("saas_products")
      .select("id, name, website_url")
      .in("id", ids.slice(0, 500))
      .eq("record_status", "active")
      .eq("exclusion_status", "eligible")
      .not("website_url", "is", null)
      .order("name")
      .order("id")
      .limit(args.max),
  );
  return rows.map((r) => ({ id: r.id, name: r.name, websiteUrl: r.website_url as string }));
}

/** Known, visible category slugs among `slugs`, plus their parent slugs. */
export async function categoryClosure(
  service: DbClient,
  slugs: string[],
): Promise<{ known: string[]; withParents: string[] }> {
  if (slugs.length === 0) return { known: [], withParents: [] };
  const rows = (await visibleCategories(service)).filter((c) => slugs.includes(c.slug));
  const known = rows.map((r) => r.slug);
  const parents = rows.flatMap((r) => (r.parentSlug ? [r.parentSlug] : []));
  return { known, withParents: [...new Set([...known, ...parents])] };
}

/** Catalog facts of an existing product for the deterministic fit score (§6.8). */
export async function fitFacts(service: DbClient, productId: string) {
  const p = check(
    await service
      .from("saas_products")
      .select(
        "id, customer_type, billing_models, pricing_status, launch_year, product_status, " +
          "companies(country_code, founded_year, employee_min, employee_max, company_type, funding_status, founder_led), " +
          "product_categories(is_primary, category_id)",
      )
      .eq("id", productId)
      .maybeSingle(),
  ) as null | {
    customer_type: "b2b" | "b2c" | "b2b_b2c" | "unknown";
    billing_models: string[];
    pricing_status: "free" | "paid" | "freemium" | "custom" | "unknown";
    launch_year: number | null;
    product_status: "active" | "beta" | "discontinued" | "unknown";
    companies: {
      country_code: string | null;
      founded_year: number | null;
      employee_min: number | null;
      employee_max: number | null;
      company_type: "independent" | "subsidiary" | "public_company" | "unknown";
      funding_status: "bootstrapped" | "externally_funded" | "unknown";
      founder_led: boolean | null;
    } | null;
    product_categories: Array<{ is_primary: boolean; category_id: string }>;
  };
  if (!p) return null;
  const categories = await visibleCategories(service);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const plans = need(
    await service
      .from("pricing_plans")
      .select("price_amount, custom_pricing, billing_period")
      .eq("product_id", productId)
      .is("superseded_at", null),
  );
  const paying = need(
    await service
      .from("evidence_items")
      .select("id")
      .eq("product_id", productId)
      .eq("verification_status", "verified")
      .in("monetization_signal", ["payment_confirmed", "customer_verified"]),
  );
  const feedback = need(
    await service.from("customer_feedback").select("id").eq("product_id", productId).limit(1),
  );
  const signals = need(
    await service.from("company_signals").select("signal_type").eq("product_id", productId),
  );
  const cats = p.product_categories.flatMap((pc) => {
    const c = byId.get(pc.category_id);
    return c ? [c] : [];
  });
  const primaryId = p.product_categories.find((pc) => pc.is_primary)?.category_id;
  const primary = primaryId ? (byId.get(primaryId) ?? null) : null;
  const c = p.companies;
  return {
    customer_type: p.customer_type,
    employee_min: c?.employee_min ?? null,
    employee_max: c?.employee_max ?? null,
    hq_country: c?.country_code ?? null,
    founded_year: c?.founded_year ?? null,
    launch_year: p.launch_year,
    category_slugs: [
      ...new Set(cats.flatMap((k) => [k.slug, ...(k.parentSlug ? [k.parentSlug] : [])])),
    ],
    primary_parent_category_slug: primary?.parentSlug ?? null,
    billing_models: p.billing_models,
    pricing_status: p.pricing_status,
    // Monthly entry price conversion lives in the catalog search; unknown here.
    min_monthly_eur: null,
    has_custom_plan: plans.some((x) => x.custom_pricing || x.billing_period === "custom"),
    has_paid_plan: plans.some((x) => (x.price_amount ?? 0) > 0),
    verified_paying_evidence_count: paying.length,
    has_customer_feedback: feedback.length > 0,
    signal_types: [...new Set(signals.map((s) => s.signal_type as string))],
    company_type: c?.company_type ?? null,
    funding_status: c?.funding_status ?? null,
    founder_led: c?.founder_led ?? null,
    product_status: p.product_status,
    workspace_status: null,
  };
}
