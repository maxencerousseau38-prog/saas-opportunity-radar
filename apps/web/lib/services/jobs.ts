// Job-creating requests (Implementation Blueprint §10, §11): the API never
// runs long work; it validates, then creates a job through the service-role
// RPC (atomic insert + queue message) and answers 202.
import "server-only";
import { createHash } from "node:crypto";
import {
  WorkspaceUsageSchema,
  type JobKind,
  type JobStatus,
  type WorkspaceUsage,
} from "@sor/contracts";
import { jobsRepo } from "@sor/database";
import { getServiceClient } from "@/lib/supabase/server";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function requestHash(kind: string, payload: unknown): string {
  return createHash("sha256").update(canonical({ kind, payload })).digest("hex");
}

export async function createJob(args: {
  kind: Extract<
    JobKind,
    "product_enrichment" | "catalog_import" | "feedback_import" | "report_export"
  >;
  workspaceId: string;
  userId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}) {
  const { jobId, created } = await jobsRepo.requestJob(getServiceClient(), {
    kind: args.kind,
    workspaceId: args.workspaceId,
    requestedBy: args.userId,
    idempotencyKey: args.idempotencyKey,
    requestHash: requestHash(args.kind, args.payload),
    payload: args.payload as never,
  });
  return { jobId, created };
}

type JobRowPublic = NonNullable<Awaited<ReturnType<typeof jobsRepo.getWorkspaceJob>>>;

/** Job DTO: never exposes the payload (it may hold an uploaded CSV). */
export function toJobStatus(workspaceId: string, row: JobRowPublic): JobStatus {
  return {
    id: row.id,
    kind: row.job_kind,
    state: row.state,
    terminal_reason: row.terminal_reason,
    attempt_count: row.attempt_count,
    created_at: row.created_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
    error_code: row.last_error_code,
    result: (row.result ?? {}) as Record<string, unknown>,
    status_url: `/api/v1/workspaces/${workspaceId}/jobs/${row.id}`,
  };
}

export function accepted(workspaceId: string, jobId: string, created: boolean) {
  return Response.json(
    {
      data: {
        id: jobId,
        status: "queued",
        status_url: `/api/v1/workspaces/${workspaceId}/jobs/${jobId}`,
        created,
      },
    },
    { status: 202 },
  );
}

/** Upper bound of data rows for the RPC's size check; the worker counts exactly. */
export function roughRowCount(csv: string): number {
  return Math.max(0, csv.split(/\r?\n/).filter((l) => l.trim() !== "").length - 1);
}

/** Job usage and quotas of a workspace, for the caller (S7.2; PRD §14.3). */
export async function workspaceUsage(workspaceId: string, userId: string): Promise<WorkspaceUsage> {
  const raw = await jobsRepo.workspaceUsage(getServiceClient(), { workspaceId, userId });
  return WorkspaceUsageSchema.parse(raw);
}
