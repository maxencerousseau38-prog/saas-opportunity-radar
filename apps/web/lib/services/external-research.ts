import "server-only";
import {
  ExternalAiDestinationSchema,
  ExternalResearchStrategySchema,
  type CreateExternalResearch,
  type ImportExternalResearchAnswer,
} from "@sor/contracts";
import type { Database, DbClient, Json } from "@sor/database";
import { z } from "zod";
import { ApiError } from "@/lib/api/http";
import {
  buildExternalResearchContext,
  EXTERNAL_CONTEXT_VERSION,
  EXTERNAL_PROMPT_VERSION,
} from "@/lib/ask-ai/context";
import { buildExternalResearchPrompt, selectExternalResearchContext } from "@/lib/ask-ai/prompt";
import { getServiceClient } from "@/lib/supabase/server";
import type { ExternalResearchSessionSummary } from "@/lib/ask-ai/types";

type Session = Database["public"]["Tables"]["external_research_sessions"]["Row"];
type SessionSummary = Pick<
  Session,
  | "id"
  | "workspace_id"
  | "created_by"
  | "subject_type"
  | "subject_snapshot"
  | "destination"
  | "strategy"
  | "status"
  | "created_at"
  | "updated_at"
>;

const ExternalResearchStatusSchema = z.enum(["prompt_ready", "response_imported"]);

function normalizeSessionSummary(row: SessionSummary): ExternalResearchSessionSummary {
  return {
    ...row,
    destination: ExternalAiDestinationSchema.parse(row.destination),
    strategy: ExternalResearchStrategySchema.parse(row.strategy),
    status: ExternalResearchStatusSchema.parse(row.status),
  };
}

const SESSION_COLUMNS =
  "id, workspace_id, created_by, subject_type, subject_snapshot, destination, strategy, included_sections, context_version, context_json, prompt_version, prompt_text, answer_text, notes, status, created_at, updated_at";
const SESSION_LIST_COLUMNS =
  "id, workspace_id, created_by, subject_type, subject_snapshot, destination, strategy, status, created_at, updated_at";

function check<T>(res: { data: T | null; error: { message?: string; code?: string } | null }): T {
  if (res.error || res.data === null) {
    throw new ApiError("INTERNAL_ERROR", undefined, { cause: res.error?.code });
  }
  return res.data;
}

function list<T>(res: {
  data: T[] | null;
  error: { message?: string; code?: string } | null;
}): T[] {
  if (res.error) throw new ApiError("INTERNAL_ERROR", undefined, { cause: res.error.code });
  return res.data ?? [];
}

async function audit(args: {
  workspaceId: string;
  userId: string;
  requestId: string;
  action: string;
  sessionId: string;
}) {
  const { error } = await getServiceClient().from("audit_logs").insert({
    workspace_id: args.workspaceId,
    actor_user_id: args.userId,
    actor_kind: "user",
    action: args.action,
    resource_type: "external_research_session",
    resource_id: args.sessionId,
    request_id: args.requestId,
    metadata: {},
  });
  if (error) throw new ApiError("INTERNAL_ERROR", undefined, { cause: error.code });
}

export async function createExternalResearch(args: {
  client: DbClient;
  workspaceId: string;
  userId: string;
  requestId: string;
  input: CreateExternalResearch;
}) {
  const context = await buildExternalResearchContext(
    args.client,
    args.input.product_ids,
    args.input.included_sections,
  );
  const selectedContext = selectExternalResearchContext(context, args.input.included_sections);
  const prompt = buildExternalResearchPrompt({
    destination: args.input.destination,
    strategy: args.input.strategy,
    subjectLabel: context.subject.label,
    context: selectedContext,
  });
  if (prompt.length > 75_000) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Contexte trop volumineux; retirez des sections ou des produits",
    );
  }
  const service = getServiceClient();
  const row = check<Session>(
    await service
      .from("external_research_sessions")
      .insert({
        workspace_id: args.workspaceId,
        created_by: args.userId,
        subject_type: context.subject.type,
        subject_snapshot: context.subject as unknown as NonNullable<Json>,
        destination: args.input.destination,
        strategy: args.input.strategy,
        included_sections: args.input.included_sections,
        context_version: EXTERNAL_CONTEXT_VERSION,
        context_json: selectedContext as unknown as NonNullable<Json>,
        prompt_version: EXTERNAL_PROMPT_VERSION,
        prompt_text: prompt,
        status: "prompt_ready",
      })
      .select(SESSION_COLUMNS)
      .single(),
  );
  await audit({
    workspaceId: args.workspaceId,
    userId: args.userId,
    requestId: args.requestId,
    action: "external_research.create",
    sessionId: row.id,
  });
  return { data: row };
}

export async function listExternalResearch(client: DbClient, workspaceId: string) {
  const rows = list<SessionSummary>(
    await client
      .from("external_research_sessions")
      .select(SESSION_LIST_COLUMNS)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(30),
  );
  return rows.map(normalizeSessionSummary);
}

export async function getExternalResearch(
  client: DbClient,
  workspaceId: string,
  sessionId: string,
) {
  const row = await client
    .from("external_research_sessions")
    .select(SESSION_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("id", sessionId)
    .maybeSingle();
  if (row.error) throw new ApiError("INTERNAL_ERROR", undefined, { cause: row.error.code });
  if (!row.data) throw new ApiError("NOT_FOUND");
  return row.data;
}

async function serviceSession(workspaceId: string, sessionId: string) {
  const result = await getServiceClient()
    .from("external_research_sessions")
    .select(SESSION_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("id", sessionId)
    .maybeSingle();
  if (result.error) throw new ApiError("INTERNAL_ERROR", undefined, { cause: result.error.code });
  if (!result.data) throw new ApiError("NOT_FOUND");
  return result.data;
}

function assertOwnerOrAdmin(session: Session, userId: string, role: string) {
  if (session.created_by !== userId && role !== "owner" && role !== "admin") {
    throw new ApiError("FORBIDDEN");
  }
}

export async function importExternalResearchAnswer(args: {
  workspaceId: string;
  sessionId: string;
  userId: string;
  role: string;
  requestId: string;
  input: ImportExternalResearchAnswer;
}) {
  const current = await serviceSession(args.workspaceId, args.sessionId);
  assertOwnerOrAdmin(current, args.userId, args.role);
  const updated = check(
    await getServiceClient()
      .from("external_research_sessions")
      .update({
        answer_text: args.input.answer_text,
        notes: args.input.notes ?? null,
        status: "response_imported",
      })
      .eq("workspace_id", args.workspaceId)
      .eq("id", args.sessionId)
      .select(SESSION_COLUMNS)
      .single(),
  );
  await audit({
    workspaceId: args.workspaceId,
    userId: args.userId,
    requestId: args.requestId,
    action: "external_research.import_answer",
    sessionId: args.sessionId,
  });
  return { data: updated };
}

export async function deleteExternalResearch(args: {
  workspaceId: string;
  sessionId: string;
  userId: string;
  role: string;
  requestId: string;
}) {
  const current = await serviceSession(args.workspaceId, args.sessionId);
  assertOwnerOrAdmin(current, args.userId, args.role);
  const { error } = await getServiceClient()
    .from("external_research_sessions")
    .delete()
    .eq("workspace_id", args.workspaceId)
    .eq("id", args.sessionId);
  if (error) throw new ApiError("INTERNAL_ERROR", undefined, { cause: error.code });
  await audit({
    workspaceId: args.workspaceId,
    userId: args.userId,
    requestId: args.requestId,
    action: "external_research.delete",
    sessionId: args.sessionId,
  });
}
