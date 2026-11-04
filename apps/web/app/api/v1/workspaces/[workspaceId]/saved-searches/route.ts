import { SavedSearchSchema } from "@sor/contracts";
import { workspaceRepo } from "@sor/database";
import { parseBody, workspaceRoute } from "@/lib/api/http";
import { toSavedSearchDto } from "@/lib/services/workspace";

export const GET = workspaceRoute("viewer", async ({ client, workspaceId }) => ({
  data: (await workspaceRepo.listSavedSearches(client, workspaceId)).map(toSavedSearchDto),
}));

export const POST = workspaceRoute(
  "member",
  async ({ client, workspaceId, user, request }) => {
    const body = await parseBody(request, SavedSearchSchema);
    const row = await workspaceRepo.createSavedSearch(client, workspaceId, user.id, body);
    return { data: toSavedSearchDto(row) };
  },
  { status: 201 },
);
