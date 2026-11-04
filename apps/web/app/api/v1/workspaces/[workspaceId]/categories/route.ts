import { catalogRepo } from "@sor/database";
import { workspaceRoute } from "@/lib/api/http";

// RLS returns user-visible, active categories only.
export const GET = workspaceRoute("viewer", async ({ client }) => ({
  data: await catalogRepo.listCategories(client),
}));
