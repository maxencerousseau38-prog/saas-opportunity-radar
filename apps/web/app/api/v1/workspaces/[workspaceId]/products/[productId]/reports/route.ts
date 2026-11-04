import { CorrectionReportSchema } from "@sor/contracts";
import { workspaceRepo } from "@sor/database";
import { parseBody, parseId, workspaceRoute } from "@/lib/api/http";

type P = { workspaceId: string; productId: string };

export const POST = workspaceRoute<P>(
  "member",
  async ({ client, workspaceId, user, request }, p) => {
    const body = await parseBody(request, CorrectionReportSchema);
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
