import { DiscoveryRequestSchema, DiscoveryRunListQuerySchema } from "@sor/contracts";
import { idempotencyKey, parseBody, workspaceRoute } from "@/lib/api/http";
import { listRuns, requestDiscovery } from "@/lib/services/discovery";

/** Discovery runs of the workspace, newest first (keyset cursor). */
export const GET = workspaceRoute("viewer", async ({ client, workspaceId, request }) => {
  const query = DiscoveryRunListQuerySchema.parse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  return listRuns(client, workspaceId, query);
});

/** Starts a discovery run: a job, 202 (Implementation Blueprint §10). */
export const POST = workspaceRoute("member", async ({ workspaceId, user, request }) => {
  const key = idempotencyKey(request);
  const body = await parseBody(request, DiscoveryRequestSchema);
  return requestDiscovery({ workspaceId, userId: user.id, idempotencyKey: key, body });
});
