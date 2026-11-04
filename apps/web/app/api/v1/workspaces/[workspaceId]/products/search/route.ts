import { CatalogQuerySchema } from "@sor/contracts";
import { parseBody, workspaceRoute } from "@/lib/api/http";
import { searchProducts } from "@/lib/services/catalog";

// Read-only search with a JSON body (nested filters do not fit query strings).
export const POST = workspaceRoute("viewer", async ({ client, workspaceId, request }) =>
  searchProducts(client, workspaceId, await parseBody(request, CatalogQuerySchema)),
);
