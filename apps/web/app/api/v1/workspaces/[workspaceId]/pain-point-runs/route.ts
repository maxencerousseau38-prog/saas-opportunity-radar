import { PainPointRunRequestSchema } from "@sor/contracts";
import { idempotencyKey, parseBody, workspaceRoute } from "@/lib/api/http";
import { listRuns, requestRun } from "@/lib/services/pain-points";

/** Pain point runs of the workspace, newest first (keyset cursor). */
export const GET = workspaceRoute("viewer", async ({ client, workspaceId, request }) => {
  const cursor = new URL(request.url).searchParams.get("cursor");
  return listRuns(client, workspaceId, cursor);
});

/** Starts a run over a frozen scope of visible products: a job, 202 (Implementation Blueprint §10). */
export const POST = workspaceRoute("member", async ({ workspaceId, user, request }) => {
  const key = idempotencyKey(request);
  const body = await parseBody(request, PainPointRunRequestSchema);
  return requestRun({ workspaceId, userId: user.id, idempotencyKey: key, body });
});
