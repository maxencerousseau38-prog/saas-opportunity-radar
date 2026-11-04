// Supabase clients for server components, server actions and route handlers.
import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient, type Database, type DbClient } from "@sor/database";
import { getServerEnv } from "@/lib/env";

/**
 * Client acting as the signed-in user (session cookies, RLS applies).
 * Cookie writes fail silently in server components; proxy.ts refreshes them.
 */
export async function createUserServerClient(): Promise<DbClient> {
  // Reading cookies first makes every caller dynamic (no prerendering with secrets).
  const store = await cookies();
  const env = getServerEnv();
  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list) store.set(name, value, options);
          } catch {
            // Called from a server component: proxy.ts persists refreshed cookies.
          }
        },
      },
    },
  ) as unknown as DbClient;
}

let service: DbClient | undefined;

/** Secret-key client: bypasses RLS. Only after the caller was authorised. */
export function getServiceClient(): DbClient {
  const env = getServerEnv();
  service ??= createServiceClient({
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    secretKey: env.SUPABASE_SECRET_KEY,
  });
  return service;
}
