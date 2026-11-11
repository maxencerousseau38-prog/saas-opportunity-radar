import { OperatorReasonSchema } from "@sor/contracts";
import { discoverAssetsRepo } from "@sor/database";
import { parseBody, parseId, route } from "@/lib/api/http";
import { getServiceClient } from "@/lib/supabase/server";
import { requireOperator } from "../../../guard";

/** Retracts a channel (kept in history, hidden from Discover; audited). */
export const POST = route<{ channelId: string }>(async ({ client, user, request }, p) => {
  await requireOperator({ client, user });
  const body = await parseBody(request, OperatorReasonSchema);
  await discoverAssetsRepo.retractAcquisitionChannel(getServiceClient(), {
    operator: user.id,
    channelId: parseId(p.channelId),
    reason: body.reason,
  });
  return undefined;
});
