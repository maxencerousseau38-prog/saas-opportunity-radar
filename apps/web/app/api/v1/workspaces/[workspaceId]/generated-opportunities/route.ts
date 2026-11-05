import { workspaceRoute } from "@/lib/api/http";
import { listOpportunities } from "@/lib/services/pain-points";

/** Independent opportunity hypotheses (unscored; eligible or under review). */
export const GET = workspaceRoute("viewer", async ({ client, workspaceId }) => ({
  data: await listOpportunities(client, workspaceId),
}));
