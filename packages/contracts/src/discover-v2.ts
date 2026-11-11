// S8.3 Discover V2 completion contracts (ADR-016, ADR-017).
import { z } from "zod";

const HttpsUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .url()
  .refine((u) => u.toLowerCase().startsWith("https://"), "https URL required");

/**
 * Operator records an Acquisition Channel of a catalog SaaS from a page it
 * cites (PRD §24.3). The channel spelling is normalized server-side against
 * the registry of @sor/domain; the confidence is computed there (chanconf-1).
 */
export const OperatorChannelRecordSchema = z
  .object({
    /** Slug of the catalog SaaS (as in its profile URL). */
    product_slug: z.string().trim().min(1).max(200),
    channel: z.string().trim().min(1).max(80),
    role: z.enum(["primary", "secondary"]),
    status: z.enum(["confirmed", "declared", "estimated"]),
    evidence_kind: z.enum(["official_statement", "third_party_report", "inference"]),
    /** The operator opened the source and it states the claim. */
    verified: z.boolean(),
    /** The excerpt is a direct quotation of the source (not a paraphrase). */
    direct_excerpt: z.boolean(),
    source_url: HttpsUrlSchema,
    excerpt: z.string().trim().min(1).max(2000),
    observed_at: z.iso.date(),
    rationale: z.string().trim().max(1000).optional(),
    role_rationale: z.string().trim().max(1000).optional(),
  })
  .strict();

export const OperatorReasonSchema = z
  .object({ reason: z.string().trim().min(1).max(1000) })
  .strict();

/**
 * One visual to admit (worker CLI `assets:admit`, ADR-016). Every field about
 * rights is mandatory: nothing is downloaded unless the documented rights
 * cover a private copy. Remote embedding is not supported.
 */
export const VisualAssetManifestEntrySchema = z
  .object({
    product_slug: z.string().trim().min(1).max(200),
    asset_type: z.enum(["official_hero", "product_screenshot", "official_illustration"]),
    image_url: HttpsUrlSchema,
    page_url: HttpsUrlSchema,
    alt_text: z.string().trim().min(1).max(500),
    observed_at: z.iso.date().optional(),
    primary: z.boolean().default(true),
    rights: z
      .object({
        status: z.enum(["approved", "unknown", "restricted"]),
        basis: z.string().trim().max(1000),
        evidence_url: HttpsUrlSchema.nullable(),
        covers_private_copy: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const VisualAssetManifestSchema = z
  .object({
    manifest_version: z.literal("visual-assets-1"),
    assets: z.array(VisualAssetManifestEntrySchema).min(1).max(200),
  })
  .strict();

export type OperatorChannelRecord = z.infer<typeof OperatorChannelRecordSchema>;
export type VisualAssetManifestEntry = z.infer<typeof VisualAssetManifestEntrySchema>;
export type VisualAssetManifest = z.infer<typeof VisualAssetManifestSchema>;
