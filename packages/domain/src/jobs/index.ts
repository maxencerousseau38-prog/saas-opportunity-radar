// Job retry classification and backoff (Implementation Blueprint §11).

export type ErrorClass = "transient" | "permanent" | "budget" | "cancelled";

export interface ClassifiedError {
  class: ErrorClass;
  retryable: boolean;
  code: string;
  message: string;
}

/** Errors thrown by job handlers carry an explicit class when they know it. */
export class JobError extends Error {
  readonly errorClass: ErrorClass;
  readonly code: string;
  constructor(errorClass: ErrorClass, code: string, message: string) {
    super(message);
    this.name = "JobError";
    this.errorClass = errorClass;
    this.code = code;
  }
}

const PERMANENT_CODES = new Set([
  "VALIDATION_ERROR",
  "EXCLUDED_SUBJECT",
  "EVIDENCE_SCOPE_VIOLATION",
  "SCHEMA_INVALID",
  "UNKNOWN_CITED_ID",
  "NOT_FOUND",
  "FORBIDDEN",
]);

/** HTTP status → class: 408, 429 and 5xx are transient; other 4xx are permanent. */
export function classifyHttpStatus(status: number): ErrorClass {
  if (status === 408 || status === 429 || status >= 500) return "transient";
  return "permanent";
}

export function classifyError(error: unknown): ClassifiedError {
  if (error instanceof JobError) {
    return {
      class: error.errorClass,
      retryable: error.errorClass === "transient",
      code: error.code,
      message: error.message.slice(0, 500),
    };
  }
  const e = error as { code?: unknown; status?: unknown; name?: unknown; message?: unknown };
  const code = typeof e?.code === "string" ? e.code : "INTERNAL_ERROR";
  const message = typeof e?.message === "string" ? e.message.slice(0, 500) : "Unexpected error";
  if (e?.name === "AbortError" || e?.name === "TimeoutError") {
    return { class: "transient", retryable: true, code: "TIMEOUT", message };
  }
  if (typeof e?.status === "number") {
    const c = classifyHttpStatus(e.status);
    return { class: c, retryable: c === "transient", code: `HTTP_${e.status}`, message };
  }
  if (PERMANENT_CODES.has(code)) return { class: "permanent", retryable: false, code, message };
  // Network failures and unknown errors are retried; attempts are bounded by max_attempts.
  return { class: "transient", retryable: true, code, message };
}

/** backoff = min(base × 2^attempt, cap) + jitter, in seconds. */
export function backoffSeconds(
  attempt: number,
  options: { baseSeconds?: number; capSeconds?: number; random?: () => number } = {},
): number {
  const base = options.baseSeconds ?? 5;
  const cap = options.capSeconds ?? 600;
  const random = options.random ?? Math.random;
  const exp = Math.min(base * 2 ** Math.max(0, attempt - 1), cap);
  return Math.round(exp + random() * Math.min(base, exp));
}

export interface Budget {
  maxCostUsd: number;
  spentCostUsd: number;
  maxExternalRequests: number;
  externalRequestsUsed: number;
  deadlineAt: string;
}

/** The reason a budget forbids the next unit of work, or null. */
export function budgetBlock(
  budget: Budget,
  next: { costUsd?: number; externalRequests?: number },
  now: Date = new Date(),
): "cost" | "requests" | "time" | null {
  if (now.getTime() >= Date.parse(budget.deadlineAt)) return "time";
  if (budget.externalRequestsUsed + (next.externalRequests ?? 0) > budget.maxExternalRequests) {
    return "requests";
  }
  if (budget.spentCostUsd + (next.costUsd ?? 0) > budget.maxCostUsd + 1e-9) return "cost";
  return null;
}
