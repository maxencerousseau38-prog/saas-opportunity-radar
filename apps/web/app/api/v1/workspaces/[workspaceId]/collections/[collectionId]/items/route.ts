import { CollectionItemCreateSchema } from "@sor/contracts";
import { catalogRepo, workspaceRepo } from "@sor/database";
import { ApiError, parseBody, parseId, workspaceRoute } from "@/lib/api/http";

type P = { workspaceId: string; collectionId: string };

export const POST = workspaceRoute<P>(
  "member",
  async ({ client, workspaceId, user, request }, p) => {
    const body = await parseBody(request, CollectionItemCreateSchema);
    // Generated opportunities arrive with the Pain Point engine (Sprint 4).
    if (!body.product_id)
      throw new ApiError("VALIDATION_ERROR", "Opportunités générées : Sprint 4");
    if (!(await catalogRepo.getProductById(client, body.product_id)))
      throw new ApiError("NOT_FOUND");
    return {
      data: await workspaceRepo.addCollectionItem(
        client,
        workspaceId,
        parseId(p.collectionId),
        user.id,
        {
          product_id: body.product_id,
          notes: body.notes,
        },
      ),
    };
  },
  { status: 201 },
);
