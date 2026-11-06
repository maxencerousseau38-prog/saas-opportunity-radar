import { parseId, workspaceRoute } from "@/lib/api/http";
import { runResults } from "@/lib/services/discovery";

type P = { workspaceId: string; runId: string };

/** Candidates with fit score, coverage, confidence, evidence and review status. */
export const GET = workspaceRoute<P>("viewer", async ({ client, workspaceId }, p) =>
  runResults(client, workspaceId, parseId(p.runId)),
);
