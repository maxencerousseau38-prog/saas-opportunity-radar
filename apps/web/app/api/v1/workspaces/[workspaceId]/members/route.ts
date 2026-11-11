import { MemberInviteSchema } from "@sor/contracts";
import { DbError, serverRepo, workspaceRepo } from "@sor/database";
import { parseBody, workspaceRoute } from "@/lib/api/http";
import { siteUrl } from "@/lib/env";
import { getServiceClient } from "@/lib/supabase/server";

export const GET = workspaceRoute("viewer", async ({ client, workspaceId }) => ({
  data: await workspaceRepo.listMemberDirectory(client, workspaceId),
}));

/** Adds an existing account, or sends a Supabase Auth invitation first. */
export const POST = workspaceRoute("admin", async ({ workspaceId, user, request }) => {
  const body = await parseBody(request, MemberInviteSchema);
  const service = getServiceClient();
  const add = () =>
    serverRepo.addMemberByEmail(service, {
      workspaceId,
      actor: user.id,
      email: body.email,
      role: body.role,
    });
  let invited = false;
  let userId: string;
  try {
    userId = await add();
  } catch (err) {
    if (!(err instanceof DbError) || err.code !== "NOT_FOUND") throw err;
    // Invitations send emails: hourly limit per workspace (S7.4d). The link
    // points to the configured site, never to the request's Host header.
    await serverRepo.consumeRateLimit(service, "invitation", workspaceId);
    await serverRepo.inviteUserByEmail(service, body.email, `${siteUrl(request)}/auth/confirm`);
    invited = true;
    userId = await add();
  }
  return Response.json(
    { data: { user_id: userId, email: body.email, role: body.role, invitation_sent: invited } },
    { status: 201 },
  );
});
