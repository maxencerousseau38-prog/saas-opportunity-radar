import { ApiError, parseId, workspaceRoute } from "@/lib/api/http";
import { getProductSection, type ProductSection } from "@/lib/services/catalog";

type P = { workspaceId: string; productId: string; section: string };

const SECTIONS: readonly ProductSection[] = [
  "features",
  "pricing",
  "integrations",
  "signals",
  "competitors",
  "feedback",
  "evidence",
  "sources",
];

export const GET = workspaceRoute<P>("viewer", async ({ client }, p) => {
  const section = SECTIONS.find((s) => s === p.section);
  if (!section) throw new ApiError("NOT_FOUND");
  return { data: await getProductSection(client, parseId(p.productId), section) };
});
