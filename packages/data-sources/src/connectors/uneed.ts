// Uneed catalog connector (10 November 2026; official pages frozen in
// docs/sources/terms, review in docs/DATA_SOURCES.md).
//
// Uneed publishes a free, read-only API "over uneed.best product data" (the
// same contract as its MCP server): "No authentication in v1; per-IP rate
// limits apply" (OpenAPI spec); "Clean, structured, rate-limited access to our
// data: the legitimate alternative to scraping" (uneed.best/mcp). The site's
// terms forbid automated use to post, vote or manipulate rankings, not reading
// this API. No licence is stated for product data (only the launch statistics
// are CC BY 4.0), so SOR keeps metadata only (name, own website, short
// description, category and tags, launch date, Uneed page) with attribution
// ("Source: Uneed, uneed.best"); no logo, image, review or maker data.
//
// The API has no pagination: the collector reads the latest launches of
// every category and the weekly and monthly community rankings since
// February 2024 (50 products per request), one request at a time.
import {
  CATALOG_LISTING_CONTRACT_VERSION,
  CatalogListingSchema,
  type CatalogListing,
  type CatalogSnapshot,
} from "@sor/contracts/listings";

export const UNEED_SOURCE_KEY = "uneed";
export const UNEED_API_BASE = "https://mcp.uneed.best";
export const UNEED_LICENCE = "Uneed read API (no data licence stated; Source: Uneed, uneed.best)";
export const UNEED_USER_AGENT =
  "SaaSOpportunityRadar/0.1 (catalog collection; https://github.com/maxencerousseau38-prog/saas-opportunity-radar)";

/** GET one API path (with query) and return its JSON; injected so tests never touch the network. */
export type UneedGetter = (pathAndQuery: string) => Promise<unknown>;

interface UneedProduct {
  id?: number | string;
  slug?: string;
  name?: string;
  description?: string | null;
  url?: string | null;
  uneed_url?: string | null;
  category?: string | null;
  tags?: unknown;
  launch_date?: string | null;
}

/** Products in a response, whatever its envelope (array, {products}, {results}, {data}, nested {product}). */
export function productsOf(json: unknown): UneedProduct[] {
  const list = Array.isArray(json)
    ? json
    : ["products", "results", "data", "items", "launches", "ranking", "rankings", "alternatives"]
        .map((k) => (json as Record<string, unknown> | null)?.[k])
        .find(Array.isArray);
  return (list ?? []).flatMap((entry) => {
    const e = entry as { product?: UneedProduct } & UneedProduct;
    const p =
      e && typeof e === "object" && e.product && typeof e.product === "object" ? e.product : e;
    return p && typeof p === "object" && typeof p.name === "string" ? [p] : [];
  });
}

/** Category slugs of /v1/categories. */
export function categorySlugsOf(json: unknown): string[] {
  const list = Array.isArray(json)
    ? json
    : ((json as { categories?: unknown[] } | null)?.categories ?? []);
  return list.flatMap((c) => {
    const slug = (c as { slug?: unknown })?.slug;
    return typeof slug === "string" && slug ? [slug] : [];
  });
}

function tagsOf(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags.flatMap((t) => {
    if (typeof t === "string") return [t];
    const name = (t as { name?: unknown })?.name;
    return typeof name === "string" ? [name] : [];
  });
}

function website(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (/(^|\.)uneed\.best$/i.test(u.hostname)) return null; // never the directory page itself
    u.hash = "";
    u.search = ""; // referral parameters (e.g. ?ref=uneed) are not part of the official site
    return u.toString();
  } catch {
    return null;
  }
}

export function toUneedListing(p: UneedProduct, retrievedAt: string): CatalogListing | null {
  const site = website(p.url);
  // The slug is the identifier both endpoints return (rankings carry no id).
  const id = p.slug ?? (p.id !== undefined && p.id !== null ? String(p.id) : undefined);
  if (!site || !id || !p.name) return null;
  const sourceUrl = p.uneed_url ?? (p.slug ? `https://www.uneed.best/tool/${p.slug}` : null);
  const year = Number((p.launch_date ?? "").slice(0, 4));
  const parsed = CatalogListingSchema.safeParse({
    source_key: UNEED_SOURCE_KEY,
    external_id: id.slice(0, 200),
    source_url: sourceUrl,
    name: p.name.trim().slice(0, 200),
    description: p.description?.trim().slice(0, 500) || null,
    website_url: site,
    launch_year: Number.isInteger(year) && year >= 1970 && year <= 2100 ? year : null,
    country_code: null, // not exposed: unknown
    company_name: null,
    company_external_id: null,
    source_categories: [...new Set([p.category ?? "", ...tagsOf(p.tags)].filter(Boolean))]
      .slice(0, 30)
      .map((c) => c.slice(0, 200)),
    licence: UNEED_LICENCE,
    retrieved_at: retrievedAt,
  });
  return parsed.success ? parsed.data : null;
}

/** Mondays (YYYY-MM-DD) and first days of month from `since` to `until`. */
export function rankingDates(since: Date, until: Date): { weeks: string[]; months: string[] } {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const weeks: string[] = [];
  const months: string[] = [];
  const w = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()));
  while (w.getUTCDay() !== 1) w.setUTCDate(w.getUTCDate() + 1);
  for (; w <= until; w.setUTCDate(w.getUTCDate() + 7)) weeks.push(day(w));
  for (
    let m = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), 1));
    m <= until;
    m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))
  ) {
    months.push(day(m));
  }
  return { weeks, months };
}

export async function collectUneed(options: {
  get: UneedGetter;
  since?: Date;
  pauseMs?: number;
  /** Request budget for one collection (the API is rate-limited per IP). */
  maxRequests?: number;
  now?: () => Date;
}): Promise<CatalogSnapshot> {
  const now = (options.now ?? (() => new Date()))();
  const retrievedAt = now.toISOString();
  const since = options.since ?? new Date(Date.UTC(2024, 1, 1));
  const budget = options.maxRequests ?? 400;
  const byId = new Map<string, CatalogListing>();
  const report: CatalogSnapshot["queries"] = [];
  let requests = 0;
  let stopped = false;
  const pause = () =>
    options.pauseMs ? new Promise((r) => setTimeout(r, options.pauseMs)) : Promise.resolve();

  async function read(key: string, paths: string[]) {
    let rows = 0;
    let failures = 0;
    let firstError: string | undefined;
    for (const path of paths) {
      if (stopped || requests >= budget) break;
      if (requests > 0) await pause();
      requests++;
      try {
        const products = productsOf(await options.get(path));
        rows += products.length;
        for (const p of products) {
          const l = toUneedListing(p, retrievedAt);
          if (!l) continue;
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
      } catch (err) {
        failures++;
        firstError ??= (err instanceof Error ? err.message : String(err)).slice(0, 200);
        if (/_429$/.test(firstError)) stopped = true; // rate limited: stop, never retry in a loop
      }
    }
    report.push({
      key,
      status: failures ? "error" : "ok",
      rows,
      ...(failures ? { error: `${failures} request(s) failed: ${firstError}` } : {}),
    });
  }

  let categories: string[] = [];
  try {
    requests++;
    categories = categorySlugsOf(await options.get("/v1/categories"));
    report.push({ key: "categories", status: "ok", rows: categories.length });
  } catch (err) {
    report.push({
      key: "categories",
      status: "error",
      rows: 0,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
  }
  await read("launches_by_category", [
    "/v1/launches?limit=50",
    ...categories.map((c) => `/v1/launches?category=${encodeURIComponent(c)}&limit=50`),
  ]);
  const { weeks, months } = rankingDates(since, now);
  await read(
    "monthly_rankings",
    months.map((d) => `/v1/trending?period=monthly&date=${d}&limit=50`),
  );
  await read(
    "weekly_rankings",
    weeks.map((d) => `/v1/trending?period=weekly&date=${d}&limit=50`),
  );
  report.push({
    key: "requests",
    status: requests >= budget ? "error" : "ok",
    rows: requests,
    ...(requests >= budget ? { error: "request budget reached" } : {}),
  });

  return {
    contract_version: CATALOG_LISTING_CONTRACT_VERSION,
    source_key: UNEED_SOURCE_KEY,
    licence: UNEED_LICENCE,
    retrieved_at: retrievedAt,
    queries: report,
    listings: [...byId.values()].sort((a, b) => a.external_id.localeCompare(b.external_id)),
  };
}

/** HTTPS getter for the fixed Uneed API host, with the descriptive User-Agent and a timeout. */
export function uneedHttpGetter(
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): UneedGetter {
  const fetchImpl = options.fetchImpl ?? fetch;
  return async (path) => {
    const res = await fetchImpl(`${UNEED_API_BASE}${path}`, {
      headers: { "user-agent": UNEED_USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
    if (!res.ok) throw new Error(`uneed_http_${res.status}`);
    return res.json();
  };
}
