import { GeneratedOpportunityPatchSchema } from "@sor/contracts";
import { parseBody, parseId, workspaceRoute } from "@/lib/api/http";
import { getOpportunity, patchOpportunity } from "@/lib/services/pain-points";

type P = { workspaceId: string; opportunityId: string };

export const GET = workspaceRoute<P>("viewer", async ({ client, workspaceId }, p) => ({
  data: await getOpportunity(client, workspaceId, parseId(p.opportunityId)),
}));

/** Status, favourite and notes (the only columns browsers may change). */
export const PATCH = workspaceRoute<P>("member", async ({ client, workspaceId, request }, p) => {
  const patch = await parseBody(request, GeneratedOpportunityPatchSchema);
  return { data: await patchOpportunity(client, workspaceId, parseId(p.opportunityId), patch) };
});
