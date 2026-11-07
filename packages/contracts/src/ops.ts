// Platform monitoring (Sprint 7, S7.3; Technical Blueprint §15): the
// server-only snapshot returned by sor_ops_snapshot and the alerts derived
// from it by deterministic code (@sor/domain evaluateOpsAlerts).
import { z } from "zod";
import { ISODateTimeSchema, UUIDSchema } from "./common";
import { JobKindSchema, JobStateSchema, TerminalReasonSchema } from "./jobs";

const Count = z.number().int().nonnegative();
const Usd = z.number().nonnegative();

export const OpsStuckJobSchema = z
  .object({
    id: UUIDSchema,
    job_kind: JobKindSchema,
    workspace_id: UUIDSchema.nullable(),
    state: JobStateSchema,
    attempt_count: Count,
    reason: z.enum(["lease_expired", "queue_wait"]),
    since: ISODateTimeSchema,
  })
  .strict();

export const OpsFailureSchema = z
  .object({
    id: UUIDSchema,
    job_kind: JobKindSchema,
    workspace_id: UUIDSchema.nullable(),
    state: z.enum(["failed", "dead_letter"]),
    terminal_reason: TerminalReasonSchema.nullable(),
    attempt_count: Count,
    last_error_code: z.string().nullable(),
    completed_at: ISODateTimeSchema.nullable(),
  })
  .strict();

export const OpsThresholdsSchema = z
  .object({
    stale_lease_grace_seconds: Count,
    queue_wait_alert_seconds: Count,
    dead_letters_per_day: Count,
    failure_rate_pct: Count,
    budget_exhaustion_rate_pct: Count,
    provider_error_rate_pct: Count,
    ai_cost_usd_per_day: Usd,
    min_sample: Count,
    min_provider_calls: Count,
  })
  .strict();

export const OpsSnapshotSchema = z
  .object({
    generated_at: ISODateTimeSchema,
    queue: z
      .object({
        queued: Count,
        running: Count,
        retrying: Count,
        oldest_due_wait_seconds: Count,
        messages: Count,
      })
      .strict(),
    stuck: z
      .object({
        stale_leases: Count,
        queue_wait: Count,
        jobs: z.array(OpsStuckJobSchema).max(20),
      })
      .strict(),
    jobs_24h: z
      .object({
        finished: Count,
        completed: Count,
        partial: Count,
        failed: Count,
        cancelled: Count,
        dead_letter: Count,
        budget_exhausted: Count,
      })
      .strict(),
    recent_failures: z.array(OpsFailureSchema).max(20),
    providers_1h: z.array(z.object({ provider: z.string(), calls: Count, errors: Count }).strict()),
    cost: z
      .object({
        today_usd: Usd,
        last_7_days: z.array(
          z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), usd: Usd }).strict(),
        ),
        by_provider_today: z.array(z.object({ provider: z.string(), usd: Usd }).strict()),
        top_workspaces_today: z.array(z.object({ workspace_id: UUIDSchema, usd: Usd }).strict()),
      })
      .strict(),
    thresholds: OpsThresholdsSchema,
  })
  .strict();
export type OpsSnapshot = z.infer<typeof OpsSnapshotSchema>;

export const OpsAlertKeySchema = z.string().regex(/^[a-z_]{3,60}(:[a-z0-9_.-]{1,60})?$/);
export const OpsAlertSeveritySchema = z.enum(["warning", "critical"]);

/** An alert that holds now (input of sor_ops_sync_alerts). */
export const OpsAlertSchema = z
  .object({
    key: OpsAlertKeySchema,
    severity: OpsAlertSeveritySchema,
    message: z.string().min(1).max(500),
    details: z.record(z.string(), z.unknown()),
  })
  .strict();
export type OpsAlert = z.infer<typeof OpsAlertSchema>;

/** Transitions returned by sor_ops_sync_alerts. */
export const OpsAlertSyncSchema = z
  .object({
    opened: z.array(OpsAlertKeySchema),
    resolved: z.array(OpsAlertKeySchema),
    open: Count,
  })
  .strict();
export type OpsAlertSync = z.infer<typeof OpsAlertSyncSchema>;
