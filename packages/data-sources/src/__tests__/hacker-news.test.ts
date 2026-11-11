// Hacker News connector (official API) on SYNTHETIC responses shaped like the
// documented API (github.com/HackerNews/API). No network call is made.
import { describe, expect, it } from "vitest";
import { failure, type ConnectorOutcome } from "../connector";
import {
  HACKER_NEWS_API_BASE,
  HackerNewsConnector,
  parseStory,
  queryKeywords,
  titleMatches,
  type JsonFetcher,
} from "../connectors/hacker-news";

const signal = new AbortController().signal;

// Synthetic items (not real HN data).
const ITEMS: Record<number, unknown> = {
  101: {
    id: 101,
    type: "story",
    by: "someone",
    text: "<p>We built this</p>",
    title: "Show HN: Metrify – marketing analytics for small SaaS",
    url: "https://metrify.example/",
    time: 1_793_000_000,
    score: 42,
    descendants: 7,
  },
  102: {
    id: 102,
    type: "story",
    title: "Show HN: Inboxly, email deliverability checks",
    url: "https://inboxly.example/",
    time: 1_793_000_100,
    score: 12,
  },
  103: { id: 103, type: "story", title: "Show HN: A text-only post", time: 1_793_000_200 },
  104: {
    id: 104,
    type: "story",
    title: "Show HN: Dead marketing analytics",
    url: "https://dead.example/",
    time: 1,
    dead: true,
  },
  105: { id: 105, type: "comment", text: "marketing analytics", time: 1 },
  201: {
    id: 201,
    type: "story",
    title: "Marketing analytics is hard (blog)",
    url: "https://blog.example/",
    time: 2,
  },
  202: {
    id: 202,
    type: "story",
    title: "Show HN: Funnelboard – marketing analytics",
    url: "https://funnelboard.example/",
    time: 3,
  },
};

function fakeApi(opts: { show?: number[]; fresh?: number[]; fail?: string } = {}): {
  fetchJson: JsonFetcher;
  calls: string[];
} {
  const calls: string[] = [];
  const fetchJson: JsonFetcher = async (url): Promise<ConnectorOutcome<unknown>> => {
    calls.push(url);
    expect(url.startsWith(HACKER_NEWS_API_BASE)).toBe(true);
    const path = url.slice(HACKER_NEWS_API_BASE.length);
    if (opts.fail && path === opts.fail) return failure("error", "http_503", true);
    if (path === "showstories.json")
      return { status: "ok", data: opts.show ?? [101, 102, 103, 104, 105] };
    if (path === "newstories.json") return { status: "ok", data: opts.fresh ?? [201, 202] };
    const m = /^item\/(\d+)\.json$/.exec(path);
    if (m) return { status: "ok", data: ITEMS[Number(m[1])] ?? null };
    return failure("unavailable", "http_404", false);
  };
  return { fetchJson, calls };
}

describe("parseStory", () => {
  it("keeps metadata only: never the username or the user text", () => {
    const story = parseStory(ITEMS[101]);
    expect(story).toEqual({
      id: 101,
      title: "Show HN: Metrify – marketing analytics for small SaaS",
      url: "https://metrify.example/",
      time: 1_793_000_000,
      score: 42,
      descendants: 7,
    });
    expect(JSON.stringify(story)).not.toContain("someone");
    expect(JSON.stringify(story)).not.toContain("We built this");
  });

  it("ignores comments, dead items and stories without an http(s) URL", () => {
    expect(parseStory(ITEMS[103])).toBeNull();
    expect(parseStory(ITEMS[104])).toBeNull();
    expect(parseStory(ITEMS[105])).toBeNull();
    expect(parseStory({ ...(ITEMS[101] as object), url: "javascript:alert(1)" })).toBeNull();
  });
});

describe("keyword matching on titles", () => {
  it("needs every keyword of 3+ characters", () => {
    expect(queryKeywords("Marketing analytics for SaaS")).toEqual([
      "marketing",
      "analytics",
      "for",
      "saas",
    ]);
    expect(titleMatches("Show HN: Metrify – marketing analytics", ["marketing", "analytics"])).toBe(
      true,
    );
    expect(titleMatches("Show HN: Inboxly", ["marketing"])).toBe(false);
    expect(titleMatches("anything", [])).toBe(false);
  });
});

describe("HackerNewsConnector.search", () => {
  it("returns matching Show HN launches with a reference to the HN item", async () => {
    const api = fakeApi();
    const hn = new HackerNewsConnector({ fetchJson: api.fetchJson, maxRequests: 50 });
    const res = await hn.search({ query: "marketing analytics", limit: 10 }, signal);
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.data).toEqual([
      {
        url: "https://metrify.example/",
        title: "Show HN: Metrify – marketing analytics for small SaaS",
        snippet: undefined,
        publishedAt: new Date(1_793_000_000 * 1000).toISOString(),
        externalId: "101",
        referenceUrl: "https://news.ycombinator.com/item?id=101",
        metadata: { score: 42, descendants: 7 },
      },
    ]);
  });

  it("caches the list and items across queries of the same run", async () => {
    const api = fakeApi();
    const hn = new HackerNewsConnector({ fetchJson: api.fetchJson, maxRequests: 50 });
    await hn.search({ query: "marketing analytics", limit: 10 }, signal);
    const after = api.calls.length;
    await hn.search({ query: "email deliverability", limit: 10 }, signal);
    expect(api.calls.length).toBe(after);
    expect(hn.getUsage().requests).toBe(after);
  });

  it("keeps only Show HN titles from the newest stories", async () => {
    const api = fakeApi();
    const hn = new HackerNewsConnector({
      fetchJson: api.fetchJson,
      maxRequests: 50,
      includeNewStories: true,
    });
    const res = await hn.search({ query: "marketing analytics", limit: 10 }, signal);
    expect(res.status === "ok" && res.data.map((r) => r.externalId)).toEqual(["101", "202"]);
  });

  it("stops at the run request budget and returns partial results", async () => {
    const api = fakeApi();
    const hn = new HackerNewsConnector({ fetchJson: api.fetchJson, maxRequests: 2 });
    const res = await hn.search({ query: "inboxly", limit: 10 }, signal);
    expect(res.status === "ok" && res.data).toEqual([]);
    expect(hn.getUsage()).toMatchObject({ requests: 2, limitsReached: ["run_request_budget"] });
  });

  it("stops when the daily quota refuses a request", async () => {
    const api = fakeApi();
    let allowed = 3;
    const hn = new HackerNewsConnector({
      fetchJson: api.fetchJson,
      maxRequests: 50,
      beforeRequest: async () => allowed-- > 0,
    });
    await hn.search({ query: "marketing", limit: 10 }, signal);
    expect(hn.getUsage().limitsReached).toEqual(["daily_quota"]);
    expect(api.calls.length).toBe(3);
  });

  it("reports a failing list instead of inventing results", async () => {
    const hn = new HackerNewsConnector({
      fetchJson: fakeApi({ fail: "showstories.json" }).fetchJson,
      maxRequests: 10,
    });
    const res = await hn.search({ query: "marketing", limit: 10 }, signal);
    expect(res.status).toBe("error");
    expect(hn.getUsage().errors[0]).toContain("showstories.json");
  });

  it("never fetches pages", async () => {
    const hn = new HackerNewsConnector({ fetchJson: fakeApi().fetchJson, maxRequests: 10 });
    expect((await hn.fetchDocument()).status).toBe("not_supported");
    expect(hn.getCapabilities()).toMatchObject({
      search: true,
      fetchDocument: false,
      officialSource: false,
    });
  });
});
