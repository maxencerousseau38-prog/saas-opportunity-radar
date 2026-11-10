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

/**
 * The item selections of the collection. Each one is a light query that only
 * returns item ids; details are then read in small batches (one heavy query
 * over thousands of items exceeds the 60 s deadline: HTTP 504).
 */
export const WIKIDATA_QUERIES: WikidataQuery[] = [
  {
    key: "saas_instances",
    pattern: "?item wdt:P31/wdt:P279* wd:Q1254596 .", // instance of (a subclass of) software as a service
    limit: 30000,
  },
  {
    key: "saas_distribution",
    pattern: "?item wdt:P437 wd:Q1254596 .", // distribution format: software as a service
    limit: 30000,
  },
  {
    key: "web_applications",
    pattern: "?item wdt:P31 wd:Q189210 .", // instance of web application
    limit: 30000,
  },
  {
    key: "web_application_subclasses",
    pattern: "?item wdt:P31/wdt:P279+ wd:Q189210 .", // instance of a subclass of web application
    limit: 30000,
  },
  {
    key: "web_services",
    pattern: "?item wdt:P31 wd:Q193424 .", // instance of web service
    limit: 30000,
  },
];

/** Items per details query (keeps each query far below the 60 s deadline). */
export const WIKIDATA_DETAILS_BATCH = 150;

/** Ids of the items of one selection that have an official website. */
export function buildWikidataIdsQuery(q: WikidataQuery): string {
  return `SELECT DISTINCT ?item WHERE {
  ${q.pattern}
  ?item wdt:P856 [] .
} LIMIT ${q.limit}`;
}

/** Details of a batch of items: active, not a non-product class, English label. */
export function buildWikidataDetailsQuery(qids: string[]): string {
  const excluded = NON_PRODUCT_CLASSES.map((c) => `wd:${c}`).join(" ");
  const values = qids.map((q) => `wd:${q}`).join(" ");
  return `SELECT ?item ?label (SAMPLE(?desc) AS ?description) (SAMPLE(?site) AS ?website)
  (MIN(?inc) AS ?inception) (SAMPLE(?cc) AS ?countryCode) (SAMPLE(?dcc) AS ?developerCountryCode)
  (SAMPLE(?devLabel) AS ?developer) (SAMPLE(?dev) AS ?developerItem)
  (GROUP_CONCAT(DISTINCT ?clsLabel; separator="|") AS ?classes)
WHERE {
  VALUES ?item { ${values} }
  FILTER NOT EXISTS { ?item wdt:P576 [] }
  FILTER NOT EXISTS { ?item wdt:P2669 [] }
  FILTER NOT EXISTS { ?item wdt:P31 ?bad . VALUES ?bad { ${excluded} } }
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

/** QIDs of an ids query result. */
export function parseWikidataIds(json: unknown): string[] {
  const bindings = (json as { results?: { bindings?: SparqlBinding[] } })?.results?.bindings ?? [];
  return bindings.flatMap((b) => {
    const m = QID.exec(b.item?.value ?? "");
    return m?.[1] ? [m[1]] : [];
  });
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
      company_external_id:
        (b.developer?.value && QID.exec(b.developerItem?.value ?? "")?.[1]) || null,
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
 * Collects every selection (ids, one light query each), then reads the
 * details of the union in batches, one query after the other with a pause.
 * A failed query is reported and skipped, never retried in a loop; the
 * snapshot contains only what the source actually returned.
 */
export async function collectWikidata(options: {
  run: SparqlRunner;
  queries?: WikidataQuery[];
  pauseMs?: number;
  batchSize?: number;
  /** Stops reading details after this many items (CI time budget). */
  maxItems?: number;
  now?: () => Date;
}): Promise<CatalogSnapshot> {
  const now = options.now ?? (() => new Date());
  const queries = options.queries ?? WIKIDATA_QUERIES;
  const batchSize = options.batchSize ?? WIKIDATA_DETAILS_BATCH;
  const pause = () =>
    options.pauseMs ? new Promise((r) => setTimeout(r, options.pauseMs)) : Promise.resolve();
  const retrievedAt = now().toISOString();
  const report: CatalogSnapshot["queries"] = [];
  const ids = new Set<string>();
  for (const [i, q] of queries.entries()) {
    if (i > 0) await pause();
    try {
      const found = parseWikidataIds(await options.run(buildWikidataIdsQuery(q)));
      for (const id of found) ids.add(id);
      report.push({ key: q.key, status: "ok", rows: found.length });
    } catch (err) {
      report.push({ key: q.key, status: "error", rows: 0, error: errorText(err) });
    }
  }
  const all = [...ids].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const selected = options.maxItems ? all.slice(0, options.maxItems) : all;
  const byId = new Map<string, CatalogListing>();
  let failedBatches = 0;
  let firstError: string | undefined;
  for (let i = 0; i < selected.length; i += batchSize) {
    await pause();
    try {
      const json = await options.run(buildWikidataDetailsQuery(selected.slice(i, i + batchSize)));
      for (const l of parseWikidataResults(json, retrievedAt).listings) byId.set(l.external_id, l);
    } catch (err) {
      failedBatches++;
      firstError ??= errorText(err);
    }
  }
  report.push({
    key: "details",
    status: failedBatches === 0 ? "ok" : "error",
    rows: byId.size,
    ...(failedBatches ? { error: `${failedBatches} batch(es) failed: ${firstError}` } : {}),
  });
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

function errorText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 300);
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
