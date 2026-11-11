import { parseId, workspaceRoute } from "@/lib/api/http";
import { deleteRun, getRun } from "@/lib/services/pain-points";

type P = { workspaceId: string; runId: string };

export const GET = workspaceRoute<P>("viewer", async ({ client, workspaceId }, p) => ({
  data: await getRun(client, workspaceId, parseId(p.runId)),
}));

/** Admin only; finished runs only; clusters used by a generated opportunity block deletion. */
export const DELETE = workspaceRoute<P>(
  "admin",
  async ({ client, workspaceId, user, requestId }, p) => {
    await deleteRun({ client, workspaceId, userId: user.id, runId: parseId(p.runId), requestId });
    return undefined;
  },
);
