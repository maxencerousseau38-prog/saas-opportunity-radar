import { OperatorReasonSchema } from "@sor/contracts";
import { discoverAssetsRepo } from "@sor/database";
import { parseBody, parseId, route } from "@/lib/api/http";
import { getServiceClient } from "@/lib/supabase/server";
import { requireOperator } from "../../../guard";

/** Takedown: hides the visual at once and deletes its private copy (audited). */
export const POST = route<{ assetId: string }>(async ({ client, user, request }, p) => {
  await requireOperator({ client, user });
  const body = await parseBody(request, OperatorReasonSchema);
  await discoverAssetsRepo.removeVisualAsset(getServiceClient(), {
    operator: user.id,
    assetId: parseId(p.assetId),
    reason: body.reason,
  });
  return undefined;
});
