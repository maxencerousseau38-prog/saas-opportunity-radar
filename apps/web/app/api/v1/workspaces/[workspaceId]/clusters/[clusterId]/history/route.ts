import { parseId, workspaceRoute } from "@/lib/api/http";
import { clusterHistory } from "@/lib/services/pain-points";

type P = { workspaceId: string; clusterId: string };

export const GET = workspaceRoute<P>("viewer", async ({ client, workspaceId }, p) => ({
  data: await clusterHistory(client, workspaceId, parseId(p.clusterId)),
}));
