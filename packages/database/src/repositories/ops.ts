// Platform monitoring (Sprint 7, S7.3): snapshot, alert state and history.
// Service role only (the tables and functions are server-only).
import type { DbClient } from "../clients";
import { mapPostgresError } from "../errors";
import type { Json } from "../generated";

function check<T>(res: { data: T; error: { code?: string; message?: string } | null }): T {
  if (res.error) throw mapPostgresError(res.error);
  return res.data;
}

/** Raw snapshot document (validate with OpsSnapshotSchema). */
export async function snapshot(service: DbClient): Promise<Json> {
  return check(await service.rpc("sor_ops_snapshot"));
}

/** Records the alerts that hold now; returns the transitions (validate with OpsAlertSyncSchema). */
export async function syncAlerts(service: DbClient, alerts: Json): Promise<Json> {
  return check(await service.rpc("sor_ops_sync_alerts", { p_alerts: alerts }));
}

const ALERT_COLUMNS =
  "id, alert_key, severity, message, details, opened_at, last_seen_at, resolved_at";

/** Open alerts, then the most recently resolved ones. */
export async function listAlerts(service: DbClient, recentResolved = 20) {
  const open = check(
    await service
      .from("ops_alerts")
      .select(ALERT_COLUMNS)
      .is("resolved_at", null)
      .order("opened_at", { ascending: false })
      .limit(100),
  );
  const resolved = check(
    await service
      .from("ops_alerts")
      .select(ALERT_COLUMNS)
      .not("resolved_at", "is", null)
      .order("resolved_at", { ascending: false })
      .limit(recentResolved),
  );
  return { open: open ?? [], resolved: resolved ?? [] };
}
