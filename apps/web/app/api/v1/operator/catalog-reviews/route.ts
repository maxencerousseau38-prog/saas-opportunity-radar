import { serverRepo } from "@sor/database";
import { route } from "@/lib/api/http";
import { getServiceClient } from "@/lib/supabase/server";
import { requireOperator } from "../guard";

/** Open catalog listing reviews (S8.2), oldest first. */
export const GET = route(async ({ client, user }) => {
  await requireOperator({ client, user });
  return { data: await serverRepo.listCatalogReviews(getServiceClient()) };
});
