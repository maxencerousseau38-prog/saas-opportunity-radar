// Route-handler plumbing (Implementation Blueprint §10): authentication,
// workspace role, Zod validation, request id, stable error envelope (§4.11).
// Handlers stay thin: parse → authenticate → authorise → service → DTO.
import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { API_ERROR_HTTP_STATUS, type ApiErrorCode, UUIDSchema } from "@sor/contracts";
import { DbError, workspaceRepo, type DbClient } from "@sor/database";
import { UnsupportedFilterError } from "@sor/domain";
import { createUserServerClient } from "@/lib/supabase/server";
import type { SessionUser } from "@/lib/auth";

export type Role = "owner" | "admin" | "member" | "viewer";
const RANK: Record<Role, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message ?? code);
    this.name = "ApiError";
  }
}

const SAFE_MESSAGES: Record<ApiErrorCode, string> = {
  VALIDATION_ERROR: "Requête invalide",
  UNAUTHENTICATED: "Authentification requise",
  FORBIDDEN: "Action non autorisée",
  NOT_FOUND: "Ressource introuvable",
  IDEMPOTENCY_CONFLICT: "Clé d'idempotence déjà utilisée avec un autre contenu",
  INVALID_STATE: "Action impossible dans l'état actuel",
  EXCLUDED_SUBJECT: "Sujet exclu",
  EVIDENCE_SCOPE_VIOLATION: "Preuve hors périmètre",
  RATE_LIMITED: "Trop de requêtes",
  LIMIT_EXCEEDED: "Limite atteinte",
  UPSTREAM_UNAVAILABLE: "Service indisponible",
  INTERNAL_ERROR: "Erreur inattendue",
};

function errorResponse(requestId: string, err: unknown): NextResponse {
  let code: ApiErrorCode = "INTERNAL_ERROR";
  let message: string | undefined;
  let details: Record<string, unknown> | undefined;
  if (err instanceof ApiError) {
    code = err.code;
    message = err.message !== err.code ? err.message : undefined;
    details = err.details;
  } else if (err instanceof DbError) {
    code = err.code;
  } else if (err instanceof z.ZodError) {
    code = "VALIDATION_ERROR";
    details = {
      issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    };
  } else if (err instanceof UnsupportedFilterError) {
    code = "VALIDATION_ERROR";
    message = "Filtre ou tri pas encore disponible";
    details = { unsupported: err.keys };
  }
  if (code === "INTERNAL_ERROR") {
    console.error(JSON.stringify({ level: "error", request_id: requestId, error: String(err) }));
  }
  return NextResponse.json(
    {
      error: {
        code,
        message: message ?? SAFE_MESSAGES[code],
        ...(details ? { details } : {}),
        request_id: requestId,
      },
    },
    { status: API_ERROR_HTTP_STATUS[code], headers: { "x-request-id": requestId } },
  );
}

export interface RouteEnv {
  requestId: string;
  client: DbClient;
  user: SessionUser;
  request: Request;
}

export interface WorkspaceRouteEnv extends RouteEnv {
  workspaceId: string;
  role: Role;
}

/** Same-origin JSON for state-changing requests (CSRF defence in depth). */
function assertSafeMutation(request: Request): void {
  if (request.method === "GET" || request.method === "HEAD") return;
  const origin = request.headers.get("origin");
  if (origin !== null) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    let originHost: string | null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (originHost !== host) throw new ApiError("FORBIDDEN", "Origine refusée");
  }
  const type = request.headers.get("content-type");
  const length = request.headers.get("content-length");
  const hasBody = (length !== null && length !== "0") || request.headers.has("transfer-encoding");
  if (hasBody && !type?.toLowerCase().startsWith("application/json")) {
    throw new ApiError("VALIDATION_ERROR", "Content-Type application/json requis");
  }
}

async function authenticate(request: Request): Promise<Omit<RouteEnv, "requestId">> {
  assertSafeMutation(request);
  const client = await createUserServerClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new ApiError("UNAUTHENTICATED");
  return { client, user: { id: data.user.id, email: data.user.email ?? null }, request };
}

function respond(requestId: string, result: unknown, status = 200): Response {
  if (result instanceof Response) {
    result.headers.set("x-request-id", requestId);
    return result;
  }
  if (result === undefined) {
    return new NextResponse(null, { status: 204, headers: { "x-request-id": requestId } });
  }
  return NextResponse.json(result, { status, headers: { "x-request-id": requestId } });
}

/** Authenticated route (no workspace). */
export function route<P>(handler: (env: RouteEnv, params: P) => Promise<unknown>) {
  return async (request: Request, ctx: { params: Promise<P> }): Promise<Response> => {
    const requestId = randomUUID();
    try {
      const env = { ...(await authenticate(request)), requestId };
      return respond(requestId, await handler(env, await ctx.params));
    } catch (err) {
      return errorResponse(requestId, err);
    }
  };
}

/** Route under /workspaces/{workspaceId}: membership and minimum role are checked first. */
export function workspaceRoute<P extends { workspaceId: string }>(
  minRole: Role,
  handler: (env: WorkspaceRouteEnv, params: P) => Promise<unknown>,
  options: { status?: number } = {},
) {
  return async (request: Request, ctx: { params: Promise<P> }): Promise<Response> => {
    const requestId = randomUUID();
    try {
      const base = await authenticate(request);
      const params = await ctx.params;
      const workspaceId = UUIDSchema.safeParse(params.workspaceId);
      if (!workspaceId.success) throw new ApiError("NOT_FOUND");
      const role = await workspaceRepo.getMemberRole(base.client, workspaceId.data, base.user.id);
      // A non-member gets 404, not 403: the workspace's existence is not disclosed.
      if (!role) throw new ApiError("NOT_FOUND");
      if (RANK[role] < RANK[minRole]) throw new ApiError("FORBIDDEN");
      const env = { ...base, requestId, workspaceId: workspaceId.data, role };
      return respond(requestId, await handler(env, params), options.status);
    } catch (err) {
      return errorResponse(requestId, err);
    }
  };
}

/** Parses the JSON body with a Zod schema (empty body = `{}`). */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T,
  options: { maxBytes?: number } = {},
): Promise<z.infer<T>> {
  const text = await request.text();
  if (text.length > (options.maxBytes ?? 100_000)) {
    throw new ApiError("VALIDATION_ERROR", "Corps de requête trop volumineux");
  }
  let json: unknown = {};
  if (text.trim().length > 0) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new ApiError("VALIDATION_ERROR", "JSON invalide");
    }
  }
  return schema.parse(json);
}

export function parseId(value: string): string {
  const parsed = UUIDSchema.safeParse(value);
  if (!parsed.success) throw new ApiError("NOT_FOUND");
  return parsed.data;
}

export function hasRole(role: Role, minRole: Role): boolean {
  return RANK[role] >= RANK[minRole];
}

/** Idempotency-Key header of job-creating POSTs (Implementation Blueprint §10). */
export function idempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[A-Za-z0-9_.:-]{8,200}$/.test(key)) {
    throw new ApiError("VALIDATION_ERROR", "En-tête Idempotency-Key requis (8 à 200 caractères)");
  }
  return key;
}
