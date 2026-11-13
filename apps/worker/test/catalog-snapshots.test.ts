// S8.2: the committed catalog snapshots (data/catalog/<source>/listings.json)
// are validated on every CI run, including the weekly collection PRs, before
// anything can be ingested from them.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOG_LISTING_CONTRACT_VERSION, CatalogSnapshotSchema } from "@sor/contracts";

const CATALOG_DIR = resolve(__dirname, "../../../data/catalog");

/**
 * Catalog sources reviewed, integrated and enabled by migration
 * (docs/DATA_SOURCES.md). A snapshot of any other source fails here: a new
 * source needs its terms review and an approved migration first.
 */
const APPROVED_CATALOG_SOURCES = ["hacker_news", "uneed", "wikidata"];

const sources = readdirSync(CATALOG_DIR).filter((d) =>
  statSync(join(CATALOG_DIR, d)).isDirectory(),
);

describe("committed catalog snapshots", () => {
  it("exist only for approved catalog sources", () => {
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) expect(APPROVED_CATALOG_SOURCES).toContain(s);
  });

  describe.each(sources)("%s", (source) => {
    const raw: unknown = JSON.parse(
      readFileSync(join(CATALOG_DIR, source, "listings.json"), "utf8"),
    );
    const parsed = CatalogSnapshotSchema.safeParse(raw);

    it("matches the catalog listing contract", () => {
      expect(parsed.error?.issues.slice(0, 3) ?? []).toEqual([]);
      expect(parsed.data?.contract_version).toBe(CATALOG_LISTING_CONTRACT_VERSION);
      expect(parsed.data?.source_key).toBe(source);
      expect(parsed.data?.listings.length).toBeGreaterThan(0);
    });

    it("keeps one source, licence and retrieval date per snapshot", () => {
      const s = parsed.data!;
      const off = s.listings.filter(
        (l) =>
          l.source_key !== s.source_key ||
          l.licence !== s.licence ||
          l.retrieved_at !== s.retrieved_at,
      );
      expect(off.map((l) => l.external_id).slice(0, 5)).toEqual([]);
    });

    it("has no duplicate source identifiers", () => {
      const ids = parsed.data!.listings.map((l) => l.external_id);
      const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
      expect(dup.slice(0, 5)).toEqual([]);
    });

    it("records official websites without query strings, never the directory page", () => {
      const bad = parsed.data!.listings.filter((l) => {
        const site = new URL(l.website_url);
        return (
          site.search !== "" || site.hash !== "" || site.hostname === new URL(l.source_url).hostname
        );
      });
      expect(bad.map((l) => l.website_url).slice(0, 5)).toEqual([]);
    });

    it("reports every query, with the reason of any failed one", () => {
      const q = parsed.data!.queries;
      expect(q.some((x) => x.status === "ok")).toBe(true);
      expect(q.filter((x) => x.status === "error" && !x.error)).toEqual([]);
    });
  });
});
