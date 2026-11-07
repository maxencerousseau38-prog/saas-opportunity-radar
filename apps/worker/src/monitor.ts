// Platform monitoring cycle (Sprint 7, S7.3; Technical Blueprint §15).
// Render background workers have no metrics or alert service of their own
// (PD-27) and no paid monitoring product is approved, so the worker reads the
// platform snapshot, evaluates the alerts with deterministic rules
// (@sor/domain) and records their state in the database; every change is one
// structured JSON log line that a log-based alert can match:
//   {"level":"error"|"warn","msg":"alert opened","alert_key":...}
//   {"level":"info","msg":"alert resolved","alert_key":...}
// The open alerts and their history are shown in the operator console.
import { OpsAlertSyncSchema, OpsSnapshotSchema, type OpsAlert } from "@sor/contracts";
import { DbError, opsRepo, type DbClient, type Json } from "@sor/database";
import { evaluateOpsAlerts } from "@sor/domain";
import type { Log } from "./runtime";

export interface MonitorResult {
  alerts: OpsAlert[];
  opened: string[];
  resolved: string[];
  open: number;
}

/** One cycle: snapshot → alerts → state sync → logs. */
export async function monitorOnce(db: DbClient, log: Log): Promise<MonitorResult> {
  const snapshot = OpsSnapshotSchema.parse(await opsRepo.snapshot(db));
  const alerts = evaluateOpsAlerts(snapshot);
  const sync = OpsAlertSyncSchema.parse(await opsRepo.syncAlerts(db, alerts as unknown as Json));
  log({
    level: "info",
    msg: "ops snapshot",
    queued: snapshot.queue.queued,
    running: snapshot.queue.running,
    retrying: snapshot.queue.retrying,
    oldest_due_wait_seconds: snapshot.queue.oldest_due_wait_seconds,
    stuck_jobs: snapshot.stuck.stale_leases,
    queue_backlog: snapshot.stuck.queue_wait,
    finished_24h: snapshot.jobs_24h.finished,
    failed_24h: snapshot.jobs_24h.failed,
    dead_letter_24h: snapshot.jobs_24h.dead_letter,
    budget_exhausted_24h: snapshot.jobs_24h.budget_exhausted,
    ai_cost_usd_today: Math.round(snapshot.cost.today_usd * 100) / 100,
    open_alerts: sync.open,
  });
  for (const key of sync.opened) {
    const alert = alerts.find((a) => a.key === key);
    if (!alert) continue;
    log({
      level: alert.severity === "critical" ? "error" : "warn",
      msg: "alert opened",
      alert_key: alert.key,
      severity: alert.severity,
      message: alert.message,
      details: alert.details,
    });
  }
  for (const key of sync.resolved) log({ level: "info", msg: "alert resolved", alert_key: key });
  return { alerts, opened: sync.opened, resolved: sync.resolved, open: sync.open };
}

export interface MonitorHandle {
  stop(): void;
}

/**
 * Runs monitorOnce every `intervalMs` (and once after `firstDelayMs`). A
 * failing cycle is logged and never stops the worker; cycles never overlap.
 * `intervalMs <= 0` disables the monitor.
 */
export function startOpsMonitor(options: {
  db: DbClient;
  intervalMs: number;
  log: Log;
  firstDelayMs?: number;
}): MonitorHandle {
  if (options.intervalMs <= 0) return { stop() {} };
  let busy = false;
  const cycle = async () => {
    if (busy) return;
    busy = true;
    try {
      await monitorOnce(options.db, options.log);
    } catch (err) {
      options.log({
        level: "error",
        msg: "ops monitor failed",
        error: err instanceof DbError ? err.code : err instanceof Error ? err.name : "unknown",
      });
    } finally {
      busy = false;
    }
  };
  const first = setTimeout(() => void cycle(), options.firstDelayMs ?? 10_000);
  first.unref();
  const timer = setInterval(() => void cycle(), options.intervalMs);
  timer.unref();
  return {
    stop() {
      clearTimeout(first);
      clearInterval(timer);
    },
  };
}
