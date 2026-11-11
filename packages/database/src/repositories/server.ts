// Server-role operations (secret key). Callers must have authenticated the
// user and checked the role first; the RPCs re-check it (Implementation
// Blueprint §3 job/server RPC table, §10 "Platform operator").
import type { DbClient } from "../clients";
import { DbError, mapPostgresError } from "../errors";
import type { Database, Json } from "../generated";

type ExclusionStatus = Database["public"]["Enums"]["exclusion_status"];
type WorkspaceRole = Database["public"]["Enums"]["workspace_role"];

export async function isPlatformOperator(service: DbClient, userId: string): Promise<boolean> {
  const { data, error } = await service
    .from("platform_operators")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw mapPostgresError(error);
  return data !== null;
}

export interface ManualAddRpcResult {
  status: "created" | "existing";
  product_id: string;
  exclusion_status: ExclusionStatus;
}

export async function manualAddProduct(
  service: DbClient,
  args: { workspaceId: string; requestedBy: string; entry: Json; exclusion: Json },
): Promise<ManualAddRpcResult> {
  const { data, error } = await service.rpc("sor_manual_add_product", {
    p_workspace_id: args.workspaceId,
    p_requested_by: args.requestedBy,
    p_entry: args.entry,
    p_exclusion: args.exclusion,
  });
  if (error) throw mapPostgresError(error);
  return data as unknown as ManualAddRpcResult;
}

export async function addMemberByEmail(
  service: DbClient,
  args: { workspaceId: string; actor: string; email: string; role: WorkspaceRole },
): Promise<string> {
  const { data, error } = await service.rpc("sor_add_member_by_email", {
    p_workspace_id: args.workspaceId,
    p_actor: args.actor,
    p_email: args.email,
    p_role: args.role,
  });
  if (error) throw mapPostgresError(error);
  return data;
}

/** Sends a Supabase Auth invitation (signup stays disabled). */
export async function inviteUserByEmail(service: DbClient, email: string, redirectTo: string) {
  const { error } = await service.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error) throw new DbError("INTERNAL_ERROR", error);
}

export async function transferOwnership(
  service: DbClient,
  args: { workspaceId: string; currentOwner: string; newOwner: string },
) {
  const { error } = await service.rpc("sor_transfer_ownership", {
    p_workspace_id: args.workspaceId,
    p_current_owner: args.currentOwner,
    p_new_owner: args.newOwner,
  });
  if (error) throw mapPostgresError(error);
}

// --------------------------------------------------------------- operator views
export async function listExclusionReviews(service: DbClient) {
  const { data, error } = await service
    .from("saas_products")
    .select(
      "id, name, slug, website_url, tagline, short_description, record_status, exclusion_status, first_discovered_at, product_exclusion_assessments(status, rule_set_version, matched_rules, incidental_mentions, decided_by, reason, created_at)",
    )
    .eq("exclusion_status", "needs_review")
    .order("first_discovered_at", { ascending: true })
    .limit(200);
  if (error) throw mapPostgresError(error);
  return data ?? [];
}

/** Open catalog listing reviews (S8.2), oldest first, with their candidate products. */
export async function listCatalogReviews(service: DbClient, limit = 100) {
  const { data, error, count } = await service
    .from("catalog_listing_reviews")
    .select(
      "id, external_id, listing, reason, candidate_product_ids, first_seen_at, last_seen_at, sources(source_key, name)",
      { count: "exact" },
    )
    .eq("status", "open")
    .order("first_seen_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);
  if (error) throw mapPostgresError(error);
  const rows = data ?? [];
  const ids = [...new Set(rows.flatMap((r) => r.candidate_product_ids))];
  const products = new Map<
    string,
    { id: string; name: string; slug: string; website_url: string | null }
  >();
  if (ids.length) {
    const res = await service
      .from("saas_products")
      .select("id, name, slug, website_url")
      .in("id", ids);
    if (res.error) throw mapPostgresError(res.error);
    for (const p of res.data ?? []) products.set(p.id, p);
  }
  return {
    total: count ?? rows.length,
    reviews: rows.map((r) => {
      const l = r.listing as Record<string, unknown>;
      const source = r.sources as unknown as { source_key: string; name: string } | null;
      return {
        id: r.id,
        source_key: source?.source_key ?? null,
        source_name: source?.name ?? null,
        external_id: r.external_id,
        name: String(l.name ?? ""),
        description: typeof l.description === "string" ? l.description : null,
        website_url: typeof l.canonical_url === "string" ? l.canonical_url : null,
        source_url: typeof l.source_url === "string" ? l.source_url : null,
        reason: r.reason,
        candidates: r.candidate_product_ids.flatMap((id) => {
          const p = products.get(id);
          return p ? [p] : [];
        }),
        first_seen_at: r.first_seen_at,
      };
    }),
  };
}

export async function resolveCatalogReview(
  service: DbClient,
  args: {
    operator: string;
    reviewId: string;
    action: "create" | "attach" | "reject";
    productId?: string;
    note?: string;
  },
): Promise<{ status: string; product_id: string | null }> {
  const { data, error } = await service.rpc("sor_operator_resolve_catalog_review", {
    p_operator: args.operator,
    p_review_id: args.reviewId,
    p_action: args.action,
    ...(args.productId ? { p_product_id: args.productId } : {}),
    ...(args.note ? { p_note: args.note } : {}),
  });
  if (error) throw mapPostgresError(error);
  return data as unknown as { status: string; product_id: string | null };
}

export async function decideExclusion(
  service: DbClient,
  args: { operator: string; productId: string; decision: "eligible" | "excluded"; reason: string },
) {
  const { error } = await service.rpc("sor_operator_exclusion_decision", {
    p_operator: args.operator,
    p_product_id: args.productId,
    p_decision: args.decision,
    p_reason: args.reason,
  });
  if (error) throw mapPostgresError(error);
}

export async function listCorrectionReports(service: DbClient, status: "open" | "all" = "open") {
  let query = service
    .from("catalog_correction_reports")
    .select(
      "id, workspace_id, product_id, report_type, field_key, message, status, resolution_note, created_at, resolved_at, saas_products(name, slug, exclusion_status)",
    )
    .order("created_at", { ascending: true })
    .limit(200);
  if (status === "open") query = query.eq("status", "open");
  const { data, error } = await query;
  if (error) throw mapPostgresError(error);
  return data ?? [];
}

export async function resolveCorrectionReport(
  service: DbClient,
  args: {
    operator: string;
    reportId: string;
    status: "accepted" | "rejected";
    note: string | null;
  },
) {
  const { error } = await service.rpc("sor_operator_resolve_report", {
    p_operator: args.operator,
    p_report_id: args.reportId,
    p_status: args.status,
    p_note: args.note ?? "",
  });
  if (error) throw mapPostgresError(error);
}

/**
 * Consumes one unit of an action rate limit (S7.4d); throws DbError
 * RATE_LIMITED (with the limit kind and retry delay) when the hourly budget
 * is spent. Subject: the workspace for invitations, the user otherwise.
 */
export async function consumeRateLimit(
  service: DbClient,
  action: "invitation" | "manual_addition" | "correction_report",
  subject: string,
): Promise<number> {
  const { data, error } = await service.rpc("sor_consume_rate_limit", {
    p_action: action,
    p_subject: subject,
  });
  if (error) throw mapPostgresError(error);
  return data;
}
