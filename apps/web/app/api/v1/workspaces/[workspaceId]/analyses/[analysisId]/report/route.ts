import { parseId, workspaceRoute } from "@/lib/api/http";
import { analysisReport } from "@/lib/services/analyses";

type P = { workspaceId: string; analysisId: string };

export const GET = workspaceRoute<P>("viewer", async ({ client, workspaceId }, p) => ({
  data: await analysisReport(client, workspaceId, parseId(p.analysisId)),
}));
