import { catalogRepo, jobsRepo } from "@sor/database";
import { ApiError, idempotencyKey, parseId, workspaceRoute } from "@/lib/api/http";
import { accepted, createJob, toJobStatus } from "@/lib/services/jobs";
import { getServiceClient } from "@/lib/supabase/server";

type P = { workspaceId: string; productId: string };

/** Latest enrichment job of the product in this workspace. */
export const GET = workspaceRoute<P>("viewer", async ({ client, workspaceId }, p) => {
  const productId = parseId(p.productId);
  if (!(await catalogRepo.getProductById(client, productId))) throw new ApiError("NOT_FOUND");
  const row = await jobsRepo.latestProductEnrichment(getServiceClient(), workspaceId, productId);
  return { data: row ? toJobStatus(workspaceId, row) : null };
});

/** Enrich from the official website (job `product_enrichment`, 202). */
export const POST = workspaceRoute<P>(
  "member",
  async ({ client, workspaceId, user, request }, p) => {
    const productId = parseId(p.productId);
    if (!(await catalogRepo.getProductById(client, productId))) throw new ApiError("NOT_FOUND");
    const { jobId, created } = await createJob({
      kind: "product_enrichment",
      workspaceId,
      userId: user.id,
      idempotencyKey: idempotencyKey(request),
      payload: { product_id: productId },
    });
    return accepted(workspaceId, jobId, created);
  },
);
