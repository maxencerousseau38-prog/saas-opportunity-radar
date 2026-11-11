import { OperatorCatalogReviewResolutionSchema } from "@sor/contracts";
import { serverRepo } from "@sor/database";
import { parseBody, parseId, route } from "@/lib/api/http";
import { getServiceClient } from "@/lib/supabase/server";
import { requireOperator } from "../../../guard";

/** Creates, attaches or rejects a collected listing sent to review (audited). */
export const POST = route<{ reviewId: string }>(async ({ client, user, request }, p) => {
  await requireOperator({ client, user });
  const body = await parseBody(request, OperatorCatalogReviewResolutionSchema);
  return {
    data: await serverRepo.resolveCatalogReview(getServiceClient(), {
      operator: user.id,
      reviewId: parseId(p.reviewId),
      action: body.action,
      ...(body.product_id ? { productId: body.product_id } : {}),
      ...(body.note ? { note: body.note } : {}),
    }),
  };
});
