// Hacker News as a catalog source (PD-42, product-owner instruction of
// 13 November 2026: "Active Hacker News", catalog collection chosen). Same
// official API and the same terms as the Discovery connector (PD-28;
// Y Combinator Terms of Use read on 10 November 2026: personal,
// non-commercial use, metadata only, the official API being the means made
// available; docs/DATA_SOURCES.md).
//
// The collector reads the latest Show HN stories (`/v0/showstories`, at most
// 200: roughly the last week) one request at a time, and keeps a listing only
// when the story clearly is a product launch on its own website:
//   - "Show HN: <Name> – <tagline>": a name and a tagline separated by a dash,
//     a colon, a bar, or a comma before "a", "an" or "the" (otherwise the
//     product's name is not stated);
//   - not a game or a puzzle (SOR catalogues software products);
//   - a short name (at most 50 characters, 5 words), not a sentence;
//   - a link to a website of its own: not a code host, an app store, a video,
//     a social network or a blog post (at most one path segment);
//   - the name matches the website's domain (identity: never the name alone,
//     never a link to someone else's site).
// Kept per listing: story id, name and tagline from the title, the official
// site's home page, the year, the HN item page. Never kept: `by` (username),
// `text` (user-written content), comments. No user profile is requested.
import {
  CATALOG_LISTING_CONTRACT_VERSION,
  CatalogListingSchema,
  type CatalogListing,
  type CatalogSnapshot,
} from "@sor/contracts/listings";
import { isSharedHost, nameKey, normalizeUrl } from "@sor/domain";
import { HACKER_NEWS_API_BASE, HACKER_NEWS_ITEM_PAGE, HACKER_NEWS_SOURCE_KEY } from "./hacker-news";

export const HACKER_NEWS_LICENCE = "HN official API, metadata only (YC Terms of Use: personal use)";
export const HACKER_NEWS_USER_AGENT =
  "SaaSOpportunityRadar/0.1 (catalog collection; https://github.com/maxencerousseau38-prog/saas-opportunity-radar)";

/** GET one API path and return its JSON; injected so tests never touch the network. */
export type HackerNewsGetter = (path: string) => Promise<unknown>;

/** Hosts whose pages are never a product's own website. */
const NOT_OWN_SITE = [
  "ycombinator.com",
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "loom.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "reddit.com",
  "substack.com",
  "itch.io",
  "huggingface.co",
  "npmjs.com",
  "pypi.org",
  "crates.io",
  "producthunt.com",
  "kickstarter.com",
  "indiegogo.com",
  "arxiv.org",
  "dev.to",
  "hashnode.dev",
  "codepen.io",
  "replit.com",
  "codesandbox.io",
  "figma.com",
  "docs.google.com",
];
/** A first path segment that points to an article rather than a product's home page. */
const ARTICLE_PATH = /^(blog|posts?|articles?|news|p|story|stories|notes?|writing|essays?|\d{4})$/i;
const SHOW_HN_PREFIX = /^show hn\s*[:\-–—]\s*/i;
// A comma only before an article ("Foo, a tool for…"): elsewhere it cuts a sentence.
const SEPARATOR = /\s+[–—-]\s+|:\s+|\s+\|\s+|,\s+(?=(?:a|an|the)\s)/i;
/** Games and puzzles are launches, not software products for SOR's catalogue. */
const GAME = /\b(games?|puzzles?|wordle|crossword|sudoku|solitaire)\b/i;
const SENTENCE_START =
  /^(i|i'm|i've|we|we're|we've|my|our|how|why|what|a|an|built|made|building)\b/i;

export type HackerNewsSkip =
  | "not_a_story"
  | "no_own_website"
  | "article_link"
  | "name_not_stated"
  | "name_not_a_product"
  | "name_does_not_match_domain"
  | "game";

export interface ShowHnStory {
  id: number;
  title: string;
  url: string | null;
  time: number;
}

function decodeTitle(title: string): string {
  return title
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

/** Keeps only the allowed fields of an API item (no username, no text). */
export function parseShowHnItem(raw: unknown): ShowHnStory | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Record<string, unknown>;
  if (item.type !== "story" || item.dead === true || item.deleted === true) return null;
  if (typeof item.id !== "number" || typeof item.title !== "string") return null;
  if (typeof item.time !== "number") return null;
  return {
    id: item.id,
    title: decodeTitle(item.title).slice(0, 300),
    url: typeof item.url === "string" ? item.url.slice(0, 2048) : null,
    time: item.time,
  };
}

/** "Show HN: Name – tagline" → name and tagline; null when the name is not stated. */
export function splitShowHnTitle(title: string): { name: string; tagline: string } | null {
  if (!SHOW_HN_PREFIX.test(title)) return null;
  const rest = title.replace(SHOW_HN_PREFIX, "").trim();
  const m = SEPARATOR.exec(rest);
  if (!m || m.index === 0) return null;
  const name = rest.slice(0, m.index).trim();
  const tagline = rest.slice(m.index + m[0].length).trim();
  return name && tagline ? { name, tagline } : null;
}

/** The official site's home page, or the reason the link is not one. */
export function ownWebsite(
  url: string | null,
): { site: string; label: string } | { skip: "no_own_website" | "article_link" } {
  if (!url) return { skip: "no_own_website" };
  let parsed: URL;
  let registrable: string | null;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      return { skip: "no_own_website" };
    registrable = normalizeUrl(url).registrableDomain;
  } catch {
    return { skip: "no_own_website" };
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (
    !registrable ||
    isSharedHost(registrable) ||
    NOT_OWN_SITE.some((d) => host === d || host.endsWith(`.${d}`))
  ) {
    return { skip: "no_own_website" };
  }
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length > 1 || (segments[0] && ARTICLE_PATH.test(segments[0]))) {
    return { skip: "article_link" };
  }
  // The label that names the site: "foo" in foo.com, foo.vercel.app or app.foo.io.
  const label = registrable.split(".")[0] ?? "";
  return { site: `${parsed.protocol}//${parsed.host}/`, label };
}

/** A product name, not a sentence ("I built…", "A tool that…"). */
export function looksLikeProductName(name: string): boolean {
  return (
    name.length >= 2 &&
    name.length <= 50 &&
    name.split(/\s+/).length <= 5 &&
    !SENTENCE_START.test(name) &&
    !/[?!.]$/.test(name)
  );
}

/** The name and the domain designate the same thing (e.g. "Foo AI" and foo.ai). */
export function nameMatchesDomain(name: string, label: string): boolean {
  const key = nameKey(name);
  const host = nameKey(label);
  if (key.length < 3 || host.length < 3) return key === host && key.length > 0;
  return key.includes(host) || host.includes(key);
}

export function toHackerNewsListing(
  story: ShowHnStory,
  retrievedAt: string,
): CatalogListing | HackerNewsSkip {
  const title = splitShowHnTitle(story.title);
  if (!title) return "name_not_stated";
  if (!looksLikeProductName(title.name)) return "name_not_a_product";
  if (GAME.test(`${title.name} ${title.tagline}`)) return "game";
  const site = ownWebsite(story.url);
  if ("skip" in site) return site.skip;
  if (!nameMatchesDomain(title.name, site.label)) return "name_does_not_match_domain";
  const year = new Date(story.time * 1000).getUTCFullYear();
  const parsed = CatalogListingSchema.safeParse({
    source_key: HACKER_NEWS_SOURCE_KEY,
    external_id: String(story.id),
    source_url: `${HACKER_NEWS_ITEM_PAGE}${story.id}`,
    name: title.name.slice(0, 200),
    description: title.tagline.slice(0, 500),
    website_url: site.site,
    launch_year: year >= 1970 && year <= 2100 ? year : null,
    country_code: null, // not stated: unknown
    company_name: null,
    company_external_id: null,
    source_categories: [], // Hacker News has no categories: categorised from the tagline
    licence: HACKER_NEWS_LICENCE,
    retrieved_at: retrievedAt,
  });
  return parsed.success ? parsed.data : "not_a_story";
}

export async function collectHackerNews(options: {
  get: HackerNewsGetter;
  pauseMs?: number;
  /** Request budget for one collection (list + items). */
  maxRequests?: number;
  now?: () => Date;
}): Promise<CatalogSnapshot> {
  const retrievedAt = (options.now ?? (() => new Date()))().toISOString();
  const budget = options.maxRequests ?? 260;
  const pause = () =>
    options.pauseMs ? new Promise((r) => setTimeout(r, options.pauseMs)) : Promise.resolve();
  const report: CatalogSnapshot["queries"] = [];
  const listings = new Map<string, CatalogListing>();
  const skipped: Record<HackerNewsSkip, number> = {
    not_a_story: 0,
    no_own_website: 0,
    article_link: 0,
    name_not_stated: 0,
    name_not_a_product: 0,
    name_does_not_match_domain: 0,
    game: 0,
  };
  let requests = 0;

  let ids: number[] = [];
  try {
    requests++;
    const list = await options.get("showstories.json");
    ids = (Array.isArray(list) ? list : []).filter((x): x is number => Number.isInteger(x));
    report.push({ key: "show_stories", status: "ok", rows: ids.length });
  } catch (err) {
    report.push({
      key: "show_stories",
      status: "error",
      rows: 0,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
  }

  let read = 0;
  let failures = 0;
  let firstError: string | undefined;
  for (const id of ids.slice(0, 200)) {
    if (requests >= budget) break;
    await pause();
    requests++;
    try {
      const story = parseShowHnItem(await options.get(`item/${id}.json`));
      read++;
      if (!story) {
        skipped.not_a_story++;
        continue;
      }
      const result = toHackerNewsListing(story, retrievedAt);
      if (typeof result === "string") skipped[result]++;
      else listings.set(result.external_id, result);
    } catch (err) {
      failures++;
      firstError ??= (err instanceof Error ? err.message : String(err)).slice(0, 200);
      if (/_429$/.test(firstError)) break; // rate limited: stop, never retry in a loop
    }
  }
  report.push({
    key: "items",
    status: failures ? "error" : "ok",
    rows: read,
    ...(failures ? { error: `${failures} request(s) failed: ${firstError}` } : {}),
  });
  // Why stories were not kept: published with the snapshot, nothing hidden.
  for (const [reason, rows] of Object.entries(skipped)) {
    report.push({ key: `skipped_${reason}`, status: "ok", rows });
  }
  report.push({
    key: "requests",
    status: requests >= budget ? "error" : "ok",
    rows: requests,
    ...(requests >= budget ? { error: "request budget reached" } : {}),
  });

  return {
    contract_version: CATALOG_LISTING_CONTRACT_VERSION,
    source_key: HACKER_NEWS_SOURCE_KEY,
    licence: HACKER_NEWS_LICENCE,
    retrieved_at: retrievedAt,
    queries: report,
    listings: [...listings.values()].sort((a, b) => a.external_id.localeCompare(b.external_id)),
  };
}

/** HTTPS getter for the fixed official API host, with the descriptive User-Agent and a timeout. */
export function hackerNewsHttpGetter(
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): HackerNewsGetter {
  const fetchImpl = options.fetchImpl ?? fetch;
  return async (path) => {
    const res = await fetchImpl(`${HACKER_NEWS_API_BASE}${path}`, {
      headers: { "user-agent": HACKER_NEWS_USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
    if (!res.ok) throw new Error(`hacker_news_http_${res.status}`);
    return res.json();
  };
}
