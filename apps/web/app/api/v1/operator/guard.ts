import "server-only";
import type { DbClient } from "@sor/database";
import { ApiError } from "@/lib/api/http";
import { operatorAccess, type SessionUser } from "@/lib/auth";

/**
 * Platform operator only (ADR-007, PD-12 A), with an MFA-verified session
 * (AAL2, PD-30). Non-operators get 404; an operator whose session is not
 * MFA-verified gets 403 with `mfa_required`.
 */
export async function requireOperator(env: { client: DbClient; user: SessionUser }): Promise<void> {
  const access = await operatorAccess(env.client, env.user.id);
  if (access === "none") throw new ApiError("NOT_FOUND");
  if (access === "mfa_required")
    throw new ApiError("FORBIDDEN", "Vérification en deux étapes requise (opérateur)", {
      mfa_required: true,
    });
}
