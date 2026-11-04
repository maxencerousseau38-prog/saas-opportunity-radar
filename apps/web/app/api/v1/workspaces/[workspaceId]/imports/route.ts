import { jobsRepo } from "@sor/database";
import { workspaceRoute } from "@/lib/api/http";
import { toJobStatus } from "@/lib/services/jobs";
import { getServiceClient } from "@/lib/supabase/server";

export const GET = workspaceRoute("viewer", async ({ workspaceId }) => ({
  data: (
    await jobsRepo.listWorkspaceJobs(getServiceClient(), workspaceId, [
      "catalog_import",
      "feedback_import",
    ])
  ).map((r) => toJobStatus(workspaceId, r)),
}));
