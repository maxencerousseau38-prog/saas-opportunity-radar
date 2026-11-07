import { serverRepo } from "@sor/database";
import { route } from "@/lib/api/http";
import { getServiceClient } from "@/lib/supabase/server";
import { requireOperator } from "../guard";

export const GET = route(async ({ client, user }) => {
  await requireOperator({ client, user });
  return { data: await serverRepo.listExclusionReviews(getServiceClient()) };
});
