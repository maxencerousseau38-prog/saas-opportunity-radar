import { ManualProductEntrySchema } from "@sor/contracts";
import { parseBody, workspaceRoute } from "@/lib/api/http";
import { manualAdd } from "@/lib/services/catalog";

/** Manual add (PRD §18): declared data, active only when classified eligible. */
export const POST = workspaceRoute("member", async ({ client, workspaceId, user, request }) => {
  const entry = await parseBody(request, ManualProductEntrySchema);
  const result = await manualAdd(client, workspaceId, user.id, entry);
  return Response.json({ data: result }, { status: result.status === "created" ? 201 : 200 });
});
