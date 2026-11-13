// Hacker News catalog collector (PD-42): title parsing, own-website rules,
// name/domain identity, games, metadata only, budget and rate limit.
// SYNTHETIC API responses (labelled test data, .example hosts); no network call.
import { describe, expect, it } from "vitest";
import {
  collectHackerNews,
  hackerNewsHttpGetter,
  HACKER_NEWS_LICENCE,
  HACKER_NEWS_USER_AGENT,
  nameMatchesDomain,
  ownWebsite,
  parseShowHnItem,
  splitShowHnTitle,
  toHackerNewsListing,
} from "../connectors/hacker-news-catalog";

const AT = "2026-11-13T12:00:00.000Z";
const item = (
  id: number,
  title: string,
  url: string | null,
  over: Record<string, unknown> = {},
) => ({
  id,
  type: "story",
  by: "synthetic_user",
  text: "synthetic user-written text (test data)",
  time: 1_794_000_000,
  title,
  ...(url ? { url } : {}),
  score: 10,
  descendants: 3,
  ...over,
});

describe("Show HN titles", () => {
  it("splits the product name from its tagline on a dash, colon, bar or comma before an article", () => {
    expect(splitShowHnTitle("Show HN: Acmeflow – Invoices for freelancers")).toEqual({
      name: "Acmeflow",
      tagline: "Invoices for freelancers",
    });
    expect(splitShowHnTitle("Show HN: Acmeflow - Invoices")?.name).toBe("Acmeflow");
    expect(splitShowHnTitle("Show HN: Acmeflow: invoices")?.name).toBe("Acmeflow");
    expect(splitShowHnTitle("Show HN: Acmeflow | invoices")?.name).toBe("Acmeflow");
    expect(splitShowHnTitle("Show HN: Acmeflow, an invoice tool")).toEqual({
      name: "Acmeflow",
      tagline: "an invoice tool",
    });
  });

  it("does not guess a name when the title is a sentence", () => {
    expect(splitShowHnTitle("Show HN: I built a tool to send invoices")).toBeNull();
    expect(splitShowHnTitle("Show HN: Mirror Is Fun, but in Reverse")).toBeNull();
    expect(splitShowHnTitle("Ask HN: Acmeflow – something")).toBeNull();
  });
});

describe("own website", () => {
  it("keeps the home page of the product's own site", () => {
    expect(ownWebsite("https://acmeflow.example/?ref=hn#top")).toEqual({
      site: "https://acmeflow.example/",
      label: "acmeflow",
    });
    expect(ownWebsite("https://app.acmeflow.example/pricing")).toEqual({
      site: "https://app.acmeflow.example/",
      label: "acmeflow",
    });
  });

  it("refuses code hosts, stores, videos, social networks and articles", () => {
    for (const url of [
      "https://github.com/synthetic/acmeflow",
      "https://apps.apple.com/app/id1",
      "https://www.youtube.com/watch?v=1",
      "https://x.com/synthetic",
      "https://synthetic.substack.com/p/launch",
      null,
      "ftp://acmeflow.example/",
    ]) {
      expect(ownWebsite(url)).toEqual({ skip: "no_own_website" });
    }
    expect(ownWebsite("https://acmeflow.example/blog")).toEqual({ skip: "article_link" });
    expect(ownWebsite("https://acmeflow.example/2026/launch")).toEqual({ skip: "article_link" });
  });

  it("requires the name and the domain to designate the same thing", () => {
    expect(nameMatchesDomain("Acmeflow", "acmeflow")).toBe(true);
    expect(nameMatchesDomain("Acme Flow AI", "acmeflow")).toBe(true);
    expect(nameMatchesDomain("Acmeflow", "getacmeflow")).toBe(true);
    expect(nameMatchesDomain("Acmeflow", "othersite")).toBe(false);
    expect(nameMatchesDomain("Go", "go")).toBe(true);
    expect(nameMatchesDomain("Go", "gopher")).toBe(false);
  });
});

describe("listing", () => {
  it("keeps metadata only: no username, no user text", () => {
    const story = parseShowHnItem(
      item(
        101,
        "Show HN: Acmeflow &#x27;24 – Invoices &amp; quotes",
        "https://acmeflow24.example/",
      ),
    );
    expect(story).toEqual({
      id: 101,
      title: "Show HN: Acmeflow '24 – Invoices & quotes",
      url: "https://acmeflow24.example/",
      time: 1_794_000_000,
    });
    const listing = toHackerNewsListing(story!, AT);
    expect(listing).toMatchObject({
      source_key: "hacker_news",
      external_id: "101",
      source_url: "https://news.ycombinator.com/item?id=101",
      name: "Acmeflow '24",
      description: "Invoices & quotes",
      website_url: "https://acmeflow24.example/",
      launch_year: 2026,
      country_code: null,
      source_categories: [],
      licence: HACKER_NEWS_LICENCE,
    });
    expect(JSON.stringify(listing)).not.toMatch(/synthetic_user|user-written/);
  });

  it("ignores dead, deleted and non-story items", () => {
    expect(
      parseShowHnItem(item(1, "Show HN: A – b", "https://a.example/", { dead: true })),
    ).toBeNull();
    expect(
      parseShowHnItem(item(1, "Show HN: A – b", "https://a.example/", { deleted: true })),
    ).toBeNull();
    expect(
      parseShowHnItem(item(1, "Show HN: A – b", "https://a.example/", { type: "comment" })),
    ).toBeNull();
  });

  it("says why a story is not kept", () => {
    const story = (title: string, url: string | null) => parseShowHnItem(item(7, title, url))!;
    expect(toHackerNewsListing(story("Show HN: I made a thing", "https://a.example/"), AT)).toBe(
      "name_not_stated",
    );
    expect(
      toHackerNewsListing(
        story("Show HN: We built this for you – a tool", "https://we.example/"),
        AT,
      ),
    ).toBe("name_not_a_product");
    expect(
      toHackerNewsListing(
        story("Show HN: Tilecraft – a daily puzzle", "https://tilecraft.example/"),
        AT,
      ),
    ).toBe("game");
    expect(
      toHackerNewsListing(story("Show HN: Acmeflow – invoices", "https://github.com/a/b"), AT),
    ).toBe("no_own_website");
    expect(
      toHackerNewsListing(story("Show HN: Acmeflow – invoices", "https://other.example/"), AT),
    ).toBe("name_does_not_match_domain");
  });
});

describe("collection", () => {
  const responses: Record<string, unknown> = {
    "showstories.json": [1, 2, 3, 4],
    "item/1.json": item(
      1,
      "Show HN: Acmeflow – Invoices for freelancers",
      "https://acmeflow.example/",
    ),
    "item/2.json": item(2, "Show HN: I built a tool", "https://tool.example/"),
    "item/3.json": item(3, "Show HN: Codepad – notes", "https://github.com/synthetic/codepad"),
    "item/4.json": item(
      4,
      "Show HN: Ledgerly – Books for small teams",
      "https://ledgerly.example/",
    ),
  };

  it("collects the Show HN launches with their own site and reports every skip", async () => {
    const paths: string[] = [];
    const snap = await collectHackerNews({
      get: async (path) => {
        paths.push(path);
        return responses[path];
      },
      now: () => new Date(AT),
    });
    expect(snap.source_key).toBe("hacker_news");
    expect(snap.listings.map((l) => l.name)).toEqual(["Acmeflow", "Ledgerly"]);
    expect(paths).toEqual([
      "showstories.json",
      "item/1.json",
      "item/2.json",
      "item/3.json",
      "item/4.json",
    ]);
    const q = Object.fromEntries(snap.queries.map((x) => [x.key, x.rows]));
    expect(q).toMatchObject({
      show_stories: 4,
      items: 4,
      skipped_name_not_stated: 1,
      skipped_no_own_website: 1,
      requests: 5,
    });
  });

  it("stops at the request budget and on a rate limit, never retrying in a loop", async () => {
    const budget = await collectHackerNews({
      get: async (path) => responses[path],
      maxRequests: 3,
      now: () => new Date(AT),
    });
    expect(budget.queries.find((x) => x.key === "requests")).toMatchObject({
      status: "error",
      rows: 3,
    });

    let calls = 0;
    const limited = await collectHackerNews({
      get: async (path) => {
        calls++;
        if (path.startsWith("item/")) throw new Error("hacker_news_http_429");
        return responses[path];
      },
      now: () => new Date(AT),
    });
    expect(calls).toBe(2);
    expect(limited.queries.find((x) => x.key === "items")?.status).toBe("error");
    expect(limited.listings).toEqual([]);
  });

  it("calls only the official API host with a descriptive User-Agent", async () => {
    const seen: Array<{ url: string; ua: string | null }> = [];
    const get = hackerNewsHttpGetter({
      fetchImpl: (async (url: string, init?: RequestInit) => {
        seen.push({ url, ua: new Headers(init?.headers).get("user-agent") });
        return new Response("[1]", { headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });
    expect(await get("showstories.json")).toEqual([1]);
    expect(seen).toEqual([
      { url: "https://hacker-news.firebaseio.com/v0/showstories.json", ua: HACKER_NEWS_USER_AGENT },
    ]);
  });
});
