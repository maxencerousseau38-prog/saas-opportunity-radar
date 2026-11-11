import { ImportExternalResearchAnswerSchema } from "@sor/contracts";
import { parseBody, parseId, workspaceRoute } from "@/lib/api/http";
import {
  deleteExternalResearch,
  getExternalResearch,
  importExternalResearchAnswer,
} from "@/lib/services/external-research";

type P = { workspaceId: string; sessionId: string };

export const GET = workspaceRoute<P>("viewer", async ({ client, workspaceId }, p) => ({
  data: await getExternalResearch(client, workspaceId, parseId(p.sessionId)),
}));

export const PATCH = workspaceRoute<P>(
  "member",
  async ({ workspaceId, user, role, requestId, request }, p) => ({
    ...(await importExternalResearchAnswer({
      workspaceId,
      sessionId: parseId(p.sessionId),
      userId: user.id,
      role,
      requestId,
      input: await parseBody(request, ImportExternalResearchAnswerSchema, { maxBytes: 400_000 }),
    })),
  }),
);

export const DELETE = workspaceRoute<P>(
  "member",
  async ({ workspaceId, user, role, requestId }, p) => {
    await deleteExternalResearch({
      workspaceId,
      sessionId: parseId(p.sessionId),
      userId: user.id,
      role,
      requestId,
    });
    return undefined;
  },
);
