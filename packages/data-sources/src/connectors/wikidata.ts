// Wikidata catalog connector (first bulk catalog source, 10 November 2026;
// terms review in docs/DATA_SOURCES.md, pages frozen in docs/sources/terms).
//
// - Licence: "All structured data (i.e. the main, Property, Lexeme, and
//   EntitySchema namespaces) is released into the public domain under
//   Creative Commons Zero" (Wikidata:Licensing).
// - Access: the public query service (https://query.wikidata.org/sparql).
//   Limits stated by the WDQS user manual: 60 s query deadline, "One client
//   (user agent + IP) is allowed 60 seconds of processing time each 60
//   seconds", "access to the service is limited to 5 parallel queries per
//   IP", HTTP 429 when exceeded; clients must send a descriptive User-Agent.
//   The collector runs its queries one after the other with a pause, and
//   stops a query on 429 instead of retrying in a loop.
//
// The connector only reads and normalizes; it never writes to the catalog.
// A listing is a lead with declared facts: the ingester resolves identity,
// applies the permanent exclusion classifier and records provenance.
import {
  CATALOG_LISTING_CONTRACT_VERSION,
  CatalogListingSchema,
  type CatalogListing,
  type CatalogSnapshot,
} from "@sor/contracts/listings";

export const WIKIDATA_SOURCE_KEY = "wikidata";
export const WIKIDATA_SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
export const WIKIDATA_LICENCE = "CC0-1.0";
/** Descriptive User-Agent (Wikimedia User-Agent policy): tool name + contact URL. */
export const WIKIDATA_USER_AGENT =
  "SaaSOpportunityRadar/0.1 (catalog collection; https://github.com/maxencerousseau38-prog/saas-opportunity-radar)";

/** Classes whose items are not software products (websites, games, media, social networks). */
export const NON_PRODUCT_CLASSES = [
  "Q35127", // website
  "Q3220391", // social networking service
  "Q7889", // video game
  "Q1153191", // online newspaper
  "Q4182287", // search engine
  "Q17633526", // Wikinews article (defensive)
  "Q13442814", // scholarly article (defensive)
];

/** Words in a source class label that mark a non-product item (checked after the query). */
const NON_PRODUCT_LABELS =
  /\b(video game|website|web portal|social network|online newspaper|news website|blog|online encyclopedia|wiki|dating|pornograph|online casino|gambling|cryptocurrency|television|film|tv series|magazine)\b/i;

export interface WikidataQuery {
  key: string;
  /** SPARQL triple patterns selecting ?item. */
  pattern: string;
  limit: number;
}

/** The item selections of the collection (one query each, run one after the other). */
export const WIKIDATA_QUERIES: WikidataQuery[] = [
  {
    key: "saas_instances",
    pattern: "?item wdt:P31/wdt:P279* wd:Q1254596 .", // instance of (a subclass of) software as a service
    limit: 20000,
  },
  {
    key: "saas_distribution",
    pattern: "?item wdt:P437 wd:Q1254596 .", // distribution format: software as a service
    limit: 20000,
  },
  {
    key: "web_applications",
    pattern: "?item wdt:P31 wd:Q189210 .", // instance of web application
    limit: 20000,
  },
];

/** SPARQL for one selection: active items with an official website and an English label. */
export function buildWikidataQuery(q: WikidataQuery): string {
  const excluded = NON_PRODUCT_CLASSES.map((c) => `wd:${c}`).join(" ");
  return `SELECT ?item ?label (SAMPLE(?desc) AS ?description) (SAMPLE(?site) AS ?website)
  (MIN(?inc) AS ?inception) (SAMPLE(?cc) AS ?countryCode) (SAMPLE(?dcc) AS ?developerCountryCode)
  (SAMPLE(?devLabel) AS ?developer)
  (GROUP_CONCAT(DISTINCT ?clsLabel; separator="|") AS ?classes)
WHERE {
  { SELECT DISTINCT ?item WHERE {
      ${q.pattern}
      ?item wdt:P856 [] .
      FILTER NOT EXISTS { ?item wdt:P576 [] }
      FILTER NOT EXISTS { ?item wdt:P2669 [] }
      FILTER NOT EXISTS { ?item wdt:P31 ?bad . VALUES ?bad { ${excluded} } }
    } LIMIT ${q.limit} }
  ?item rdfs:label ?label . FILTER(LANG(?label) = "en")
  ?item wdt:P856 ?site .
  OPTIONAL { ?item schema:description ?desc . FILTER(LANG(?desc) = "en") }
  OPTIONAL { ?item wdt:P571 ?inc }
  OPTIONAL { ?item wdt:P495 ?c . ?c wdt:P297 ?cc }
  OPTIONAL { ?item wdt:P178 ?dev . ?dev rdfs:label ?devLabel . FILTER(LANG(?devLabel) = "en")
             OPTIONAL { ?dev wdt:P17 ?dc . ?dc wdt:P297 ?dcc } }
  OPTIONAL { { ?item wdt:P31 ?cls } UNION { ?item wdt:P136 ?cls } UNION { ?item wdt:P366 ?cls }
             ?cls rdfs:label ?clsLabel . FILTER(LANG(?clsLabel) = "en") }
}
GROUP BY ?item ?label`;
}

interface SparqlValue {
  type: string;
  value: string;
}
type SparqlBinding = Record<string, SparqlValue | undefined>;

const QID = /^http:\/\/www\.wikidata\.org\/entity\/(Q\d+)$/;

function yearOf(value: string | undefined): number | null {
  if (!value) return null;
  const m = /^\+?(\d{4})-/.exec(value);
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 1970 && y <= 2100 ? y : null;
}

/** Keeps an http(s) URL; Wikidata sometimes stores `http://` or uppercase hosts. */
function websiteOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Normalizes SPARQL JSON results into listings. Rows that fail the listing
 * contract (no usable website, a label that is only an id, a non-product
 * class) are dropped and counted.
 */
export function parseWikidataResults(
  json: unknown,
  retrievedAt: string,
): { listings: CatalogListing[]; dropped: number } {
  const bindings = (json as { results?: { bindings?: SparqlBinding[] } })?.results?.bindings ?? [];
  const listings: CatalogListing[] = [];
  let dropped = 0;
  for (const b of bindings) {
    const qid = QID.exec(b.item?.value ?? "")?.[1];
    const name = b.label?.value?.trim();
    const website = websiteOf(b.website?.value);
    const classes = (b.classes?.value ?? "")
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
    if (
      !qid ||
      !name ||
      !website ||
      /^Q\d+$/.test(name) ||
      classes.some((c) => NON_PRODUCT_LABELS.test(c))
    ) {
      dropped++;
      continue;
    }
    const country = (b.countryCode?.value ?? b.developerCountryCode?.value ?? "").trim();
    const candidate = {
      source_key: WIKIDATA_SOURCE_KEY,
      external_id: qid,
      source_url: `https://www.wikidata.org/wiki/${qid}`,
      name: name.slice(0, 200),
      description: b.description?.value?.trim().slice(0, 500) || null,
      website_url: website,
      launch_year: yearOf(b.inception?.value),
      country_code: /^[A-Za-z]{2}$/.test(country) ? country : null,
      company_name: b.developer?.value?.trim().slice(0, 200) || null,
      source_categories: [...new Set(classes)].slice(0, 30).map((c) => c.slice(0, 200)),
      licence: WIKIDATA_LICENCE,
      retrieved_at: retrievedAt,
    };
    const parsed = CatalogListingSchema.safeParse(candidate);
    if (parsed.success) listings.push(parsed.data);
    else dropped++;
  }
  return { listings, dropped };
}

/** Runs one SPARQL query; injected so tests never touch the network. */
export type SparqlRunner = (query: string) => Promise<unknown>;

/**
 * Collects every selection, one query after the other, and merges the
 * listings by QID (a product selected by several queries keeps the union of
 * its source categories). A failed query is reported, never retried in a loop.
 */
export async function collectWikidata(options: {
  run: SparqlRunner;
  queries?: WikidataQuery[];
  pauseMs?: number;
  now?: () => Date;
}): Promise<CatalogSnapshot> {
  const now = options.now ?? (() => new Date());
  const queries = options.queries ?? WIKIDATA_QUERIES;
  const retrievedAt = now().toISOString();
  const byId = new Map<string, CatalogListing>();
  const report: CatalogSnapshot["queries"] = [];
  for (const [i, q] of queries.entries()) {
    if (i > 0 && options.pauseMs) await new Promise((r) => setTimeout(r, options.pauseMs));
    try {
      const json = await options.run(buildWikidataQuery(q));
      const { listings } = parseWikidataResults(json, retrievedAt);
      for (const l of listings) {
        const prev = byId.get(l.external_id);
        byId.set(
          l.external_id,
          prev
            ? {
                ...prev,
                source_categories: [
                  ...new Set([...prev.source_categories, ...l.source_categories]),
                ].slice(0, 30),
              }
            : l,
        );
      }
      report.push({ key: q.key, status: "ok", rows: listings.length });
    } catch (err) {
      report.push({
        key: q.key,
        status: "error",
        rows: 0,
        error: (err instanceof Error ? err.message : String(err)).slice(0, 300),
      });
    }
  }
  const listings = [...byId.values()].sort(
    (a, b) => Number(a.external_id.slice(1)) - Number(b.external_id.slice(1)),
  );
  return {
    contract_version: CATALOG_LISTING_CONTRACT_VERSION,
    source_key: WIKIDATA_SOURCE_KEY,
    licence: WIKIDATA_LICENCE,
    retrieved_at: retrievedAt,
    queries: report,
    listings,
  };
}

/** SPARQL runner over HTTPS with the descriptive User-Agent and a hard timeout. */
export function wikidataHttpRunner(
  options: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): SparqlRunner {
  const fetchImpl = options.fetchImpl ?? fetch;
  return async (query) => {
    const res = await fetchImpl(WIKIDATA_SPARQL_ENDPOINT, {
      method: "POST",
      headers: {
        "user-agent": WIKIDATA_USER_AGENT,
        accept: "application/sparql-results+json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ query }).toString(),
      signal: AbortSignal.timeout(options.timeoutMs ?? 90_000),
    });
    if (!res.ok) throw new Error(`wikidata_http_${res.status}`);
    return res.json();
  };
}
