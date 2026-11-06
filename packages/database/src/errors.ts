// Maps PostgreSQL / PostgREST errors to the stable API error codes of
// Implementation Blueprint §4.11. The raw database message is kept only as
// `cause` for server-side logs and is never part of the public message.

export type DbErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_STATE"
  | "RATE_LIMITED"
  | "LIMIT_EXCEEDED"
  | "EXCLUDED_SUBJECT"
  | "EVIDENCE_SCOPE_VIOLATION"
  | "INTERNAL_ERROR";

const PUBLIC_MESSAGES: Record<DbErrorCode, string> = {
  VALIDATION_ERROR: "Invalid request",
  UNAUTHENTICATED: "Authentication required",
  FORBIDDEN: "Not allowed",
  NOT_FOUND: "Not found",
  IDEMPOTENCY_CONFLICT: "Idempotency key already used with another payload",
  INVALID_STATE: "The resource is not in a valid state for this operation",
  RATE_LIMITED: "Too many requests",
  LIMIT_EXCEEDED: "Limit reached",
  EXCLUDED_SUBJECT: "This subject is excluded",
  EVIDENCE_SCOPE_VIOLATION: "Evidence outside the allowed scope",
  INTERNAL_ERROR: "Unexpected error",
};

/** Which platform limit refused a request (S7.2); safe to show. */
export type LimitKind = "concurrent_jobs" | "daily_jobs" | "job_posts" | "workspaces";

export interface LimitInfo {
  limit?: LimitKind;
  /** Seconds until the limit window resets, when the database says so. */
  retryAfterSeconds?: number;
}

export class DbError extends Error {
  readonly code: DbErrorCode;
  readonly limit?: LimitKind;
  readonly retryAfterSeconds?: number;
  constructor(code: DbErrorCode, cause?: unknown, info: LimitInfo = {}) {
    super(PUBLIC_MESSAGES[code], { cause });
    this.name = "DbError";
    this.code = code;
    if (info.limit) this.limit = info.limit;
    if (info.retryAfterSeconds !== undefined) this.retryAfterSeconds = info.retryAfterSeconds;
  }
}

const LIMIT_REASONS: Record<string, LimitKind> = {
  "concurrent jobs": "concurrent_jobs",
  "daily jobs": "daily_jobs",
  "job posts": "job_posts",
  workspaces: "workspaces",
};

/** Parses "RATE_LIMITED: job posts retry_after=120" / "LIMIT_EXCEEDED: daily jobs". */
export function parseLimitMessage(message: string): LimitInfo {
  const match = /^(?:RATE_LIMITED|LIMIT_EXCEEDED): ([a-z ]+?)(?: retry_after=(\d+))?$/.exec(
    message,
  );
  if (!match) return {};
  const info: LimitInfo = {};
  const limit = LIMIT_REASONS[match[1] ?? ""];
  if (limit) info.limit = limit;
  if (match[2]) info.retryAfterSeconds = Number(match[2]);
  return info;
}

export interface PostgresLikeError {
  code?: string;
  message?: string;
}

export function mapPostgresError(error: PostgresLikeError): DbError {
  const message = error.message ?? "";
  switch (error.code) {
    case "22023": // invalid_parameter_value (raised by our RPCs)
    case "22P02": // invalid_text_representation (e.g. malformed uuid)
    case "23502": // not_null_violation
    case "23503": // foreign_key_violation
      return new DbError("VALIDATION_ERROR", error);
    case "23514": // check_violation, including our integrity triggers
      if (message.startsWith("EVIDENCE_SCOPE_VIOLATION")) {
        return new DbError("EVIDENCE_SCOPE_VIOLATION", error);
      }
      if (message.startsWith("EXCLUDED_CATEGORY") || message.startsWith("EXCLUDED_SUBJECT")) {
        return new DbError("EXCLUDED_SUBJECT", error);
      }
      return new DbError("VALIDATION_ERROR", error);
    case "23505": // unique_violation
      return new DbError("INVALID_STATE", error);
    case "28000": // invalid_authorization_specification
      return new DbError("UNAUTHENTICATED", error);
    case "42501": // insufficient_privilege, including RLS denials
      return new DbError("FORBIDDEN", error);
    case "P0001": // raise_exception without errcode: our RPCs prefix the message
      if (message.startsWith("IDEMPOTENCY_CONFLICT"))
        return new DbError("IDEMPOTENCY_CONFLICT", error);
      return new DbError("INTERNAL_ERROR", error);
    case "55000": // object_not_in_prerequisite_state (raised by our RPCs)
      return new DbError("INVALID_STATE", error);
    case "P0002": // no_data_found (raised by our RPCs)
      return new DbError("NOT_FOUND", error);
    case "54000": // program_limit_exceeded (platform limits, S7.2 rate limits)
      return new DbError(
        message.startsWith("RATE_LIMITED") ? "RATE_LIMITED" : "LIMIT_EXCEEDED",
        error,
        parseLimitMessage(message),
      );
    case "PGRST116": // PostgREST: no row for .single()
      return new DbError("NOT_FOUND", error);
    default:
      return new DbError("INTERNAL_ERROR", error);
  }
}

/** The worker lost its lease (another worker recovered the job). */
export function isLeaseLost(error: unknown): boolean {
  const cause =
    error instanceof DbError ? (error.cause as { message?: string } | undefined) : undefined;
  return typeof cause?.message === "string" && cause.message.startsWith("LEASE_LOST");
}
