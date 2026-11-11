import { CollectionUpdateSchema } from "@sor/contracts";
import { workspaceRepo } from "@sor/database";
import { parseBody, parseId, workspaceRoute } from "@/lib/api/http";

type P = { workspaceId: string; collectionId: string };

export const PATCH = workspaceRoute<P>("member", async ({ client, workspaceId, request }, p) => ({
  data: await workspaceRepo.updateCollection(
    client,
    workspaceId,
    parseId(p.collectionId),
    await parseBody(request, CollectionUpdateSchema),
  ),
}));

export const DELETE = workspaceRoute<P>("admin", async ({ client, workspaceId }, p) => {
  await workspaceRepo.deleteCollection(client, workspaceId, parseId(p.collectionId));
});
