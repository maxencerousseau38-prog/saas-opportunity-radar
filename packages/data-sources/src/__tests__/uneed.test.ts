// Uneed connector: response envelopes, normalization, paging plan, rate limit.
// SYNTHETIC API responses (labelled test data); no network call.
import { describe, expect, it } from "vitest";
import {
  collectUneed,
  productsOf,
  rankingDates,
  toUneedListing,
  uneedHttpGetter,
  UNEED_USER_AGENT,
} from "../connectors/uneed";

const AT = "2026-11-10T12:00:00.000Z";
const product = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  slug: `synthetic-${id}`,
  name: `Synthetic Tool ${id}`,
  description: "synthetic description (test data)",
  url: `https://synthetic-${id}.example/?ref=uneed`,
  uneed_url: `https://www.uneed.best/tool/synthetic-${id}`,
  category: "Marketing",
  tags: [{ name: "Email" }, "Newsletter"],
  launch_date: "2025-06-03",
  ...over,
});

describe("Uneed connector", () => {
  it("reads products from any envelope, including nested product objects", () => {
    expect(productsOf([product(1)])).toHaveLength(1);
    expect(productsOf({ products: [product(1)] })).toHaveLength(1);
    expect(productsOf({ results: [{ rank: 1, votes: 9, product: product(2) }] })[0]?.name).toBe(
      "Synthetic Tool 2",
    );
    // Real /v1/trending envelope (docs/sources/terms sample): {period, date, ranking: [...]}.
    expect(
      productsOf({ period: "weekly", date: "2026-11-02", ranking: [{ rank: 1, ...product(4) }] }),
    ).toHaveLength(1);
    expect(productsOf({ nothing: true })).toEqual([]);
  });

  it("keeps metadata only and the product's own website, without referral parameters", () => {
    expect(toUneedListing(product(1), AT)).toEqual({
      source_key: "uneed",
      external_id: "synthetic-1",
      source_url: "https://www.uneed.best/tool/synthetic-1",
      name: "Synthetic Tool 1",
      description: "synthetic description (test data)",
      website_url: "https://synthetic-1.example/",
      launch_year: 2025,
      country_code: null,
      company_name: null,
      company_external_id: null,
      source_categories: ["Marketing", "Email", "Newsletter"],
      licence: "Uneed read API (no data licence stated; Source: Uneed, uneed.best)",
      retrieved_at: AT,
    });
    expect(toUneedListing(product(2, { url: "https://www.uneed.best/tool/x" }), AT)).toBeNull();
    expect(toUneedListing(product(3, { url: null }), AT)).toBeNull();
  });

  it("plans weekly (Mondays) and monthly rankings over the period", () => {
    const { weeks, months } = rankingDates(
      new Date("2026-10-01T00:00:00Z"),
      new Date("2026-11-10T00:00:00Z"),
    );
    expect(weeks[0]).toBe("2026-10-05");
    expect(weeks).toContain("2026-11-09");
    expect(months).toEqual(["2026-10-01", "2026-11-01"]);
  });

  it("merges products seen several times and stops on rate limiting", async () => {
    const calls: string[] = [];
    const snapshot = await collectUneed({
      since: new Date("2026-10-01T00:00:00Z"),
      now: () => new Date(AT),
      get: async (path) => {
        calls.push(path);
        if (path === "/v1/categories") return { categories: [{ slug: "marketing" }] };
        if (path.startsWith("/v1/launches")) return { products: [product(1), product(2)] };
        if (path.includes("period=monthly")) return [{ product: product(2, { tags: ["SEO"] }) }];
        throw new Error("uneed_http_429");
      },
    });
    expect(snapshot.listings.map((l) => l.external_id)).toEqual(["synthetic-1", "synthetic-2"]);
    expect(snapshot.listings[1]?.source_categories).toEqual([
      "Marketing",
      "Email",
      "Newsletter",
      "SEO",
    ]);
    const weekly = calls.filter((c) => c.includes("period=weekly"));
    expect(weekly).toHaveLength(1); // stopped at the first 429
    expect(snapshot.queries.find((q) => q.key === "weekly_rankings")).toMatchObject({
      status: "error",
    });
  });

  it("sends the descriptive User-Agent and fails on HTTP errors", async () => {
    const seen: Array<Record<string, string>> = [];
    const get = uneedHttpGetter({
      fetchImpl: (async (_u: string, init: RequestInit) => {
        seen.push(init.headers as Record<string, string>);
        return new Response("no", { status: 503 });
      }) as unknown as typeof fetch,
    });
    await expect(get("/v1/categories")).rejects.toThrow("uneed_http_503");
    expect(seen[0]?.["user-agent"]).toBe(UNEED_USER_AGENT);
  });
});
