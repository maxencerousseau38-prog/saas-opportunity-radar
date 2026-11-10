// Catalog listings collected from external catalog sources (first bulk
// collection, 10 November 2026; docs/DATA_SOURCES.md). A listing is what a
// source says about one product, normalized to one shape for every source;
// it is ingested through identity resolution, the permanent exclusion
// classifier and the provenance pipeline, never written to the catalog as is.
import { z } from "zod";
import { CountryCodeSchema, HttpUrlSchema, ISODateTimeSchema } from "./common";

export const CATALOG_LISTING_CONTRACT_VERSION = "catalog-listing-1";

export const CatalogListingSchema = z
  .object({
    /** Registry key of the source (`sources.source_key`). */
    source_key: z.string().regex(/^[a-z0-9_]{2,60}$/),
    /** Stable identifier of the item at the source (e.g. a Wikidata QID). */
    external_id: z.string().min(1).max(200),
    /** Public page of the item at the source (provenance link). */
    source_url: HttpUrlSchema,
    name: z.string().trim().min(1).max(200),
    /** Short description as written by the source (unverified). */
    description: z.string().trim().max(500).nullable(),
    /** Official website of the product, as recorded by the source. */
    website_url: HttpUrlSchema,
    /** Year of inception / publication, when the source states it. */
    launch_year: z.number().int().min(1970).max(2100).nullable(),
    /** Country of origin (ISO 3166-1 alpha-2), when the source states it. */
    country_code: CountryCodeSchema.nullable(),
    /** Developer / company name, when the source states it. */
    company_name: z.string().trim().min(1).max(200).nullable(),
    /** Identifier of the developer / company at the source (deduplicates companies). */
    company_external_id: z.string().min(1).max(200).nullable(),
    /** Source-side classes, genres or topics (labels), used for categorisation. */
    source_categories: z.array(z.string().trim().min(1).max(200)).max(30),
    /** Licence under which the source publishes the data (e.g. CC0-1.0). */
    licence: z.string().min(1).max(100),
    retrieved_at: ISODateTimeSchema,
  })
  .strict();

export type CatalogListing = z.infer<typeof CatalogListingSchema>;

/** A collected snapshot file (data/catalog/<source>/listings.json). */
export const CatalogSnapshotSchema = z
  .object({
    contract_version: z.literal(CATALOG_LISTING_CONTRACT_VERSION),
    source_key: z.string().regex(/^[a-z0-9_]{2,60}$/),
    licence: z.string().min(1).max(100),
    retrieved_at: ISODateTimeSchema,
    /** One entry per query run by the collector, with its outcome. */
    queries: z.array(
      z.object({
        key: z.string(),
        status: z.enum(["ok", "error"]),
        rows: z.number().int().nonnegative(),
        error: z.string().optional(),
      }),
    ),
    listings: z.array(CatalogListingSchema),
  })
  .strict();

export type CatalogSnapshot = z.infer<typeof CatalogSnapshotSchema>;
