import { idempotencyKey, parseId, workspaceRoute } from "@/lib/api/http";
import { retryRun } from "@/lib/services/pain-points";

type P = { workspaceId: string; runId: string };

/** A new job for a failed, partial or cancelled run (202). */
export const POST = workspaceRoute<P>("member", async ({ client, workspaceId, user, request }, p) =>
  retryRun({
    client,
    workspaceId,
    userId: user.id,
    runId: parseId(p.runId),
    idempotencyKey: idempotencyKey(request),
  }),
);
