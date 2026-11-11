import { serverRepo } from "@sor/database";
import { route } from "@/lib/api/http";
import { getServiceClient } from "@/lib/supabase/server";
import { requireOperator } from "../guard";

export const GET = route(async ({ client, user, request }) => {
  await requireOperator({ client, user });
  const status = new URL(request.url).searchParams.get("status") === "all" ? "all" : "open";
  return { data: await serverRepo.listCorrectionReports(getServiceClient(), status) };
});
