// S8.5 (PD-38): visual references collection and loading, with fakes (no
// network, no database).
import { describe, expect, it } from "vitest";
import type { CatalogListing, VisualReference } from "@sor/contracts";
import type { DbClient } from "@sor/database";
import { collectLicensed, collectPublisher, type ShareImageCollector } from "../visuals/collect";
import { ingestVisualReferences } from "../visuals/ingest";

function listing(source: "wikidata" | "uneed", id: string, website: string | null): CatalogListing {
  return {
    source_key: source,
    external_id: id,
    source_url:
      source === "wikidata"
        ? `https://www.wikidata.org/wiki/${id}`
        : `https://www.uneed.best/tool/${id}`,
    name: `Product ${id}`,
    description: null,
    website_url: website,
    launch_year: null,
    country_code: null,
    company_name: null,
    company_external_id: null,
    source_categories: [],
    licence: "test",
    retrieved_at: "2026-11-10T00:00:00Z",
  } as unknown as CatalogListing;
}

const shareImage = (overrides: Partial<VisualReference> = {}): VisualReference => ({
  kind: "publisher",
  listing_source_key: "uneed",
  listing_external_id: "x",
  product_name: "x",
  image_url: "https://cdn.example.com/og.png",
  page_url: "https://example.com/",
  content_hash: "e".repeat(64),
  content_type: "image/png",
  width: 1200,
  height: 630,
  alt_text: "Share image (synthetic test case)",
  observed_at: "2026-11-12T10:00:00.000Z",
  licence_code: null,
  licence_url: null,
  attribution: null,
  ...overrides,
});

describe("collectPublisher", () => {
  it("fetches each official site once and keeps every listing's identity", async () => {
    const calls: string[] = [];
    const collect: ShareImageCollector = async (l) => {
      calls.push(l.website_url ?? "");
      if (l.website_url?.includes("example.com")) return { reference: shareImage() };
      return { rejection: "no_share_image" };
    };
    const snapshot = await collectPublisher({
      listings: [
        listing("wikidata", "Q1", "https://example.com/"),
        listing("uneed", "example", "https://www.example.com"),
        listing("uneed", "other", "https://other.test/"),
        listing("uneed", "nosite", null),
      ],
      collect,
      concurrency: 2,
      now: () => new Date("2026-11-12T10:00:00Z"),
    });
    expect(calls.filter((c) => c.includes("example.com"))).toHaveLength(1);
    expect(snapshot.summary).toEqual({
      candidates: 4,
      references: 2,
      rejected: { no_share_image: 2 },
    });
    expect(
      snapshot.references.map((r) => `${r.listing_source_key}:${r.listing_external_id}`),
    ).toEqual(["uneed:example", "wikidata:Q1"]);
    expect(snapshot.references[1]!.product_name).toBe("Product Q1");
  });

  it("counts a collector failure instead of stopping the run", async () => {
    const snapshot = await collectPublisher({
      listings: [listing("uneed", "boom", "https://boom.test/")],
      collect: async () => {
        throw new TypeError("network down");
      },
    });
    expect(snapshot.summary.rejected).toEqual({ error_TypeError: 1 });
  });
});

describe("collectLicensed", () => {
  it("only asks Wikimedia about Wikidata listings", async () => {
    const queries: string[] = [];
    const snapshot = await collectLicensed({
      listings: [
        listing("wikidata", "Q7", "https://seven.test/"),
        listing("uneed", "u", "https://u.test/"),
      ],
      run: async (q) => {
        queries.push(q);
        return { results: { bindings: [] } };
      },
      get: async () => ({ query: { pages: [] } }),
    });
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("wd:Q7");
    expect(snapshot.summary).toEqual({
      candidates: 1,
      references: 0,
      rejected: { no_image_on_wikidata: 1 },
    });
  });
});

describe("ingestVisualReferences", () => {
  it("records each reference and summarises the statuses", async () => {
    const answers = [
      { data: { status: "created", primary: true }, error: null },
      { data: { status: "existing" }, error: null },
      { data: { status: "no_product" }, error: null },
      { data: null, error: { code: "22023", message: "VALIDATION_ERROR: visual reference" } },
    ];
    let i = 0;
    const db = { rpc: async () => answers[i++] } as unknown as DbClient;
    const summary = await ingestVisualReferences(
      db,
      {
        contract_version: "visual-references-1",
        kind: "publisher",
        rules_version: "visref-1",
        collected_at: "2026-11-12T10:00:00.000Z",
        summary: { candidates: 4, references: 4, rejected: {} },
        references: [shareImage(), shareImage(), shareImage(), shareImage()],
      },
      { concurrency: 1 },
    );
    expect(summary.statuses).toEqual({ created: 1, existing: 1, no_product: 1, error: 1 });
    expect(summary.primary).toBe(1);
    expect(summary.errors).toHaveLength(1);
  });
});
