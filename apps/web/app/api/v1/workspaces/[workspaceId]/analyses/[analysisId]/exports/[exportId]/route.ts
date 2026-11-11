import { parseId, workspaceRoute } from "@/lib/api/http";
import { downloadExport } from "@/lib/services/analyses";

type P = { workspaceId: string; analysisId: string; exportId: string };

/** Download of a report export (membership checked; the table is server-only). */
export const GET = workspaceRoute<P>("viewer", async ({ client, workspaceId }, p) =>
  downloadExport(client, workspaceId, parseId(p.analysisId), parseId(p.exportId)),
);
