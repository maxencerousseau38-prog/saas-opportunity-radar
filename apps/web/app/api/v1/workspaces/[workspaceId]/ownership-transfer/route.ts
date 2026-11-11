import { OwnershipTransferSchema } from "@sor/contracts";
import { serverRepo } from "@sor/database";
import { parseBody, workspaceRoute } from "@/lib/api/http";
import { getServiceClient } from "@/lib/supabase/server";

export const POST = workspaceRoute("owner", async ({ workspaceId, user, request }) => {
  const body = await parseBody(request, OwnershipTransferSchema);
  await serverRepo.transferOwnership(getServiceClient(), {
    workspaceId,
    currentOwner: user.id,
    newOwner: body.new_owner_user_id,
  });
});
