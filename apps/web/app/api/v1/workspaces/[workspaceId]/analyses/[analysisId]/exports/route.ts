import { ReportExportRequestSchema } from "@sor/contracts";
import { idempotencyKey, parseBody, parseId, workspaceRoute } from "@/lib/api/http";
import { listExports, requestExport } from "@/lib/services/analyses";
import { accepted } from "@/lib/services/jobs";

type P = { workspaceId: string; analysisId: string };

export const GET = workspaceRoute<P>("viewer", async ({ client, workspaceId }, p) => ({
  data: await listExports(client, workspaceId, parseId(p.analysisId)),
}));

/** report_export job (JSON or Markdown, PD-18 A), 202. */
export const POST = workspaceRoute<P>(
  "member",
  async ({ client, workspaceId, user, request }, p) => {
    const key = idempotencyKey(request);
    const body = await parseBody(request, ReportExportRequestSchema);
    const { jobId, created } = await requestExport({
      client,
      workspaceId,
      userId: user.id,
      analysisId: parseId(p.analysisId),
      idempotencyKey: key,
      format: body.format,
    });
    return accepted(workspaceId, jobId, created);
  },
);
