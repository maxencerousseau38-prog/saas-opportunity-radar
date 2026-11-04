import { parseId, workspaceRoute } from "@/lib/api/http";
import { getProductGeneral } from "@/lib/services/catalog";

type P = { workspaceId: string; productId: string };

export const GET = workspaceRoute<P>("viewer", async ({ client }, p) => ({
  data: await getProductGeneral(client, parseId(p.productId)),
}));
