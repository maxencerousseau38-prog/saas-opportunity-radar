// Official-website connector (ADR-013; Implementation Blueprint §5.1): public
// pages of a product's own site, through the safe fetcher, obeying robots.txt
// and a per-host rate limit. Returns normalized SourceDocuments; never writes.
import { createHash } from "node:crypto";
import type { SourceDocument } from "@sor/contracts/evidence";
import { normalizeUrl } from "@sor/domain";
import {
  failure,
  type ConnectorCapabilities,
  type ConnectorOutcome,
  type SourceConnector,
} from "../connector";
import { extractPage } from "../html";
import { ALLOW_ALL, DISALLOW_ALL, isAllowed, parseRobots, type RobotsRules } from "../robots";
import { safeFetch, type SafeFetchPolicy } from "../safe-fetch";

export const OFFICIAL_WEBSITE_SOURCE_KEY = "official_website";
const ROBOTS_TOKEN = "SaaSOpportunityRadar";
const MAX_TEXT = 100_000;

export interface OfficialWebsiteOptions {
  policy: SafeFetchPolicy;
  /** Minimum delay between two requests to the same host. */
  minIntervalMs?: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function normalizeDocumentText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Paths worth reading for enrichment (pricing, features, about, integrations, customers).
const INTERESTING =
  /(pricing|prices|tarif|plans|features|fonctionnalit|product|produit|about|a-propos|qui-sommes|company|entreprise|integrations?|customers|clients|case-stud)/i;

export class OfficialWebsiteConnector implements SourceConnector {
  readonly sourceKey = OFFICIAL_WEBSITE_SOURCE_KEY;
  private readonly robots = new Map<string, RobotsRules>();
  private readonly lastRequest = new Map<string, number>();
  private readonly minIntervalMs: number;
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: OfficialWebsiteOptions) {
    this.minIntervalMs = options.minIntervalMs ?? 2000;
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  getCapabilities(): ConnectorCapabilities {
    return {
      search: false,
      fetchDocument: true,
      fetchReviews: false,
      officialSource: true,
      rateLimitPerMinute: 30,
    };
  }

  async search(): Promise<ConnectorOutcome<never>> {
    return failure("not_supported", "the official-website connector cannot search", false);
  }

  private async throttle(host: string): Promise<void> {
    const last = this.lastRequest.get(host);
    const wait = last === undefined ? 0 : last + this.minIntervalMs - this.now().getTime();
    if (wait > 0) await this.sleep(wait);
    this.lastRequest.set(host, this.now().getTime());
  }

  private async robotsFor(origin: string, signal: AbortSignal): Promise<RobotsRules> {
    const cached = this.robots.get(origin);
    if (cached) return cached;
    await this.throttle(new URL(origin).host);
    const res = await safeFetch(
      `${origin}/robots.txt`,
      { ...this.options.policy, allowedContentTypes: ["text/plain", "text/html", ""] },
      signal,
    );
    let rules: RobotsRules;
    if (res.status === "ok") rules = parseRobots(res.data.body, ROBOTS_TOKEN);
    else if (
      res.status === "unavailable" ||
      (res.status === "blocked" && /http_40[13]/.test(res.reason))
    )
      rules = ALLOW_ALL;
    else if (res.status === "blocked")
      return DISALLOW_ALL; // policy failure: do not cache, do not fetch
    else rules = DISALLOW_ALL; // 5xx or network error: assume complete disallow
    this.robots.set(origin, rules);
    return rules;
  }

  async fetchDocument(url: string, signal: AbortSignal): Promise<ConnectorOutcome<SourceDocument>> {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return failure("blocked", "invalid_url", false);
    }
    const rules = await this.robotsFor(target.origin, signal);
    if (!isAllowed(rules, `${target.pathname}${target.search}`)) {
      return failure("blocked", "robots_disallow", false);
    }
    await this.throttle(target.host);
    const res = await safeFetch(target.toString(), this.options.policy, signal);
    if (res.status !== "ok") return res;
    const finalUrl = new URL(res.data.finalUrl);
    // A redirect to another site is not the product's official page.
    const requestedDomain = normalizeUrl(target.toString()).registrableDomain;
    if (normalizeUrl(finalUrl.toString()).registrableDomain !== requestedDomain) {
      return failure("blocked", "redirected_off_site", false);
    }
    const isHtml = res.data.contentType.includes("html");
    const page = isHtml
      ? extractPage(res.data.body, finalUrl.toString())
      : { title: null, description: null, text: res.data.body, links: [] };
    const text = normalizeDocumentText(page.text).slice(0, MAX_TEXT);
    const sameSiteLinks = page.links
      .filter((l) => {
        try {
          return normalizeUrl(l).registrableDomain === requestedDomain;
        } catch {
          return false;
        }
      })
      .slice(0, 200);
    return {
      status: "ok",
      data: {
        source_key: this.sourceKey,
        canonical_url: normalizeUrl(finalUrl.toString()).canonicalUrl,
        external_id: null,
        title: page.title?.slice(0, 500) ?? null,
        text,
        published_at: null,
        retrieved_at: this.now().toISOString(),
        content_hash: sha256Hex(text),
        fetch_status: "ok",
        http_status: res.data.status,
        storage_permitted: "excerpt",
        metadata: {
          description: page.description,
          links: sameSiteLinks,
          redirects: res.data.redirects,
        },
      },
    };
  }
}

/** Same-site pages worth fetching after the home page, most useful first. */
export function selectEnrichmentPages(home: SourceDocument, max: number): string[] {
  const links = Array.isArray(home.metadata.links) ? (home.metadata.links as string[]) : [];
  const seen = new Set<string>([home.canonical_url]);
  const picked: string[] = [];
  const score = (u: string) => {
    const path = new URL(u).pathname.toLowerCase();
    if (/pricing|tarif|plans|prices/.test(path)) return 0;
    if (/features|fonctionnalit|product|produit/.test(path)) return 1;
    if (/integrations?/.test(path)) return 2;
    if (/about|a-propos|company|entreprise|qui-sommes/.test(path)) return 3;
    return 4;
  };
  for (const link of [...links]
    .filter((l) => INTERESTING.test(new URL(l).pathname))
    .sort((a, b) => score(a) - score(b))) {
    let canonical: string;
    try {
      canonical = normalizeUrl(link).canonicalUrl;
    } catch {
      continue;
    }
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    picked.push(link);
    if (picked.length >= max) break;
  }
  return picked;
}
