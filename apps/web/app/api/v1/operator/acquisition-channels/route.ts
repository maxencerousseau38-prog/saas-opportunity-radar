import { OperatorChannelRecordSchema } from "@sor/contracts";
import { discoverAssetsRepo } from "@sor/database";
import { parseBody, route } from "@/lib/api/http";
import { recordChannel } from "@/lib/services/discover-admin";
import { getServiceClient } from "@/lib/supabase/server";
import { requireOperator } from "../guard";

/** Current Acquisition Channels recorded on catalog SaaS (S8.3, ADR-017). */
export const GET = route(async ({ client, user }) => {
  await requireOperator({ client, user });
  return { data: await discoverAssetsRepo.listAcquisitionChannels(getServiceClient()) };
});

/** Records a channel from a cited source: normalized key, rules, confidence (audited). */
export const POST = route(async ({ client, user, request }) => {
  await requireOperator({ client, user });
  const body = await parseBody(request, OperatorChannelRecordSchema);
  return { data: await recordChannel(getServiceClient(), user.id, body) };
});
