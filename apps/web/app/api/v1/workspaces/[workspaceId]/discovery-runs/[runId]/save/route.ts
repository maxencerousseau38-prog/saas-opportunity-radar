import { DiscoverySaveSchema } from "@sor/contracts";
import { parseBody, parseId, workspaceRoute } from "@/lib/api/http";
import { saveRun } from "@/lib/services/discovery";

type P = { workspaceId: string; runId: string };

/** Saves the prompt and filters as a `discovery` saved search (PRD §6.4). */
export const POST = workspaceRoute<P>(
  "member",
  async ({ client, workspaceId, user, request }, p) => {
    const body = await parseBody(request, DiscoverySaveSchema);
    return saveRun({
      client,
      workspaceId,
      userId: user.id,
      runId: parseId(p.runId),
      name: body.name,
    });
  },
);
