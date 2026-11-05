import { AnalysisListQuerySchema, AnalysisRequestSchema } from "@sor/contracts";
import { idempotencyKey, parseBody, workspaceRoute } from "@/lib/api/http";
import { listAnalyses, requestAnalysis } from "@/lib/services/analyses";

/** Analyses of the workspace, newest first (keyset cursor, optional subject filters). */
export const GET = workspaceRoute("viewer", async ({ client, workspaceId, request }) => {
  const query = AnalysisListQuerySchema.parse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  return listAnalyses(client, workspaceId, query);
});

/** Starts an opportunity analysis over a frozen scope: a job, 202 (Implementation Blueprint §10). */
export const POST = workspaceRoute("member", async ({ workspaceId, user, request }) => {
  const key = idempotencyKey(request);
  const body = await parseBody(request, AnalysisRequestSchema);
  return requestAnalysis({ workspaceId, userId: user.id, idempotencyKey: key, body });
});
