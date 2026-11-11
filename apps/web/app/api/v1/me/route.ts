import { listMemberships } from "@sor/database";
import { route } from "@/lib/api/http";
import { isOperator } from "@/lib/auth";

export const GET = route(async ({ client, user }) => {
  const memberships = await listMemberships(client, user.id);
  return {
    data: {
      user,
      memberships: memberships.map((m) => ({
        workspace_id: m.workspaceId,
        workspace_name: m.name,
        role: m.role,
      })),
      is_platform_operator: await isOperator(user.id),
    },
  };
});
