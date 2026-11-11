import { idempotencyKey, parseId, workspaceRoute } from "@/lib/api/http";
import { retryRun } from "@/lib/services/discovery";

type P = { workspaceId: string; runId: string };

/** A new job for a failed, partial or cancelled run without reviewed candidates (202). */
export const POST = workspaceRoute<P>("member", async ({ client, workspaceId, user, request }, p) =>
  retryRun({
    client,
    workspaceId,
    userId: user.id,
    runId: parseId(p.runId),
    idempotencyKey: idempotencyKey(request),
  }),
);
