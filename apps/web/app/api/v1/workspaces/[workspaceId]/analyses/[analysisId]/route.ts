import { parseId, workspaceRoute } from "@/lib/api/http";
import { deleteAnalysis, getAnalysis } from "@/lib/services/analyses";

type P = { workspaceId: string; analysisId: string };

export const GET = workspaceRoute<P>("viewer", async ({ client, workspaceId }, p) => ({
  data: await getAnalysis(client, workspaceId, parseId(p.analysisId)),
}));

/** Admin only, finished analyses only, audit-logged (PRD §14.4). */
export const DELETE = workspaceRoute<P>(
  "admin",
  async ({ client, workspaceId, user, requestId }, p) => {
    await deleteAnalysis({
      client,
      workspaceId,
      userId: user.id,
      analysisId: parseId(p.analysisId),
      requestId,
    });
    return undefined;
  },
);
