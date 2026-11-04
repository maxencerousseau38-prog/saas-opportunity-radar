import { jobsRepo } from "@sor/database";
import { parseId, workspaceRoute } from "@/lib/api/http";
import { getServiceClient } from "@/lib/supabase/server";

type P = { workspaceId: string; jobId: string };

/** Cooperative cancellation: queued jobs stop at once, running ones between steps. */
export const POST = workspaceRoute<P>("member", async ({ workspaceId, user }, p) => {
  const state = await jobsRepo.cancelJob(getServiceClient(), {
    jobId: parseId(p.jobId),
    workspaceId,
    actor: user.id,
  });
  return { data: { state } };
});
