import { parseId, workspaceRoute } from "@/lib/api/http";
import { cancelAnalysis } from "@/lib/services/analyses";

type P = { workspaceId: string; analysisId: string };

/** Cooperative cancellation of the analysis job; the analysis follows its job. */
export const POST = workspaceRoute<P>("member", async ({ client, workspaceId, user }, p) =>
  cancelAnalysis(client, workspaceId, user.id, parseId(p.analysisId)),
);
