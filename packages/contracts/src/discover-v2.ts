// S8.3 Discover V2 completion contracts (ADR-016, ADR-017).
import { z } from "zod";
import { ISODateTimeSchema } from "./common";

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

// ------------------------------------------------------------ S8.5 visual references (PD-38)

/**
 * One visual displayed by reference (no copy stored): a free-licence image
 * from Wikimedia Commons (`licensed`) or the share image a publisher declares
 * on its own official site (`publisher`). Collected by the worker CLI
 * `visuals.js collect` (Catalog visuals workflow), loaded by `visuals.js ingest`
 * through `sor_record_visual_reference`.
 */
export const VisualReferenceSchema = z
  .object({
    kind: z.enum(["licensed", "publisher"]),
    /** The catalog listing the visual belongs to (identity in the catalog). */
    listing_source_key: z.string().regex(/^[a-z0-9_]{2,60}$/),
    listing_external_id: z.string().min(1).max(200),
    product_name: z.string().min(1).max(200),
    image_url: HttpsUrlSchema,
    /** Commons file page, or the official page that declares the image. */
    page_url: HttpsUrlSchema,
    content_hash: z.string().regex(/^[0-9a-f]{16,128}$/),
    content_type: z.enum(["image/png", "image/jpeg", "image/webp"]),
    width: z.number().int().min(1).max(20000),
    height: z.number().int().min(1).max(20000),
    alt_text: z.string().min(1).max(500),
    observed_at: ISODateTimeSchema,
    licence_code: z
      .string()
      .regex(/^(CC0-1\.0|Public-Domain|CC-BY(-SA)?-(1\.0|2\.0|2\.5|3\.0|4\.0))$/)
      .nullable(),
    licence_url: z.string().url().nullable(),
    attribution: z.string().min(1).max(300).nullable(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.kind === "licensed") {
      if (!r.licence_code || !r.licence_url) {
        ctx.addIssue({ code: "custom", message: "a free-licence image needs its licence" });
      }
      if (r.licence_code?.startsWith("CC-BY") && !r.attribution) {
        ctx.addIssue({ code: "custom", message: "CC BY / CC BY-SA need the attribution" });
      }
      if (!/^https:\/\/upload\.wikimedia\.org\//.test(r.image_url)) {
        ctx.addIssue({
          code: "custom",
          message: "a free-licence image comes from Wikimedia Commons",
        });
      }
    } else if (r.licence_code || r.licence_url || r.attribution) {
      ctx.addIssue({ code: "custom", message: "a publisher share image carries no licence" });
    }
  });

export const VisualReferenceSnapshotSchema = z
  .object({
    contract_version: z.literal("visual-references-1"),
    kind: z.enum(["licensed", "publisher"]),
    rules_version: z.string().min(1).max(40),
    collected_at: ISODateTimeSchema,
    /** Listings examined, references kept, and why the others were not. */
    summary: z
      .object({
        candidates: z.number().int().min(0),
        references: z.number().int().min(0),
        rejected: z.record(z.string(), z.number().int().min(0)),
      })
      .strict(),
    references: z.array(VisualReferenceSchema),
  })
  .strict();

export type VisualReference = z.infer<typeof VisualReferenceSchema>;
export type VisualReferenceSnapshot = z.infer<typeof VisualReferenceSnapshotSchema>;
