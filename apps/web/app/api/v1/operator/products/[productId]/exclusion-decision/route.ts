import { OperatorExclusionDecisionSchema } from "@sor/contracts";
import { serverRepo } from "@sor/database";
import { parseBody, parseId, route } from "@/lib/api/http";
import { getServiceClient } from "@/lib/supabase/server";
import { requireOperator } from "../../../guard";

/** Resolves a needs_review outcome only; R1–R5 exclusions are final (§5.4). */
export const POST = route<{ productId: string }>(async ({ client, user, request }, p) => {
  await requireOperator({ client, user });
  const body = await parseBody(request, OperatorExclusionDecisionSchema);
  await serverRepo.decideExclusion(getServiceClient(), {
    operator: user.id,
    productId: parseId(p.productId),
    decision: body.decision,
    reason: body.reason,
  });
});
