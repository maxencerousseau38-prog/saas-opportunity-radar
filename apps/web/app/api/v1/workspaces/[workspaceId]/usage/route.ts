import { workspaceRoute } from "@/lib/api/http";
import { workspaceUsage } from "@/lib/services/jobs";

/** Job usage and quotas of the workspace for the caller (S7.2; PRD §14.3). */
export const GET = workspaceRoute("viewer", async (env) => ({
  data: await workspaceUsage(env.workspaceId, env.user.id),
}));
