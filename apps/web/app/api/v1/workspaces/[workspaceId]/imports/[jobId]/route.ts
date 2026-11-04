import { jobsRepo } from "@sor/database";
import { ApiError, parseId, workspaceRoute } from "@/lib/api/http";
import { toJobStatus } from "@/lib/services/jobs";
import { getServiceClient } from "@/lib/supabase/server";

type P = { workspaceId: string; jobId: string };

/** Per-row results, including rejected rows with their reasons. */
export const GET = workspaceRoute<P>("viewer", async ({ workspaceId }, p) => {
  const row = await jobsRepo.getWorkspaceJob(getServiceClient(), workspaceId, parseId(p.jobId));
  if (!row || (row.job_kind !== "catalog_import" && row.job_kind !== "feedback_import"))
    throw new ApiError("NOT_FOUND");
  return { data: toJobStatus(workspaceId, row) };
});
