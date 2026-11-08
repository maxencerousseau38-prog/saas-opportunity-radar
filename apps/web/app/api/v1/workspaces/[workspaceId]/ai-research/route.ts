import { CreateExternalResearchSchema } from "@sor/contracts";
import { parseBody, workspaceRoute } from "@/lib/api/http";
import { createExternalResearch, listExternalResearch } from "@/lib/services/external-research";

type P = { workspaceId: string };

export const GET = workspaceRoute<P>("viewer", async ({ client, workspaceId }) => ({
  data: await listExternalResearch(client, workspaceId),
}));

export const POST = workspaceRoute<P>(
  "member",
  async ({ client, workspaceId, user, requestId, request }) => ({
    ...(await createExternalResearch({
      client,
      workspaceId,
      userId: user.id,
      requestId,
      input: await parseBody(request, CreateExternalResearchSchema, { maxBytes: 10_000 }),
    })),
  }),
  { status: 201 },
);
