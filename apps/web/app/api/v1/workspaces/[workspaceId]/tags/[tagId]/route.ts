import { TagUpdateSchema } from "@sor/contracts";
import { workspaceRepo } from "@sor/database";
import { parseBody, parseId, workspaceRoute } from "@/lib/api/http";

type P = { workspaceId: string; tagId: string };

export const PATCH = workspaceRoute<P>("member", async ({ client, workspaceId, request }, p) => ({
  data: await workspaceRepo.updateTag(
    client,
    workspaceId,
    parseId(p.tagId),
    await parseBody(request, TagUpdateSchema),
  ),
}));

export const DELETE = workspaceRoute<P>("member", async ({ client, workspaceId }, p) => {
  await workspaceRepo.deleteTag(client, workspaceId, parseId(p.tagId));
});
