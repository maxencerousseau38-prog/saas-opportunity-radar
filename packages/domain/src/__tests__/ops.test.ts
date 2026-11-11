// Platform alerts (S7.3): deterministic thresholds over a monitoring snapshot.
import { describe, expect, it } from "vitest";
import { OpsAlertSchema, OpsSnapshotSchema, type OpsSnapshot } from "@sor/contracts";
import { alertKeySuffix, evaluateOpsAlerts } from "../ops";

const ID = "00000000-0000-4000-8000-000000000001";
const ID2 = "00000000-0000-4000-8000-000000000002";

function snapshot(patch: Partial<OpsSnapshot> = {}): OpsSnapshot {
  return OpsSnapshotSchema.parse({
    generated_at: "2026-11-07T10:00:00+00:00",
    queue: { queued: 0, running: 0, retrying: 0, oldest_due_wait_seconds: 0, messages: 0 },
    stuck: { stale_leases: 0, queue_wait: 0, jobs: [] },
    jobs_24h: {
      finished: 0,
      completed: 0,
      partial: 0,
      failed: 0,
      cancelled: 0,
      dead_letter: 0,
      budget_exhausted: 0,
    },
    recent_failures: [],
    providers_1h: [],
    cost: { today_usd: 0, last_7_days: [], by_provider_today: [], top_workspaces_today: [] },
    thresholds: {
      stale_lease_grace_seconds: 300,
      queue_wait_alert_seconds: 900,
      dead_letters_per_day: 1,
      failure_rate_pct: 25,
      budget_exhaustion_rate_pct: 20,
      provider_error_rate_pct: 20,
      ai_cost_usd_per_day: 5,
      min_sample: 10,
      min_provider_calls: 20,
    },
    ...patch,
  });
}

const keys = (s: OpsSnapshot) => evaluateOpsAlerts(s).map((a) => a.key);

describe("evaluateOpsAlerts", () => {
  it("raises nothing on a healthy, idle platform", () => {
    expect(evaluateOpsAlerts(snapshot())).toEqual([]);
  });

  it("flags stuck jobs (critical) and a queue backlog (warning) with their job ids", () => {
    const alerts = evaluateOpsAlerts(
      snapshot({
        queue: { queued: 1, running: 1, retrying: 0, oldest_due_wait_seconds: 3600, messages: 1 },
        stuck: {
          stale_leases: 1,
          queue_wait: 1,
          jobs: [
            {
              id: ID,
              job_kind: "discovery_run",
              workspace_id: null,
              state: "running",
              attempt_count: 1,
              reason: "lease_expired",
              since: "2026-11-07T09:50:00+00:00",
            },
            {
              id: ID2,
              job_kind: "catalog_import",
              workspace_id: null,
              state: "queued",
              attempt_count: 0,
              reason: "queue_wait",
              since: "2026-11-07T09:00:00+00:00",
            },
          ],
        },
      }),
    );
    expect(alerts.map((a) => [a.key, a.severity])).toEqual([
      ["stuck_jobs", "critical"],
      ["queue_backlog", "warning"],
    ]);
    expect(alerts[0]?.details.job_ids).toEqual([ID]);
    expect(alerts[1]?.details).toMatchObject({ job_ids: [ID2], oldest_due_wait_seconds: 3600 });
    for (const a of alerts) expect(OpsAlertSchema.safeParse(a).success).toBe(true);
  });

  it("flags dead letters from the first one by default", () => {
    const s = snapshot({
      jobs_24h: {
        finished: 1,
        completed: 0,
        partial: 0,
        failed: 0,
        cancelled: 0,
        dead_letter: 1,
        budget_exhausted: 0,
      },
    });
    expect(keys(s)).toEqual(["dead_letters"]);
    expect(keys({ ...s, thresholds: { ...s.thresholds, dead_letters_per_day: 0 } })).toEqual([]);
  });

  it("computes failure and budget-exhaustion rates only above the minimum sample", () => {
    const jobs = {
      finished: 9,
      completed: 3,
      partial: 2,
      failed: 4,
      cancelled: 0,
      dead_letter: 0,
      budget_exhausted: 2,
    };
    expect(keys(snapshot({ jobs_24h: jobs }))).toEqual([]);
    const alerts = evaluateOpsAlerts(snapshot({ jobs_24h: { ...jobs, finished: 10 } }));
    expect(alerts.map((a) => a.key)).toEqual(["budget_exhaustion_rate", "job_failure_rate"]);
    expect(alerts[1]?.details).toMatchObject({ rate_pct: 40, failed: 4, finished: 10 });
    expect(alerts[0]?.details).toMatchObject({ rate_pct: 20 });
  });

  it("flags a provider error rate per provider, above the minimum number of calls", () => {
    const alerts = evaluateOpsAlerts(
      snapshot({
        providers_1h: [
          { provider: "OpenAI", calls: 20, errors: 4 },
          { provider: "mistral", calls: 19, errors: 19 },
          { provider: "anthropic", calls: 100, errors: 19 },
        ],
      }),
    );
    expect(alerts.map((a) => a.key)).toEqual(["provider_error_rate:openai"]);
    expect(alerts[0]?.details).toMatchObject({ provider: "OpenAI", rate_pct: 20, calls: 20 });
  });

  it("flags the AI cost of the day at the threshold; 0 disables it", () => {
    const cost = {
      today_usd: 5.004,
      last_7_days: [{ day: "2026-11-07", usd: 5.004 }],
      by_provider_today: [{ provider: "openai", usd: 5.004 }],
      top_workspaces_today: [],
    };
    const s = snapshot({ cost });
    expect(evaluateOpsAlerts(s)[0]).toMatchObject({
      key: "ai_cost_per_day",
      details: { today_usd: 5, threshold_usd: 5 },
    });
    expect(keys(snapshot({ cost: { ...cost, today_usd: 4.99 } }))).toEqual([]);
    expect(keys({ ...s, thresholds: { ...s.thresholds, ai_cost_usd_per_day: 0 } })).toEqual([]);
  });

  it("builds valid alert-key suffixes from provider names", () => {
    expect(alertKeySuffix("Azure OpenAI (EU)")).toBe("azure-openai-eu");
    expect(alertKeySuffix("***")).toBe("unknown");
  });
});
