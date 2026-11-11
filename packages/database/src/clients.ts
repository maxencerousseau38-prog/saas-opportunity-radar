// Supabase clients for trusted server code only (web route handlers and the
// worker). Never import this package from browser code: the server client
// carries the secret key, which bypasses RLS (CLAUDE.md §7).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./generated";

export type DbClient = SupabaseClient<Database>;

const NO_SESSION = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

function assertServerRuntime(): void {
  if (typeof (globalThis as { window?: unknown }).window !== "undefined") {
    throw new Error("@sor/database is server-only and must never run in a browser");
  }
}

/**
 * Server/worker client (secret key): bypasses RLS. Use only after authorisation.
 * `fetch` replaces the HTTP transport (fault-injection tests, S7.5b F4).
 */
export function createServiceClient(config: {
  url: string;
  secretKey: string;
  fetch?: typeof fetch;
}): DbClient {
  assertServerRuntime();
  return createClient<Database>(config.url, config.secretKey, {
    auth: NO_SESSION,
    ...(config.fetch ? { global: { fetch: config.fetch } } : {}),
  });
}

/**
 * Client acting as a signed-in user: RLS applies with the user's identity.
 * `accessToken` is the user's verified Supabase session token.
 */
export function createUserClient(config: {
  url: string;
  publishableKey: string;
  accessToken: string;
}): DbClient {
  assertServerRuntime();
  return createClient<Database>(config.url, config.publishableKey, {
    auth: NO_SESSION,
    global: { headers: { Authorization: `Bearer ${config.accessToken}` } },
  });
}
