import { TagAssignmentSchema, type TagAssignmentTarget } from "@sor/contracts";
import { catalogRepo, workspaceRepo, type DbClient } from "@sor/database";
import { ApiError, parseBody, parseId, workspaceRoute } from "@/lib/api/http";

type P = { workspaceId: string; tagId: string };

/** The target must be a visible product or a generated opportunity of the workspace. */
async function checkTarget(client: DbClient, workspaceId: string, target: TagAssignmentTarget) {
  if ("product_id" in target) {
    if (!(await catalogRepo.getProductById(client, target.product_id)))
      throw new ApiError("NOT_FOUND");
    return;
  }
  const { data } = await client
    .from("generated_opportunities")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("id", target.generated_opportunity_id)
    .maybeSingle();
  if (!data) throw new ApiError("NOT_FOUND");
}

export const POST = workspaceRoute<P>(
  "member",
  async ({ client, workspaceId, user, request }, p) => {
    const body = await parseBody(request, TagAssignmentSchema);
    await checkTarget(client, workspaceId, body);
    return {
      data: await workspaceRepo.assignTag(client, workspaceId, parseId(p.tagId), body, user.id),
    };
  },
  { status: 201 },
);

export const DELETE = workspaceRoute<P>("member", async ({ client, workspaceId, request }, p) => {
  const body = await parseBody(request, TagAssignmentSchema);
  await workspaceRepo.unassignTag(client, workspaceId, parseId(p.tagId), body);
});
