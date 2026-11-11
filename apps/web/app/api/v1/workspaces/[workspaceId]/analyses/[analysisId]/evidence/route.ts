import { parseId, workspaceRoute } from "@/lib/api/http";
import { analysisEvidence } from "@/lib/services/analyses";

type P = { workspaceId: string; analysisId: string };

export const GET = workspaceRoute<P>("viewer", async ({ client, workspaceId }, p) => ({
  data: await analysisEvidence(client, workspaceId, parseId(p.analysisId)),
}));
