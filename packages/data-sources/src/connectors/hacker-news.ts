// Hacker News connector — official API only (PD-28, approved 6 Nov 2026;
// docs/DATA_SOURCES.md). Read-only JSON requests to
// https://hacker-news.firebaseio.com/v0/ through the safe fetcher. The
// official API has no full-text search: the connector reads the latest Show
// HN stories (≤ 200, `/v0/showstories`), optionally the newest stories
// (≤ 500, `/v0/newstories`, Show HN titles only), and matches the planned
// keywords locally on titles. Coverage is therefore recent launches only.
//
// Storage policy: metadata only. Kept per story: id, title, url, time,
// score, descendants. Never kept: `by` (username) and `text` (user-written
// content). No user profile is ever requested.
//
// The source is registered `planned` and disabled: the orchestrator calls
// this connector only once the source is integrated and enabled.
import type { SourceDocument } from "@sor/contracts/evidence";
import {
  failure,
  type ConnectorCapabilities,
  type ConnectorOutcome,
  type SourceConnector,
  type SourceSearchRequest,
  type SourceSearchResult,
} from "../connector";
import { safeFetch, type SafeFetchPolicy } from "../safe-fetch";

export const HACKER_NEWS_SOURCE_KEY = "hacker_news";
export const HACKER_NEWS_API_BASE = "https://hacker-news.firebaseio.com/v0/";
export const HACKER_NEWS_ITEM_PAGE = "https://news.ycombinator.com/item?id=";

/** Fetches one JSON document; injected so tests never touch the network. */
export type JsonFetcher = (url: string, signal: AbortSignal) => Promise<ConnectorOutcome<unknown>>;

export interface HackerNewsOptions {
  fetchJson: JsonFetcher;
  /** Maximum API requests for this connector instance (one run). */
  maxRequests: number;
  /** Also scan `/v0/newstories` for Show HN titles (deep runs). */
  includeNewStories?: boolean;
  /**
   * Called before each request; returning false stops the search (daily
   * quota reached, `sor_source_consume`).
   */
  beforeRequest?: () => Promise<boolean>;
}

/** Story metadata kept by the connector (no username, no user text). */
export interface HackerNewsStory {
  id: number;
  title: string;
  url: string;
  time: number;
  score: number | null;
  descendants: number | null;
}

export interface HackerNewsUsage {
  requests: number;
  limitsReached: Array<"run_request_budget" | "daily_quota">;
  errors: string[];
}

const SHOW_HN = /^show hn\s*[:\-–—]/i;

const toWords = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Query keywords of 3+ characters (short words carry no signal on titles). */
export function queryKeywords(query: string): string[] {
  return [
    ...new Set(
      toWords(query)
        .split(" ")
        .filter((w) => w.length >= 3),
    ),
  ];
}

/** A title matches when it contains every keyword as a word or word prefix. */
export function titleMatches(title: string, keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  const words = toWords(title).split(" ");
  return keywords.every((k) => words.some((w) => w === k || w.startsWith(k)));
}

/** Keeps only the allowed fields of an API item; null if not a usable story. */
export function parseStory(raw: unknown): HackerNewsStory | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Record<string, unknown>;
  if (item.type !== "story" || item.dead === true || item.deleted === true) return null;
  if (typeof item.id !== "number" || typeof item.title !== "string") return null;
  if (typeof item.url !== "string" || !/^https?:\/\//i.test(item.url)) return null;
  if (typeof item.time !== "number") return null;
  return {
    id: item.id,
    title: decodeTitle(item.title).slice(0, 500),
    url: item.url.slice(0, 2048),
    time: item.time,
    score: typeof item.score === "number" ? item.score : null,
    descendants: typeof item.descendants === "number" ? item.descendants : null,
  };
}

function decodeTitle(title: string): string {
  return title
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

export class HackerNewsConnector implements SourceConnector {
  readonly sourceKey = HACKER_NEWS_SOURCE_KEY;
  private readonly stories = new Map<number, HackerNewsStory | null>();
  private listIds: number[] | null = null;
  private readonly showIds = new Set<number>();
  private readonly usage: HackerNewsUsage = { requests: 0, limitsReached: [], errors: [] };

  constructor(private readonly options: HackerNewsOptions) {}

  getCapabilities(): ConnectorCapabilities {
    return {
      search: true,
      fetchDocument: false,
      fetchReviews: false,
      officialSource: false,
      rateLimitPerMinute: 60,
      quotaPerDay: 5000,
    };
  }

  getUsage(): HackerNewsUsage {
    return {
      ...this.usage,
      limitsReached: [...this.usage.limitsReached],
      errors: [...this.usage.errors],
    };
  }

  private limit(reason: HackerNewsUsage["limitsReached"][number]) {
    if (!this.usage.limitsReached.includes(reason)) this.usage.limitsReached.push(reason);
  }

  /** One budgeted API request; null when the budget or quota stops it. */
  private async request(
    path: string,
    signal: AbortSignal,
  ): Promise<ConnectorOutcome<unknown> | null> {
    if (this.usage.requests >= this.options.maxRequests) {
      this.limit("run_request_budget");
      return null;
    }
    if (this.options.beforeRequest && !(await this.options.beforeRequest())) {
      this.limit("daily_quota");
      return null;
    }
    this.usage.requests += 1;
    const res = await this.options.fetchJson(`${HACKER_NEWS_API_BASE}${path}`, signal);
    if (res.status !== "ok")
      this.usage.errors.push(`${path}: ${res.status} ${res.reason}`.slice(0, 300));
    return res;
  }

  private async loadList(signal: AbortSignal): Promise<ConnectorOutcome<number[]>> {
    if (this.listIds) return { status: "ok", data: this.listIds };
    const ids: number[] = [];
    const show = await this.request("showstories.json", signal);
    if (show === null) return failure("rate_limited", "budget_exhausted", false);
    if (show.status !== "ok") return show;
    if (Array.isArray(show.data)) {
      for (const x of show.data) {
        if (Number.isInteger(x)) {
          ids.push(x as number);
          this.showIds.add(x as number);
        }
      }
    }
    if (this.options.includeNewStories) {
      const fresh = await this.request("newstories.json", signal);
      if (fresh?.status === "ok" && Array.isArray(fresh.data)) {
        ids.push(...fresh.data.filter((x): x is number => Number.isInteger(x)));
      }
    }
    this.listIds = [...new Set(ids)].slice(0, 700);
    return { status: "ok", data: this.listIds };
  }

  async search(
    input: SourceSearchRequest,
    signal: AbortSignal,
  ): Promise<ConnectorOutcome<SourceSearchResult[]>> {
    const keywords = queryKeywords(input.query);
    if (keywords.length === 0) return { status: "ok", data: [] };
    const list = await this.loadList(signal);
    if (list.status !== "ok") return list;

    const results: SourceSearchResult[] = [];
    for (const id of list.data) {
      if (signal.aborted) return failure("error", "aborted", false);
      if (results.length >= input.limit) break;
      if (!this.stories.has(id)) {
        const res = await this.request(`item/${id}.json`, signal);
        if (res === null) break; // budget or quota: partial results
        if (res.status === "rate_limited") break;
        this.stories.set(id, res.status === "ok" ? parseStory(res.data) : null);
      }
      const story = this.stories.get(id);
      if (!story) continue;
      // newstories also lists ordinary links: keep Show HN launches only.
      if (!this.showIds.has(id) && !SHOW_HN.test(story.title)) continue;
      if (!titleMatches(story.title, keywords)) continue;
      results.push({
        url: story.url,
        title: story.title,
        snippet: undefined,
        publishedAt: new Date(story.time * 1000).toISOString(),
        externalId: String(story.id),
        referenceUrl: `${HACKER_NEWS_ITEM_PAGE}${story.id}`,
        metadata: { score: story.score, descendants: story.descendants },
      });
    }
    return { status: "ok", data: results };
  }

  async fetchDocument(): Promise<ConnectorOutcome<SourceDocument>> {
    return failure("not_supported", "the Hacker News connector never fetches pages", false);
  }
}

/** JSON fetcher through the safe fetcher (production wiring). */
export function safeJsonFetcher(policy: SafeFetchPolicy): JsonFetcher {
  return async (url, signal) => {
    const res = await safeFetch(
      url,
      { ...policy, allowedContentTypes: ["application/json"] },
      signal,
    );
    if (res.status !== "ok") return res;
    try {
      return { status: "ok", data: JSON.parse(res.data.body) as unknown };
    } catch {
      return failure("error", "invalid_json", false);
    }
  };
}
