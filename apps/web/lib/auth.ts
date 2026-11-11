// Session helpers for pages and server actions.
import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { listMemberships, serverRepo, type DbClient } from "@sor/database";
import { createUserServerClient, getServiceClient } from "@/lib/supabase/server";

export interface SessionUser {
  id: string;
  email: string | null;
}

/** The verified user (Auth server round trip), or null. */
export const getSession = cache(
  async (): Promise<{ client: DbClient; user: SessionUser | null }> => {
    const client = await createUserServerClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return { client, user: null };
    return { client, user: { id: data.user.id, email: data.user.email ?? null } };
  },
);

export async function requireUser(): Promise<{ client: DbClient; user: SessionUser }> {
  const { client, user } = await getSession();
  if (!user) redirect("/login");
  return { client, user };
}

export const getMemberships = cache(async (userId: string) => {
  const { client } = await getSession();
  return listMemberships(client, userId);
});

export const isOperator = cache(async (userId: string) =>
  serverRepo.isPlatformOperator(getServiceClient(), userId),
);

export type OperatorAccess = "none" | "mfa_required" | "granted";

/**
 * PD-30 (7 Nov 2026): the operator console and API need an MFA-verified
 * session (AAL2, TOTP). The assurance level is read from the verified JWT
 * claims (getClaims verifies the token), never from an unverified cookie.
 */
export async function operatorAccess(client: DbClient, userId: string): Promise<OperatorAccess> {
  if (!(await isOperator(userId))) return "none";
  const { data, error } = await client.auth.getClaims();
  if (error || !data || data.claims.sub !== userId) return "mfa_required";
  return data.claims.aal === "aal2" ? "granted" : "mfa_required";
}
