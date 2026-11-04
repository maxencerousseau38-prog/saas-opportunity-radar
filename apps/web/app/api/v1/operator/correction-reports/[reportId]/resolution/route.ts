import { OperatorReportResolutionSchema } from "@sor/contracts";
import { serverRepo } from "@sor/database";
import { parseBody, parseId, route } from "@/lib/api/http";
import { getServiceClient } from "@/lib/supabase/server";
import { requireOperator } from "../../../guard";

export const POST = route<{ reportId: string }>(async ({ user, request }, p) => {
  await requireOperator(user.id);
  const body = await parseBody(request, OperatorReportResolutionSchema);
  await serverRepo.resolveCorrectionReport(getServiceClient(), {
    operator: user.id,
    reportId: parseId(p.reportId),
    status: body.status,
    note: body.note,
  });
});
