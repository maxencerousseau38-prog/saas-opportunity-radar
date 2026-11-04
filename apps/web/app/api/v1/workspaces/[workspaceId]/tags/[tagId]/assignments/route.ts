import { TagAssignmentSchema } from "@sor/contracts";
import { catalogRepo, workspaceRepo } from "@sor/database";
import { ApiError, parseBody, parseId, workspaceRoute } from "@/lib/api/http";

type P = { workspaceId: string; tagId: string };

export const POST = workspaceRoute<P>(
  "member",
  async ({ client, workspaceId, user, request }, p) => {
    const body = await parseBody(request, TagAssignmentSchema);
    if (!(await catalogRepo.getProductById(client, body.product_id)))
      throw new ApiError("NOT_FOUND");
    return {
      data: await workspaceRepo.assignTag(
        client,
        workspaceId,
        parseId(p.tagId),
        body.product_id,
        user.id,
      ),
    };
  },
  { status: 201 },
);

export const DELETE = workspaceRoute<P>("member", async ({ client, workspaceId, request }, p) => {
  const body = await parseBody(request, TagAssignmentSchema);
  await workspaceRepo.unassignTag(client, workspaceId, parseId(p.tagId), body.product_id);
});
