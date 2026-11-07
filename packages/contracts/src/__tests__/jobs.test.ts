// Workspace usage DTO (S7.2).
import { describe, expect, it } from "vitest";
import { WorkspaceUsageSchema } from "../jobs";

const usage = {
  active_jobs: 1,
  max_concurrent_jobs: 3,
  jobs_today: 12,
  max_jobs_per_day: 200,
  day_resets_at: "2026-11-07T00:00:00+00:00",
  my_job_requests_this_hour: 4,
  max_job_requests_per_hour: 30,
  hour_resets_at: "2026-11-06T22:00:00+00:00",
  ai_cost_usd_today: 0,
};

describe("WorkspaceUsageSchema", () => {
  it("accepts the database usage document", () => {
    expect(WorkspaceUsageSchema.parse(usage)).toEqual(usage);
  });

  it("rejects negative counts, zero limits and unknown fields", () => {
    expect(WorkspaceUsageSchema.safeParse({ ...usage, jobs_today: -1 }).success).toBe(false);
    expect(WorkspaceUsageSchema.safeParse({ ...usage, max_jobs_per_day: 0 }).success).toBe(false);
    expect(WorkspaceUsageSchema.safeParse({ ...usage, extra: 1 }).success).toBe(false);
    expect(WorkspaceUsageSchema.safeParse({ ...usage, ai_cost_usd_today: -0.01 }).success).toBe(
      false,
    );
  });
});
