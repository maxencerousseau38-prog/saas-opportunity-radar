import { parseId, workspaceRoute } from "@/lib/api/http";
import { analysisProgress } from "@/lib/services/analyses";

type P = { workspaceId: string; analysisId: string };

export const GET = workspaceRoute<P>("viewer", async ({ client, workspaceId }, p) => ({
  data: await analysisProgress(client, workspaceId, parseId(p.analysisId)),
}));
