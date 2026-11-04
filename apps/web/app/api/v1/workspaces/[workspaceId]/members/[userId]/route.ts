import { MemberRoleUpdateSchema } from "@sor/contracts";
import { workspaceRepo } from "@sor/database";
import { ApiError, hasRole, parseBody, parseId, workspaceRoute } from "@/lib/api/http";

type P = { workspaceId: string; userId: string };

// RLS forbids changing the owner, one's own role, or promoting to owner.
export const PATCH = workspaceRoute<P>("admin", async ({ client, workspaceId, request }, p) => {
  const body = await parseBody(request, MemberRoleUpdateSchema);
  return {
    data: await workspaceRepo.updateMemberRole(client, workspaceId, parseId(p.userId), body.role),
  };
});

/** Admins remove non-owner members; anyone but the owner may leave. */
export const DELETE = workspaceRoute<P>(
  "viewer",
  async ({ client, workspaceId, user, role }, p) => {
    const target = parseId(p.userId);
    if (target !== user.id && !hasRole(role, "admin")) throw new ApiError("FORBIDDEN");
    await workspaceRepo.removeMember(client, workspaceId, target);
  },
);
