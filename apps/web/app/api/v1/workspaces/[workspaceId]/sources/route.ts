import { catalogRepo } from "@sor/database";
import { workspaceRoute } from "@/lib/api/http";

/** Source registry and connector status (PRD §14.3). */
export const GET = workspaceRoute("viewer", async ({ client }) => ({
  data: await catalogRepo.listSources(client),
}));
