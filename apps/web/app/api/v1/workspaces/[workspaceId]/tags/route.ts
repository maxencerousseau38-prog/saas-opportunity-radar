import { TagCreateSchema } from "@sor/contracts";
import { workspaceRepo } from "@sor/database";
import { parseBody, workspaceRoute } from "@/lib/api/http";

export const GET = workspaceRoute("viewer", async ({ client, workspaceId }) => ({
  data: await workspaceRepo.listTags(client, workspaceId),
}));

export const POST = workspaceRoute(
  "member",
  async ({ client, workspaceId, user, request }) => ({
    data: await workspaceRepo.createTag(
      client,
      workspaceId,
      user.id,
      await parseBody(request, TagCreateSchema),
    ),
  }),
  { status: 201 },
);
