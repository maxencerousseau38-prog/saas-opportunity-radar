import { ApiError, workspaceRoute } from "@/lib/api/http";
import { UUIDSchema } from "@sor/contracts";
import { listClusters } from "@/lib/services/pain-points";

/** Clusters of the workspace, optionally of one run (`?run_id=`). */
export const GET = workspaceRoute("viewer", async ({ client, workspaceId, request }) => {
  const runId = new URL(request.url).searchParams.get("run_id");
  if (runId !== null && !UUIDSchema.safeParse(runId).success)
    throw new ApiError("VALIDATION_ERROR");
  return { data: await listClusters(client, workspaceId, runId) };
});
