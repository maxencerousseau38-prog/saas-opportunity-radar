import { CatalogQuerySchema } from "@sor/contracts";
import { parseBody, workspaceRoute } from "@/lib/api/http";
import { countProducts } from "@/lib/services/catalog";

export const POST = workspaceRoute("viewer", async ({ client, workspaceId, request }) => {
  const query = await parseBody(request, CatalogQuerySchema);
  return { data: { count: await countProducts(client, workspaceId, query.filters) } };
});
