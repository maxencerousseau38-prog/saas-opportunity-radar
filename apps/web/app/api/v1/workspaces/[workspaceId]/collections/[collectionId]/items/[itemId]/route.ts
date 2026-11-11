import { CollectionItemUpdateSchema } from "@sor/contracts";
import { workspaceRepo } from "@sor/database";
import { parseBody, parseId, workspaceRoute } from "@/lib/api/http";

type P = { workspaceId: string; collectionId: string; itemId: string };

export const PATCH = workspaceRoute<P>("member", async ({ client, workspaceId, request }, p) => {
  const body = await parseBody(request, CollectionItemUpdateSchema);
  return {
    data: await workspaceRepo.updateCollectionItem(
      client,
      workspaceId,
      parseId(p.collectionId),
      parseId(p.itemId),
      body.notes,
    ),
  };
});

export const DELETE = workspaceRoute<P>("member", async ({ client, workspaceId }, p) => {
  await workspaceRepo.deleteCollectionItem(
    client,
    workspaceId,
    parseId(p.collectionId),
    parseId(p.itemId),
  );
});
