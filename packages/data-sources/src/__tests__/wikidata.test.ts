// Wikidata connector: query shape and normalization of SPARQL results.
// SYNTHETIC SPARQL responses (labelled test data); no network call.
import { describe, expect, it } from "vitest";
import {
  WIKIDATA_QUERIES,
  WIKIDATA_USER_AGENT,
  buildWikidataDetailsQuery,
  buildWikidataIdsQuery,
  collectWikidata,
  parseWikidataResults,
  wikidataHttpRunner,
} from "../connectors/wikidata";

const uri = (v: string) => ({ type: "uri", value: v });
const lit = (v: string) => ({ type: "literal", value: v });

function row(over: Record<string, unknown> = {}) {
  return {
    item: uri("http://www.wikidata.org/entity/Q100"),
    label: lit("Synthetic Tasks"),
    description: lit("synthetic project management software (test data)"),
    website: uri("https://synthetic-tasks.example/"),
    inception: lit("2014-03-01T00:00:00Z"),
    countryCode: lit("US"),
    developer: lit("Synthetic Labs"),
    developerItem: uri("http://www.wikidata.org/entity/Q900"),
    classes: lit("software as a service|project management software"),
    ...over,
  };
}
const results = (...rows: unknown[]) => ({ results: { bindings: rows } });
const AT = "2026-11-10T12:00:00.000Z";

describe("Wikidata connector", () => {
  it("selects ids with a light query, then reads details of active product items in batches", () => {
    const ids = buildWikidataIdsQuery(WIKIDATA_QUERIES[0]!);
    expect(ids).toContain("wd:Q1254596");
    expect(ids).toContain("wdt:P856");
    expect(ids).not.toContain("rdfs:label"); // no join in the ids query
    const details = buildWikidataDetailsQuery(["Q1", "Q2"]);
    expect(details).toContain("VALUES ?item { wd:Q1 wd:Q2 }");
    expect(details).toContain("FILTER NOT EXISTS { ?item wdt:P576 [] }"); // dissolved
    expect(details).toContain("FILTER NOT EXISTS { ?item wdt:P2669 [] }"); // discontinued
    expect(details).toContain("wd:Q35127"); // websites excluded
    expect(details).toContain('LANG(?label) = "en"');
    expect(WIKIDATA_QUERIES.map((x) => x.key)).toEqual([
      "saas_instances",
      "saas_distribution",
      "web_applications",
      "web_application_subclasses",
      "web_services",
      "web_browser_platform",
      "www_platform",
    ]);
  });

  it("normalizes a result row into a listing with provenance and declared facts", () => {
    const { listings, dropped } = parseWikidataResults(results(row()), AT);
    expect(dropped).toBe(0);
    expect(listings).toEqual([
      {
        source_key: "wikidata",
        external_id: "Q100",
        source_url: "https://www.wikidata.org/wiki/Q100",
        name: "Synthetic Tasks",
        description: "synthetic project management software (test data)",
        website_url: "https://synthetic-tasks.example/",
        launch_year: 2014,
        country_code: "US",
        company_name: "Synthetic Labs",
        company_external_id: "Q900",
        source_categories: ["software as a service", "project management software"],
        licence: "CC0-1.0",
        retrieved_at: AT,
      },
    ]);
  });

  it("drops query strings and fragments from the official website", () => {
    const { listings } = parseWikidataResults(
      results(row({ website: uri("https://app.example/view?r=abc123&utm_source=x#top") })),
      AT,
    );
    expect(listings[0]?.website_url).toBe("https://app.example/view");
  });

  it("keeps unknown facts unknown and falls back to the developer's country", () => {
    const { listings } = parseWikidataResults(
      results(
        row({
          description: undefined,
          inception: undefined,
          countryCode: undefined,
          developerCountryCode: lit("FR"),
          developer: undefined,
        }),
      ),
      AT,
    );
    expect(listings[0]).toMatchObject({
      description: null,
      launch_year: null,
      country_code: "FR",
      company_name: null,
      company_external_id: null,
    });
  });

  it("drops rows without a usable website, id-only labels and non-product classes", () => {
    const { listings, dropped } = parseWikidataResults(
      results(
        row({ website: uri("ftp://files.example/") }),
        row({ label: lit("Q12345") }),
        row({ classes: lit("video game") }),
        row({ classes: lit("web application|COVID-19 dashboard") }),
        row({ classes: lit("browser game") }),
        row({ item: uri("http://example.org/not-wikidata") }),
        row({
          inception: lit("1600-01-01T00:00:00Z"),
          item: uri("http://www.wikidata.org/entity/Q7"),
        }),
      ),
      AT,
    );
    expect(dropped).toBe(6);
    expect(listings).toHaveLength(1);
    expect(listings[0]?.launch_year).toBeNull(); // out-of-range year is unknown, not invented
  });

  it("unions the selections, reads details in batches, reports failures and never retries", async () => {
    const calls: string[] = [];
    const idsOf = (...q: number[]) =>
      results(...q.map((n) => ({ item: uri(`http://www.wikidata.org/entity/Q${n}`) })));
    const snapshot = await collectWikidata({
      now: () => new Date(AT),
      queries: WIKIDATA_QUERIES.slice(0, 3),
      batchSize: 2,
      run: async (query) => {
        calls.push(query);
        if (query.startsWith("SELECT DISTINCT ?item")) {
          if (calls.length === 2) throw new Error("wikidata_http_504");
          return calls.length === 1 ? idsOf(100, 20) : idsOf(100, 30);
        }
        if (query.includes("wd:Q100")) throw new Error("wikidata_http_429"); // batch [Q30, Q100]
        return results(row({ item: uri("http://www.wikidata.org/entity/Q20") }));
      },
    });
    expect(calls).toHaveLength(5); // 3 ids queries + 2 detail batches (Q20, Q30 | Q100)
    expect(snapshot.queries).toEqual([
      { key: "saas_instances", status: "ok", rows: 2 },
      { key: "saas_distribution", status: "error", rows: 0, error: "wikidata_http_504" },
      { key: "web_applications", status: "ok", rows: 2 },
      { key: "details", status: "error", rows: 1, error: "1 batch(es) failed: wikidata_http_429" },
    ]);
    expect(snapshot.listings.map((l) => l.external_id)).toEqual(["Q20"]);
  });

  it("sends the descriptive User-Agent and fails on HTTP errors", async () => {
    const seen: Array<Record<string, string>> = [];
    const runner = wikidataHttpRunner({
      fetchImpl: (async (_url: string, init: RequestInit) => {
        seen.push(init.headers as Record<string, string>);
        return new Response("busy", { status: 429 });
      }) as unknown as typeof fetch,
    });
    await expect(runner("SELECT 1")).rejects.toThrow("wikidata_http_429");
    expect(seen[0]?.["user-agent"]).toBe(WIKIDATA_USER_AGENT);
  });
});
