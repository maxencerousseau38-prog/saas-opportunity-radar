import { parseId, workspaceRoute } from "@/lib/api/http";
import { cancelRun } from "@/lib/services/pain-points";

type P = { workspaceId: string; runId: string };

/** Cooperative cancellation of the run's job; the run follows its job. */
export const POST = workspaceRoute<P>("member", async ({ client, workspaceId, user }, p) =>
  cancelRun(client, workspaceId, user.id, parseId(p.runId)),
);
