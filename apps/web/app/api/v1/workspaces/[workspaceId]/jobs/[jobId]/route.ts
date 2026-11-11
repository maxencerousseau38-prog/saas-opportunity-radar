import { jobsRepo } from "@sor/database";
import { ApiError, parseId, workspaceRoute } from "@/lib/api/http";
import { toJobStatus } from "@/lib/services/jobs";
import { getServiceClient } from "@/lib/supabase/server";

type P = { workspaceId: string; jobId: string };

// job_executions is server-only: the membership check of workspaceRoute and
// the workspace filter below decide what the caller may see.
export const GET = workspaceRoute<P>("viewer", async ({ workspaceId }, p) => {
  const row = await jobsRepo.getWorkspaceJob(getServiceClient(), workspaceId, parseId(p.jobId));
  if (!row) throw new ApiError("NOT_FOUND");
  return { data: toJobStatus(workspaceId, row) };
});
