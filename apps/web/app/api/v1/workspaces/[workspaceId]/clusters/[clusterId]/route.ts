import { ClusterCorrectionSchema } from "@sor/contracts";
import { parseBody, parseId, workspaceRoute } from "@/lib/api/http";
import { correctCluster, getCluster } from "@/lib/services/pain-points";

type P = { workspaceId: string; clusterId: string };

export const GET = workspaceRoute<P>("viewer", async ({ client, workspaceId }, p) => ({
  data: await getCluster(client, workspaceId, parseId(p.clusterId)),
}));

/** Rename, confirm, reject, remove or move problems; the server recomputes the statistics. */
export const PATCH = workspaceRoute<P>(
  "member",
  async ({ client, workspaceId, user, request, requestId }, p) => {
    const correction = await parseBody(request, ClusterCorrectionSchema);
    return {
      data: await correctCluster({
        client,
        workspaceId,
        userId: user.id,
        clusterId: parseId(p.clusterId),
        requestId,
        correction,
      }),
    };
  },
);
