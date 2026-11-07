// Platform monitoring cycle (S7.3): snapshot → deterministic alerts → state
// sync → one log line per transition. The SQL side is pgTAP-tested (018).
import { describe, expect, it } from "vitest";
import type { DbClient } from "@sor/database";
import { monitorOnce, startOpsMonitor } from "../monitor";

const STUCK_ID = "00000000-0000-4000-8000-0000000000aa";

function snapshot(stuck: number) {
  return {
    generated_at: "2026-11-07T10:00:00+00:00",
    queue: { queued: 0, running: stuck, retrying: 0, oldest_due_wait_seconds: 0, messages: stuck },
    stuck: {
      stale_leases: stuck,
      queue_wait: 0,
      jobs:
        stuck > 0
          ? [
              {
                id: STUCK_ID,
                job_kind: "discovery_run",
                workspace_id: null,
                state: "running",
                attempt_count: 1,
                reason: "lease_expired",
                since: "2026-11-07T09:40:00+00:00",
              },
            ]
          : [],
    },
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
  };
}

/** Fake RPCs: a snapshot source and an in-memory alert state. */
function fakeDb(state: { stuck: number; fail?: boolean }) {
  const open = new Set<string>();
  const synced: unknown[] = [];
  const db = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (state.fail) return { data: null, error: { code: "XX000", message: "boom" } };
      if (fn === "sor_ops_snapshot") return { data: snapshot(state.stuck), error: null };
      if (fn === "sor_ops_sync_alerts") {
        const alerts = args.p_alerts as Array<{ key: string }>;
        synced.push(alerts);
        const keys = new Set(alerts.map((a) => a.key));
        const opened = [...keys].filter((k) => !open.has(k));
        const resolved = [...open].filter((k) => !keys.has(k)).sort();
        for (const k of opened) open.add(k);
        for (const k of resolved) open.delete(k);
        return { data: { opened, resolved, open: open.size }, error: null };
      }
      return { data: null, error: { code: "42883", message: "unknown" } };
    },
  };
  return { db: db as unknown as DbClient, synced };
}

describe("monitorOnce", () => {
  it("logs the snapshot, then opens an alert once and resolves it when it clears", async () => {
    const state = { stuck: 1 };
    const { db } = fakeDb(state);
    const logs: Array<Record<string, unknown>> = [];
    const log = (e: Record<string, unknown>) => logs.push(e);

    const first = await monitorOnce(db, log);
    expect(first.opened).toEqual(["stuck_jobs"]);
    expect(logs.find((l) => l.msg === "ops snapshot")).toMatchObject({
      stuck_jobs: 1,
      open_alerts: 1,
    });
    expect(logs.find((l) => l.msg === "alert opened")).toMatchObject({
      level: "error",
      alert_key: "stuck_jobs",
      severity: "critical",
      details: { job_ids: [STUCK_ID] },
    });

    logs.length = 0;
    await monitorOnce(db, log);
    expect(logs.filter((l) => l.msg === "alert opened")).toEqual([]);

    state.stuck = 0;
    logs.length = 0;
    const cleared = await monitorOnce(db, log);
    expect(cleared.resolved).toEqual(["stuck_jobs"]);
    expect(logs).toContainEqual({ level: "info", msg: "alert resolved", alert_key: "stuck_jobs" });
  });

  it("rejects a malformed snapshot instead of evaluating it", async () => {
    const db = {
      rpc: async () => ({ data: { queue: {} }, error: null }),
    } as unknown as DbClient;
    await expect(monitorOnce(db, () => undefined)).rejects.toThrow();
  });
});

describe("startOpsMonitor", () => {
  it("logs a failed cycle without throwing, and can be disabled", async () => {
    const logs: Array<Record<string, unknown>> = [];
    const { db } = fakeDb({ stuck: 0, fail: true });
    const m = startOpsMonitor({ db, intervalMs: 1000, firstDelayMs: 5, log: (e) => logs.push(e) });
    await new Promise((r) => setTimeout(r, 40));
    m.stop();
    expect(logs).toContainEqual({
      level: "error",
      msg: "ops monitor failed",
      error: "INTERNAL_ERROR",
    });

    const silent: unknown[] = [];
    const off = startOpsMonitor({ db, intervalMs: 0, firstDelayMs: 1, log: (e) => silent.push(e) });
    await new Promise((r) => setTimeout(r, 20));
    off.stop();
    expect(silent).toEqual([]);
  });
});
