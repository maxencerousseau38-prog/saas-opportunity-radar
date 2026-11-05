import { parseId, workspaceRoute } from "@/lib/api/http";
import { clusterEvidence } from "@/lib/services/pain-points";

type P = { workspaceId: string; clusterId: string };

/** Problem → feedback → source evidence of the cluster (removed members flagged). */
export const GET = workspaceRoute<P>("viewer", async ({ client, workspaceId }, p) => ({
  data: await clusterEvidence(client, workspaceId, parseId(p.clusterId)),
}));
