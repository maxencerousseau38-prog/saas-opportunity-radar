import { ProductAnalysisShortcutSchema } from "@sor/contracts";
import { idempotencyKey, parseBody, parseId, workspaceRoute } from "@/lib/api/http";
import { requestAnalysis } from "@/lib/services/analyses";

type P = { workspaceId: string; productId: string };

/** "Analyze Opportunity" on a product profile (PRD §7.2): shortcut for a product subject, 202. */
export const POST = workspaceRoute<P>("member", async ({ workspaceId, user, request }, p) => {
  const key = idempotencyKey(request);
  const body = await parseBody(request, ProductAnalysisShortcutSchema);
  return requestAnalysis({
    workspaceId,
    userId: user.id,
    idempotencyKey: key,
    body: {
      analysis_type: "opportunity",
      subject: { type: "product", product_id: parseId(p.productId) },
      ...body,
    },
  });
});
