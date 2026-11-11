import { SavedSearchUpdateSchema } from "@sor/contracts";
import { workspaceRepo } from "@sor/database";
import { parseBody, parseId, workspaceRoute } from "@/lib/api/http";
import { toSavedSearchDto } from "@/lib/services/workspace";

type P = { workspaceId: string; searchId: string };

// RLS: the creator (member) or an admin may change or delete a saved search.
export const PATCH = workspaceRoute<P>("member", async ({ client, workspaceId, request }, p) => {
  const body = await parseBody(request, SavedSearchUpdateSchema);
  const row = await workspaceRepo.updateSavedSearch(client, workspaceId, parseId(p.searchId), body);
  return { data: toSavedSearchDto(row) };
});

export const DELETE = workspaceRoute<P>("member", async ({ client, workspaceId }, p) => {
  await workspaceRepo.deleteSavedSearch(client, workspaceId, parseId(p.searchId));
});
