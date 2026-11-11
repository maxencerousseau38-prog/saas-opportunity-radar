import { z } from "zod";
import { UUIDSchema } from "@sor/contracts";
import { workspaceRoute } from "@/lib/api/http";
import { compareProducts } from "@/lib/services/catalog";

const Ids = z.array(UUIDSchema).min(2).max(10);

export const GET = workspaceRoute("viewer", async ({ client, request }) => {
  const raw = new URL(request.url).searchParams.get("product_ids") ?? "";
  const ids = Ids.parse(raw.split(",").filter(Boolean));
  return compareProducts(client, ids);
});
