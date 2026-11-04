import { serverRepo } from "@sor/database";
import { route } from "@/lib/api/http";
import { getServiceClient } from "@/lib/supabase/server";
import { requireOperator } from "../guard";

export const GET = route(async ({ user, request }) => {
  await requireOperator(user.id);
  const status = new URL(request.url).searchParams.get("status") === "all" ? "all" : "open";
  return { data: await serverRepo.listCorrectionReports(getServiceClient(), status) };
});
