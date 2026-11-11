// Job system repository (Implementation Blueprint §3 M5, §11). Server role
// only: job tables and the queue are never reachable from browsers.
import type { DbClient } from "../clients";
import { DbError, mapPostgresError } from "../errors";
import type { Database, Json } from "../generated";

export type JobRow = Database["public"]["Tables"]["job_executions"]["Row"];
export type JobKind = Database["public"]["Enums"]["job_kind"];
export type JobState = Database["public"]["Enums"]["job_state"];
export type TerminalReason = Database["public"]["Enums"]["terminal_reason"];
type JsonValue = NonNullable<Json>;

function check<T>(res: { data: T; error: { code?: string; message?: string } | null }): T {
  if (res.error) throw mapPostgresError(res.error);
  return res.data;
}

export async function requestJob(
  service: DbClient,
  args: {
    kind: JobKind;
    workspaceId: string;
    requestedBy: string;
    idempotencyKey: string;
    requestHash: string;
    payload: JsonValue;
  },
): Promise<{ jobId: string; created: boolean }> {
  const rows = check(
    await service.rpc("sor_request_job", {
      p_kind: args.kind,
      p_workspace_id: args.workspaceId,
      p_requested_by: args.requestedBy,
      p_idempotency_key: args.idempotencyKey,
      p_request_hash: args.requestHash,
      p_payload: args.payload,
    }),
  );
  const row = rows?.[0];
  if (!row) throw new DbError("INTERNAL_ERROR", { rows });
  return { jobId: row.job_id, created: row.created };
}

export async function cancelJob(
  service: DbClient,
  args: { jobId: string; workspaceId: string; actor: string },
): Promise<JobState> {
  return check(
    await service.rpc("sor_cancel_job", {
      p_job_id: args.jobId,
      p_workspace_id: args.workspaceId,
      p_actor: args.actor,
    }),
  ) as JobState;
}

const JOB_PUBLIC_COLUMNS =
  "id, job_kind, workspace_id, requested_by, state, terminal_reason, attempt_count, created_at, started_at, completed_at, last_error_code, result, payload, cancel_requested_at";

export async function getWorkspaceJob(service: DbClient, workspaceId: string, jobId: string) {
  return check(
    await service
      .from("job_executions")
      .select(JOB_PUBLIC_COLUMNS)
      .eq("workspace_id", workspaceId)
      .eq("id", jobId)
      .maybeSingle(),
  );
}

export async function listWorkspaceJobs(
  service: DbClient,
  workspaceId: string,
  kinds: JobKind[],
  limit = 20,
) {
  return (
    check(
      await service
        .from("job_executions")
        .select(JOB_PUBLIC_COLUMNS)
        .eq("workspace_id", workspaceId)
        .in("job_kind", kinds)
        .order("created_at", { ascending: false })
        .limit(limit),
    ) ?? []
  );
}

export async function latestProductEnrichment(
  service: DbClient,
  workspaceId: string,
  productId: string,
) {
  return check(
    await service
      .from("job_executions")
      .select(JOB_PUBLIC_COLUMNS)
      .eq("workspace_id", workspaceId)
      .eq("job_kind", "product_enrichment")
      .eq("payload->>product_id", productId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
}

// ------------------------------------------------------------------ worker RPCs
export interface QueueMessage {
  msg_id: number;
  read_ct: number;
  message: Json;
}

export async function workerRead(
  service: DbClient,
  qty: number,
  vtSeconds: number,
): Promise<QueueMessage[]> {
  return check(await service.rpc("sor_worker_read", { p_qty: qty, p_vt_seconds: vtSeconds })) ?? [];
}

export async function workerClaim(
  service: DbClient,
  jobId: string,
  workerId: string,
  leaseSeconds: number,
): Promise<JobRow | null> {
  const rows = check(
    await service.rpc("sor_worker_claim", {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_lease_seconds: leaseSeconds,
    }),
  );
  return (rows as JobRow[] | null)?.[0] ?? null;
}

export async function workerHeartbeat(
  service: DbClient,
  args: { jobId: string; workerId: string; leaseSeconds: number; messageId: number | null },
): Promise<boolean> {
  const cancelRequested = check(
    await service.rpc("sor_worker_heartbeat", {
      p_job_id: args.jobId,
      p_worker_id: args.workerId,
      p_lease_seconds: args.leaseSeconds,
      p_message_id: args.messageId as number,
    }),
  );
  return cancelRequested === true;
}

export async function workerRetry(
  service: DbClient,
  args: {
    jobId: string;
    workerId: string;
    delaySeconds: number;
    errorCode: string;
    errorMessage: string;
  },
): Promise<void> {
  check(
    await service.rpc("sor_worker_retry", {
      p_job_id: args.jobId,
      p_worker_id: args.workerId,
      p_delay_seconds: args.delaySeconds,
      p_error_code: args.errorCode,
      p_error_message: args.errorMessage,
    }),
  );
}

/** Gives a running job back on a planned shutdown (attempt returned, message visible at once). */
export async function workerRelease(
  service: DbClient,
  args: { jobId: string; workerId: string; reason: string },
): Promise<void> {
  check(
    await service.rpc("sor_worker_release", {
      p_job_id: args.jobId,
      p_worker_id: args.workerId,
      p_reason: args.reason,
    }),
  );
}

export async function workerFinish(
  service: DbClient,
  args: {
    jobId: string;
    workerId: string;
    state: JobState;
    terminalReason: TerminalReason;
    errorCode?: string | null;
    errorMessage?: string | null;
    result?: JsonValue;
    usage?: JsonValue;
  },
): Promise<void> {
  check(
    await service.rpc("sor_worker_finish", {
      p_job_id: args.jobId,
      p_worker_id: args.workerId,
      p_state: args.state,
      p_terminal_reason: args.terminalReason,
      p_error_code: args.errorCode ?? (null as unknown as string),
      p_error_message: args.errorMessage ?? (null as unknown as string),
      ...(args.result !== undefined ? { p_result: args.result } : {}),
      ...(args.usage !== undefined ? { p_usage: args.usage } : {}),
    }),
  );
}

export async function workerRequeueOrphans(
  service: DbClient,
  olderThanSeconds: number,
): Promise<number> {
  return Number(
    check(
      await service.rpc("sor_worker_requeue_orphans", { p_older_than_seconds: olderThanSeconds }),
    ) ?? 0,
  );
}

export async function workerFinishPoison(
  service: DbClient,
  messageId: number,
  reason: string,
): Promise<void> {
  check(
    await service.rpc("sor_worker_finish_poison", { p_message_id: messageId, p_reason: reason }),
  );
}

// ------------------------------------------------------------------ agent steps and usage
export type StepRow = Database["public"]["Tables"]["agent_step_runs"]["Row"];

export async function getStep(
  service: DbClient,
  jobId: string,
  agentKey: string,
  stepKey: string,
): Promise<StepRow | null> {
  return check(
    await service
      .from("agent_step_runs")
      .select("*")
      .eq("job_execution_id", jobId)
      .eq("agent_key", agentKey)
      .eq("step_key", stepKey)
      .maybeSingle(),
  );
}

/** Thrown when a newer attempt owns the job or the step (S7.5a): handled as a lost lease. */
function takenOver(what: string): DbError {
  return new DbError("INVALID_STATE", {
    message: `LEASE_LOST: ${what} taken over by a newer attempt`,
  });
}

/**
 * Starts (or restarts) a step atomically (S7.5b): in one transaction with the
 * job row locked, the step starts only if `workerId` still holds the lease
 * for `attempt`, and a row owned by a newer attempt is never reset. A worker
 * that froze past its lease gets LEASE_LOST (handled as a lost lease).
 */
export async function startStep(
  service: DbClient,
  args: {
    jobId: string;
    workerId: string;
    attempt: number;
    agentKey: string;
    stepKey: string;
    contractVersion: string;
    promptVersion: string | null;
    inputHash: string;
  },
): Promise<string> {
  const id = check(
    await service.rpc("sor_step_start", {
      p_job_id: args.jobId,
      p_worker_id: args.workerId,
      p_attempt: args.attempt,
      p_agent_key: args.agentKey,
      p_step_key: args.stepKey,
      p_contract_version: args.contractVersion,
      p_prompt_version: args.promptVersion as string,
      p_input_hash: args.inputHash,
    }),
  );
  if (!id) throw new DbError("INTERNAL_ERROR", { step: args.stepKey });
  return id;
}

/**
 * Completes a step only while it is running for this attempt (S7.5a): a
 * stale worker can never overwrite a step completed by a newer attempt.
 */
export async function completeStep(
  service: DbClient,
  stepId: string,
  args: {
    attempt: number;
    output: JsonValue;
    outputHash: string;
    warnings: string[];
    evidenceIds?: string[];
    provider?: string | null;
    model?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    costUsd?: number | null;
    latencyMs?: number | null;
  },
): Promise<void> {
  const rows = check(
    await service
      .from("agent_step_runs")
      .update({
        state: "completed",
        output_json: args.output,
        output_hash: args.outputHash,
        warnings: args.warnings,
        evidence_ids: args.evidenceIds ?? [],
        provider: args.provider ?? null,
        model: args.model ?? null,
        input_tokens: args.inputTokens ?? null,
        output_tokens: args.outputTokens ?? null,
        cost_usd: args.costUsd ?? null,
        latency_ms: args.latencyMs ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", stepId)
      .eq("attempt", args.attempt)
      .eq("state", "running")
      .select("id"),
  );
  if (!rows || rows.length === 0) throw takenOver("step");
}

/** Marks a step failed only while it is running for this attempt (never a newer attempt's step). */
export async function failStep(
  service: DbClient,
  stepId: string,
  attempt: number,
  code: string,
  message: string,
): Promise<void> {
  check(
    await service
      .from("agent_step_runs")
      .update({
        state: "failed",
        error_code: code.slice(0, 100),
        error_message: message.slice(0, 500),
        completed_at: new Date().toISOString(),
      })
      .eq("id", stepId)
      .eq("attempt", attempt)
      .eq("state", "running"),
  );
}

export async function recordProviderUsage(
  service: DbClient,
  row: Database["public"]["Tables"]["provider_usage"]["Insert"],
): Promise<void> {
  check(await service.from("provider_usage").insert(row));
}

export async function readLimits(service: DbClient): Promise<Record<string, number>> {
  const rows = check(await service.from("platform_limits").select("key, value")) ?? [];
  return Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
}

/** Workspace job usage and quotas (S7.2). Membership is checked again in SQL. */
export async function workspaceUsage(
  service: DbClient,
  args: { workspaceId: string; userId: string },
): Promise<Json> {
  return check(
    await service.rpc("sor_workspace_usage", {
      p_workspace_id: args.workspaceId,
      p_user_id: args.userId,
    }),
  );
}
