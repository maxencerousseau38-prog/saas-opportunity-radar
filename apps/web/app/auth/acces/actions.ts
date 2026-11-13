"use server";
import { getServerEnv } from "@/lib/env";
import { ownerSecretMatches } from "@/lib/owner-access";
import { createUserServerClient, getServiceClient } from "@/lib/supabase/server";

export type OwnerAccessResult = "ok" | "disabled" | "refused" | "error";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Signs the product owner in from the personal secret link (PD-39). Disabled
 * unless OWNER_ACCESS_TOKEN and OWNER_ACCESS_EMAIL are both set. The session
 * is an ordinary password-less session of that one account: RLS, roles and
 * the operator MFA requirement (AAL2) are unchanged.
 */
export async function ownerSignIn(secret: unknown): Promise<OwnerAccessResult> {
  const env = getServerEnv();
  if (!env.OWNER_ACCESS_TOKEN || !env.OWNER_ACCESS_EMAIL) return "disabled";
  if (!ownerSecretMatches(secret, env.OWNER_ACCESS_TOKEN)) {
    await pause(500);
    return "refused";
  }
  const service = getServiceClient();
  const { data, error } = await service.auth.admin.generateLink({
    type: "magiclink",
    email: env.OWNER_ACCESS_EMAIL,
  });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) return "error";
  const client = await createUserServerClient();
  const verified = await client.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (verified.error || !verified.data.user) return "error";
  await service.from("audit_logs").insert({
    actor_user_id: verified.data.user.id,
    actor_kind: "server",
    action: "auth.owner_access",
    resource_type: "auth_session",
    metadata: {},
  });
  return "ok";
}
