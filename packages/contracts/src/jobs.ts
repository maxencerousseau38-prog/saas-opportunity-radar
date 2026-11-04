// Implementation Blueprint §4.10 — queue envelope and job DTOs.
import { z } from "zod";
import { UUIDSchema } from "./common";

const Base = { schema_version: z.literal("job.v1"), job_execution_id: UUIDSchema };

export const JobKindSchema = z.enum([
  "product_enrichment",
  "product_refresh",
  "source_sync",
  "catalog_import",
  "feedback_import",
  "discovery_run",
  "pain_point_run",
  "opportunity_analysis",
  "report_export",
  "data_export",
]);

export const JobEnvelopeSchema = z.discriminatedUnion("kind", [
  z.object({ ...Base, kind: z.literal("product_enrichment") }).strict(),
  z.object({ ...Base, kind: z.literal("product_refresh") }).strict(),
  z.object({ ...Base, kind: z.literal("source_sync") }).strict(),
  z.object({ ...Base, kind: z.literal("catalog_import") }).strict(),
  z.object({ ...Base, kind: z.literal("feedback_import") }).strict(),
  z.object({ ...Base, kind: z.literal("discovery_run") }).strict(),
  z.object({ ...Base, kind: z.literal("pain_point_run") }).strict(),
  z.object({ ...Base, kind: z.literal("opportunity_analysis") }).strict(),
  z.object({ ...Base, kind: z.literal("report_export") }).strict(),
  z.object({ ...Base, kind: z.literal("data_export") }).strict(),
]);

export const JobStateSchema = z.enum([
  "queued",
  "running",
  "retrying",
  "completed",
  "partial",
  "failed",
  "cancelled",
  "dead_letter",
]);

export const TerminalReasonSchema = z.enum([
  "completed",
  "partial",
  "failed",
  "cancelled",
  "dead_letter",
  "budget_exhausted",
]);

/** Idempotency-Key header of job-creating POSTs (§10). */
export const IdempotencyKeySchema = z
  .string()
  .min(8)
  .max(200)
  .regex(/^[A-Za-z0-9_.:-]+$/);

/** Job status DTO (job_executions is server-only; this is what the API exposes). */
export const JobStatusSchema = z
  .object({
    id: UUIDSchema,
    kind: JobKindSchema,
    state: JobStateSchema,
    terminal_reason: TerminalReasonSchema.nullable(),
    attempt_count: z.number().int(),
    created_at: z.string(),
    started_at: z.string().nullable(),
    completed_at: z.string().nullable(),
    error_code: z.string().nullable(),
    result: z.object({}).passthrough(),
    status_url: z.string(),
  })
  .strict();

export type JobEnvelope = z.infer<typeof JobEnvelopeSchema>;
export type JobKind = z.infer<typeof JobKindSchema>;
export type JobState = z.infer<typeof JobStateSchema>;
export type TerminalReason = z.infer<typeof TerminalReasonSchema>;
export type JobStatus = z.infer<typeof JobStatusSchema>;
