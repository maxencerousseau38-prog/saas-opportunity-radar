import { parseId, workspaceRoute } from "@/lib/api/http";
import { listGaps } from "@/lib/services/pain-points";

type P = { workspaceId: string; runId: string };

export const GET = workspaceRoute<P>("viewer", async ({ client, workspaceId }, p) => ({
  data: await listGaps(client, workspaceId, parseId(p.runId)),
}));
