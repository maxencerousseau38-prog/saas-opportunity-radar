import { CandidateReviewSchema } from "@sor/contracts";
import { parseBody, parseId, workspaceRoute } from "@/lib/api/http";
import { reviewCandidate } from "@/lib/services/discovery";

type P = { workspaceId: string; runId: string; candidateId: string };

/** Accept or reject a candidate; accepting an eligible one adds it to Discover (audit-logged). */
export const POST = workspaceRoute<P>(
  "member",
  async ({ client, workspaceId, user, request, requestId }, p) => {
    const body = await parseBody(request, CandidateReviewSchema);
    return reviewCandidate({
      client,
      workspaceId,
      userId: user.id,
      runId: parseId(p.runId),
      candidateId: parseId(p.candidateId),
      decision: body.decision,
      reason: body.reason,
      requestId,
    });
  },
);
