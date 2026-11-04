import { WorkspaceCreateSchema } from "@sor/contracts";
import { createWorkspace, listMemberships } from "@sor/database";
import { parseBody, route } from "@/lib/api/http";

export const GET = route(async ({ client, user }) => ({
  data: (await listMemberships(client, user.id)).map((m) => ({
    id: m.workspaceId,
    name: m.name,
    role: m.role,
  })),
}));

export const POST = route(async ({ client, request }) => {
  const body = await parseBody(request, WorkspaceCreateSchema);
  const id = await createWorkspace(client, body.name);
  return Response.json({ data: { id, name: body.name } }, { status: 201 });
});
