// Safe, user-facing description of a refused job request (S7.2): which limit
// applied and when to retry. Never reveals data of other workspaces or users.
import type { DbError, LimitKind } from "@sor/database";

export const LIMIT_MESSAGES: Record<LimitKind, string> = {
  concurrent_jobs:
    "Trop de traitements en cours dans ce workspace : attendez la fin de l’un d’eux.",
  daily_jobs: "Quota quotidien de traitements du workspace atteint (remise à zéro à minuit UTC).",
  job_posts: "Trop de demandes de traitement en une heure : réessayez plus tard.",
  workspaces: "Nombre maximal de workspaces atteint.",
  invitations: "Trop d’invitations envoyées pour ce workspace en une heure : réessayez plus tard.",
  manual_additions: "Trop d’ajouts manuels au catalogue en une heure : réessayez plus tard.",
  correction_reports: "Trop de signalements en une heure : réessayez plus tard.",
};

export interface LimitResponse {
  message?: string;
  details?: Record<string, unknown>;
  /** Value of the Retry-After header, in seconds. */
  retryAfter?: number;
}

export function limitResponse(err: Pick<DbError, "limit" | "retryAfterSeconds">): LimitResponse {
  const out: LimitResponse = {};
  if (err.limit) {
    out.message = LIMIT_MESSAGES[err.limit];
    out.details = { limit: err.limit };
  }
  if (err.retryAfterSeconds !== undefined) {
    out.retryAfter = err.retryAfterSeconds;
    out.details = { ...out.details, retry_after_seconds: err.retryAfterSeconds };
  }
  return out;
}
