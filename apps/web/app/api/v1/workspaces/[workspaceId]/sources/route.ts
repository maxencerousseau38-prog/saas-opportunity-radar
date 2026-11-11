import { workspaceRoute } from "@/lib/api/http";
import { listSources } from "@/lib/services/discovery";

/** Source registry, connector status, storage policy and today's usage (PRD §14.3). */
export const GET = workspaceRoute("viewer", async () => listSources());
