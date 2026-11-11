import { discoverAssetsRepo } from "@sor/database";
import { ApiError, parseId, route } from "@/lib/api/http";
import { getServiceClient } from "@/lib/supabase/server";

/**
 * Private copy of an admitted product visual (ADR-016). Access follows SOR's
 * permissions: the user's own RLS read must return the asset (current,
 * approved, verified, visible product and evidence) before the server reads
 * the bytes. Never a redirect to the source, never a storage URL.
 */
export const GET = route<{ assetId: string }>(async ({ client }, p) => {
  const assetId = parseId(p.assetId);
  const { data, error } = await client
    .from("product_visual_assets")
    .select("id, content_hash")
    .eq("id", assetId)
    .maybeSingle();
  if (error || !data) throw new ApiError("NOT_FOUND");
  const file = await discoverAssetsRepo.getVisualAssetFile(getServiceClient(), assetId);
  if (!file) throw new ApiError("NOT_FOUND");
  return new Response(new Uint8Array(file.bytes), {
    status: 200,
    headers: {
      "content-type": file.contentType,
      "content-length": String(file.bytes.byteLength),
      "cache-control": "private, max-age=600",
      etag: `"${data.content_hash}"`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "same-origin",
    },
  });
});
