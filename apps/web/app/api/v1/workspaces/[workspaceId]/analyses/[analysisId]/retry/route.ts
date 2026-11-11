import { idempotencyKey, parseId, workspaceRoute } from "@/lib/api/http";
import { retryAnalysis } from "@/lib/services/analyses";

type P = { workspaceId: string; analysisId: string };

/** A new job for a failed, partial, cancelled or needs_review analysis (202). */
export const POST = workspaceRoute<P>("member", async ({ client, workspaceId, user, request }, p) =>
  retryAnalysis({
    client,
    workspaceId,
    userId: user.id,
    analysisId: parseId(p.analysisId),
    idempotencyKey: idempotencyKey(request),
  }),
);
