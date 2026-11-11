import { ProductStatePatchSchema } from "@sor/contracts";
import { catalogRepo, workspaceRepo } from "@sor/database";
import { ApiError, parseBody, parseId, workspaceRoute } from "@/lib/api/http";

type P = { workspaceId: string; productId: string };

export const GET = workspaceRoute<P>("viewer", async ({ client, workspaceId }, p) => ({
  data: await workspaceRepo.getProductState(client, workspaceId, parseId(p.productId)),
}));

export const PATCH = workspaceRoute<P>(
  "member",
  async ({ client, workspaceId, user, request }, p) => {
    const productId = parseId(p.productId);
    const patch = await parseBody(request, ProductStatePatchSchema);
    if (!(await catalogRepo.getProductById(client, productId))) throw new ApiError("NOT_FOUND");
    return {
      data: await workspaceRepo.upsertProductState(client, workspaceId, productId, user.id, patch),
    };
  },
);
