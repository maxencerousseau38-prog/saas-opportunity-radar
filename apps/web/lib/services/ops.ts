// Platform health for the operator console (Sprint 7, S7.3): the server-only
// snapshot, the alerts that hold now (deterministic rules, @sor/domain) and
// the recorded alert history (written by the worker's monitoring cycle).
import "server-only";
import { OpsSnapshotSchema } from "@sor/contracts";
import { opsRepo } from "@sor/database";
import { evaluateOpsAlerts } from "@sor/domain";
import { getServiceClient } from "@/lib/supabase/server";

export async function platformHealth() {
  const service = getServiceClient();
  const [raw, history] = await Promise.all([
    opsRepo.snapshot(service),
    opsRepo.listAlerts(service),
  ]);
  const snapshot = OpsSnapshotSchema.parse(raw);
  return { snapshot, alerts: evaluateOpsAlerts(snapshot), history };
}

export type PlatformHealth = Awaited<ReturnType<typeof platformHealth>>;
