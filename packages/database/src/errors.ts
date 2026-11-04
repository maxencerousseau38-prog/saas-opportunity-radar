// Maps PostgreSQL / PostgREST errors to the stable API error codes of
// Implementation Blueprint §4.11. The raw database message is kept only as
// `cause` for server-side logs and is never part of the public message.

export type DbErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "LIMIT_EXCEEDED"
  | "EXCLUDED_SUBJECT"
  | "EVIDENCE_SCOPE_VIOLATION"
  | "INTERNAL_ERROR";

const PUBLIC_MESSAGES: Record<DbErrorCode, string> = {
  VALIDATION_ERROR: "Invalid request",
  UNAUTHENTICATED: "Authentication required",
  FORBIDDEN: "Not allowed",
  NOT_FOUND: "Not found",
  INVALID_STATE: "The resource is not in a valid state for this operation",
  LIMIT_EXCEEDED: "Limit reached",
  EXCLUDED_SUBJECT: "This subject is excluded",
  EVIDENCE_SCOPE_VIOLATION: "Evidence outside the allowed scope",
  INTERNAL_ERROR: "Unexpected error",
};

export class DbError extends Error {
  readonly code: DbErrorCode;
  constructor(code: DbErrorCode, cause?: unknown) {
    super(PUBLIC_MESSAGES[code], { cause });
    this.name = "DbError";
    this.code = code;
  }
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
      if (message.startsWith("EXCLUDED_CATEGORY")) return new DbError("EXCLUDED_SUBJECT", error);
      return new DbError("VALIDATION_ERROR", error);
    case "23505": // unique_violation
      return new DbError("INVALID_STATE", error);
    case "28000": // invalid_authorization_specification
      return new DbError("UNAUTHENTICATED", error);
    case "42501": // insufficient_privilege, including RLS denials
      return new DbError("FORBIDDEN", error);
    case "54000": // program_limit_exceeded (platform limits)
      return new DbError("LIMIT_EXCEEDED", error);
    case "PGRST116": // PostgREST: no row for .single()
      return new DbError("NOT_FOUND", error);
    default:
      return new DbError("INTERNAL_ERROR", error);
  }
}
