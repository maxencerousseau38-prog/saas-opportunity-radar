import { discoverAssetsRepo } from "@sor/database";
import { route } from "@/lib/api/http";
import { getServiceClient } from "@/lib/supabase/server";
import { requireOperator } from "../guard";

/** Admitted product visuals, any status (S8.3, ADR-016). */
export const GET = route(async ({ client, user }) => {
  await requireOperator({ client, user });
  return { data: await discoverAssetsRepo.listVisualAssets(getServiceClient()) };
});
