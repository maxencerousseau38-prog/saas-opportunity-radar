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
