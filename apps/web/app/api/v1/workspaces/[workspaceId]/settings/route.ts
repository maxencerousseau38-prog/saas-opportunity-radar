import { WorkspaceSettingsPatchSchema } from "@sor/contracts";
import { workspaceRepo, type Json } from "@sor/database";
import { parseBody, workspaceRoute } from "@/lib/api/http";
import { readSettings } from "@/lib/services/workspace";

export const GET = workspaceRoute("viewer", async ({ client, workspaceId }) => ({
  data: await readSettings(client, workspaceId),
}));

export const PATCH = workspaceRoute("admin", async ({ client, workspaceId, user, request }) => {
  const body = await parseBody(request, WorkspaceSettingsPatchSchema);
  await workspaceRepo.updateSettings(
    client,
    workspaceId,
    user.id,
    body as { research_preferences?: NonNullable<Json>; ai_preferences?: NonNullable<Json> },
  );
  return { data: await readSettings(client, workspaceId) };
});
