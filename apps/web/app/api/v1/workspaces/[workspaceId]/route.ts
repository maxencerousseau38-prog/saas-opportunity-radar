import { WorkspaceRenameSchema } from "@sor/contracts";
import { workspaceRepo } from "@sor/database";
import { parseBody, workspaceRoute } from "@/lib/api/http";

export const GET = workspaceRoute("viewer", async ({ client, workspaceId, role }) => ({
  data: { ...(await workspaceRepo.getWorkspace(client, workspaceId)), role },
}));

export const PATCH = workspaceRoute("owner", async ({ client, workspaceId, request }) => {
  const body = await parseBody(request, WorkspaceRenameSchema);
  return { data: await workspaceRepo.renameWorkspace(client, workspaceId, body.name) };
});
