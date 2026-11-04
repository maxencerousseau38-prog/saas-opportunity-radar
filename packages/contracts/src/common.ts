// Implementation Blueprint §4.1 — shared primitives.
import { z } from "zod";

export const UUIDSchema = z.string().uuid();
export const ISODateTimeSchema = z.string().datetime({ offset: true });
export const CountryCodeSchema = z
  .string()
  .regex(/^[A-Za-z]{2}$/)
  .transform((v) => v.toUpperCase());
export const CurrencyCodeSchema = z
  .string()
  .regex(/^[A-Za-z]{3}$/)
  .transform((v) => v.toUpperCase());
export const ConfidenceSchema = z.number().min(0).max(100);
export const SlugSchema = z.string().regex(/^[a-z0-9-]{1,220}$/);

/** Only http(s) URLs: plain `.url()` would also accept `javascript:` and other schemes. */
export const HttpUrlSchema = z
  .string()
  .max(2048)
  .url()
  .refine(
    (u) => {
      try {
        const p = new URL(u).protocol;
        return p === "http:" || p === "https:";
      } catch {
        return false;
      }
    },
    { message: "Only http(s) URLs are allowed" },
  );

export const FactStatusSchema = z.enum(["confirmed", "estimated", "declared", "unknown"]);
export const VerificationStatusSchema = z.enum([
  "unverified",
  "verified",
  "needs_review",
  "rejected",
  "stale",
]);
export const ReliabilityLevelSchema = z.number().int().min(1).max(4);

export const CursorPaginationSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(30),
    cursor: z.string().max(1000).optional(), // opaque, signed by the server
  })
  .strict();

export const ApiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        details: z.object({}).passthrough().optional(),
        request_id: UUIDSchema,
      })
      .strict(),
  })
  .strict();

/** Agents cite only identifiers they were given. */
export const EvidenceRefSchema = z
  .object({
    evidence_id: UUIDSchema,
    support_type: z.enum(["supports", "contradicts", "context"]).default("supports"),
    relevance_score: ConfidenceSchema.optional(),
  })
  .strict();

export const SnapshotRefSchema = z
  .object({
    source_snapshot_id: UUIDSchema,
    quote_or_locator: z.string().max(500).nullable(), // short locator, not a long copy
  })
  .strict();

export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;
export type SnapshotRef = z.infer<typeof SnapshotRefSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
