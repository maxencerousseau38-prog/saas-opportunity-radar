// Product Hunt connector (prepared, not enabled): parsing and normalization.
// SYNTHETIC GraphQL responses (labelled test data); no network call, no token.
import { describe, expect, it } from "vitest";
import { collectProductHunt, parsePostsPage, toListing } from "../connectors/product-hunt";

const AT = "2026-11-10T12:00:00.000Z";
const node = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Synthetic Launch ${id}`,
  tagline: "synthetic tagline (test data)",
  url: `https://www.producthunt.com/posts/synthetic-${id}`,
  website: `https://www.producthunt.com/r/synthetic-${id}`,
  createdAt: "2026-11-09T08:00:00Z",
  featuredAt: null,
  topics: { edges: [{ node: { name: "Productivity" } }, { node: { name: "SaaS" } }] },
  ...over,
});
const page = (nodes: unknown[], hasNextPage = false) => ({
  data: {
    posts: { pageInfo: { endCursor: "c1", hasNextPage }, edges: nodes.map((n) => ({ node: n })) },
  },
});

describe("Product Hunt connector", () => {
  it("keeps metadata only and the product's own website (redirect resolved)", async () => {
    const listing = await toListing(node("1"), async () => "https://synthetic-1.example/", AT);
    expect(listing).toMatchObject({
      source_key: "product_hunt",
      external_id: "1",
      source_url: "https://www.producthunt.com/posts/synthetic-1",
      website_url: "https://synthetic-1.example/",
      launch_year: 2026,
      country_code: null,
      company_name: null,
      source_categories: ["Productivity", "SaaS"],
    });
  });

  it("drops a post whose website cannot be resolved (never keeps the redirect)", async () => {
    expect(await toListing(node("2"), async () => null, AT)).toBeNull();
    expect(
      await toListing(node("3", { website: null }), async () => "https://x.example/", AT),
    ).toBeNull();
  });

  it("pages through the API within a page budget and reports GraphQL errors", async () => {
    let calls = 0;
    const ok = await collectProductHunt({
      run: async () =>
        ++calls === 1 ? page([node("1"), node("2")], true) : page([node("3")], true),
      resolveWebsite: async (u) =>
        u.replace("https://www.producthunt.com/r/", "https://") + ".example/",
      postedAfter: "2026-11-01T00:00:00Z",
      maxPages: 2,
      now: () => new Date(AT),
    });
    expect(calls).toBe(2);
    expect(ok.listings.map((l) => l.external_id)).toEqual(["1", "2", "3"]);
    expect(ok.queries).toEqual([{ key: "posts", status: "ok", rows: 3 }]);
    expect(() => parsePostsPage({ errors: [{ message: "invalid token" }] })).toThrow(
      "invalid token",
    );
    const failed = await collectProductHunt({
      run: async () => ({ errors: [{ message: "invalid token" }] }),
      resolveWebsite: async () => null,
      postedAfter: "2026-11-01T00:00:00Z",
      maxPages: 5,
    });
    expect(failed.queries[0]).toMatchObject({
      status: "error",
      error: "product_hunt_graphql: invalid token",
    });
    expect(failed.listings).toEqual([]);
  });
});
