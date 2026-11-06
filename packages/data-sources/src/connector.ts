// Source connector contract (Implementation Blueprint §5.1).
import type { SourceDocument } from "@sor/contracts/evidence";

export interface ConnectorCapabilities {
  search: boolean;
  fetchDocument: boolean;
  fetchReviews: boolean;
  officialSource: boolean;
  rateLimitPerMinute?: number;
  quotaPerDay?: number;
}

export type ConnectorFailureStatus =
  "blocked" | "unavailable" | "not_supported" | "rate_limited" | "error";

export type ConnectorOutcome<T> =
  | { status: "ok"; data: T }
  | { status: ConnectorFailureStatus; reason: string; retryable: boolean; retryAfterMs?: number };

export interface SourceSearchRequest {
  query: string;
  limit: number;
  locale?: string;
  cursor?: string;
}

export interface SourceSearchResult {
  url: string;
  title: string;
  snippet?: string;
  publishedAt?: string | null;
  externalId?: string | null;
  /** Page of the source that gave the result (e.g. the HN item page). */
  referenceUrl?: string | null;
  /** Small metadata allowed by the source's storage policy. */
  metadata?: Record<string, string | number | null>;
}

export interface SourceConnector {
  readonly sourceKey: string;
  getCapabilities(): ConnectorCapabilities;
  search(
    input: SourceSearchRequest,
    signal: AbortSignal,
  ): Promise<ConnectorOutcome<SourceSearchResult[]>>;
  fetchDocument(url: string, signal: AbortSignal): Promise<ConnectorOutcome<SourceDocument>>;
  fetchReviews?(
    productRef: string,
    signal: AbortSignal,
  ): Promise<ConnectorOutcome<SourceDocument[]>>;
}

export function failure(
  status: ConnectorFailureStatus,
  reason: string,
  retryable: boolean,
  retryAfterMs?: number,
): ConnectorOutcome<never> {
  return retryAfterMs === undefined
    ? { status, reason, retryable }
    : { status, reason, retryable, retryAfterMs };
}
