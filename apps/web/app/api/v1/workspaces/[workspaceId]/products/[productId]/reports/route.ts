import { CorrectionReportSchema } from "@sor/contracts";
import { serverRepo, workspaceRepo } from "@sor/database";
import { parseBody, parseId, workspaceRoute } from "@/lib/api/http";
import { getServiceClient } from "@/lib/supabase/server";

type P = { workspaceId: string; productId: string };

export const POST = workspaceRoute<P>(
  "member",
  async ({ client, workspaceId, user, request }, p) => {
    const body = await parseBody(request, CorrectionReportSchema);
    // Hourly limit per user (S7.4d); refused requests answer 429 + Retry-After.
    await serverRepo.consumeRateLimit(getServiceClient(), "correction_report", user.id);
    return {
      data: await workspaceRepo.createCorrectionReport(
        client,
        workspaceId,
        parseId(p.productId),
        user.id,
        body,
      ),
    };
  },
  { status: 201 },
);
