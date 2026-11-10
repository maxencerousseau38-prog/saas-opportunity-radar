// Product Hunt catalog connector (prepared 10 November 2026; NOT enabled).
// Terms (api.producthunt.com/v2/docs, frozen in docs/sources/terms): "The
// Product Hunt API must not be used for commercial purposes. If you would
// like to use it for your business, please contact us at
// hello@producthunt.com." "Currently the API is only accessible with a
// provided access_token." SOR may use it for the product owner's personal,
// non-commercial research once the product owner creates a token in the API
// dashboard and stores it as the `PRODUCT_HUNT_TOKEN` repository secret
// (never in chat or code). The `product_hunt` source stays `planned` and
// disabled until then (the ingestion RPC refuses disabled sources).
//
// Metadata only: name, tagline, topics, launch date, Product Hunt page and
// the product's own website. No maker or user data, no comments, no votes
// beyond the public count.
import {
  CATALOG_LISTING_CONTRACT_VERSION,
  CatalogListingSchema,
  type CatalogListing,
  type CatalogSnapshot,
} from "@sor/contracts/listings";

export const PRODUCT_HUNT_SOURCE_KEY = "product_hunt";
export const PRODUCT_HUNT_GRAPHQL = "https://api.producthunt.com/v2/api/graphql";
/** The API terms; not a licence for the data (non-commercial use only). */
export const PRODUCT_HUNT_LICENCE = "Product Hunt API terms (non-commercial)";

export const PRODUCT_HUNT_POSTS_QUERY = `query Posts($after: String, $postedAfter: DateTime) {
  posts(order: NEWEST, first: 20, after: $after, postedAfter: $postedAfter) {
    pageInfo { endCursor hasNextPage }
    edges { node {
      id name tagline url website createdAt featuredAt
      topics(first: 10) { edges { node { name } } }
    } }
  }
}`;

interface PostNode {
  id: string;
  name: string;
  tagline: string | null;
  url: string;
  website: string | null;
  createdAt: string;
  featuredAt: string | null;
  topics?: { edges?: Array<{ node?: { name?: string } }> };
}

export interface PostsPage {
  nodes: PostNode[];
  endCursor: string | null;
  hasNextPage: boolean;
}

/** Parses one GraphQL page; GraphQL errors throw (the collector reports them). */
export function parsePostsPage(json: unknown): PostsPage {
  const body = json as {
    data?: {
      posts?: {
        pageInfo?: { endCursor?: string; hasNextPage?: boolean };
        edges?: Array<{ node?: PostNode }>;
      };
    };
    errors?: Array<{ message?: string }>;
  };
  if (body.errors?.length)
    throw new Error(`product_hunt_graphql: ${body.errors[0]?.message ?? "error"}`);
  const posts = body.data?.posts;
  return {
    nodes: (posts?.edges ?? []).flatMap((e) => (e.node ? [e.node] : [])),
    endCursor: posts?.pageInfo?.endCursor ?? null,
    hasNextPage: posts?.pageInfo?.hasNextPage === true,
  };
}

/**
 * The API's `website` is a Product Hunt redirect; `resolveWebsite` follows it
 * (safe fetcher, redirect limit) and returns the product's own URL, or null.
 */
export type WebsiteResolver = (redirectUrl: string) => Promise<string | null>;

export async function toListing(
  node: PostNode,
  resolveWebsite: WebsiteResolver,
  retrievedAt: string,
): Promise<CatalogListing | null> {
  if (!node.website) return null;
  const website = await resolveWebsite(node.website);
  if (!website) return null;
  const year = Number((node.featuredAt ?? node.createdAt ?? "").slice(0, 4));
  const parsed = CatalogListingSchema.safeParse({
    source_key: PRODUCT_HUNT_SOURCE_KEY,
    external_id: node.id,
    source_url: node.url,
    name: node.name,
    description: node.tagline?.trim() || null,
    website_url: website,
    launch_year: Number.isInteger(year) && year >= 1970 ? year : null,
    country_code: null, // not exposed by the API: unknown
    company_name: null,
    company_external_id: null,
    source_categories: (node.topics?.edges ?? []).flatMap((t) =>
      t.node?.name ? [t.node.name] : [],
    ),
    licence: PRODUCT_HUNT_LICENCE,
    retrieved_at: retrievedAt,
  });
  return parsed.success ? parsed.data : null;
}

/** Runs one GraphQL request with the token; injected so tests never touch the network. */
export type GraphqlRunner = (query: string, variables: Record<string, unknown>) => Promise<unknown>;

export async function collectProductHunt(options: {
  run: GraphqlRunner;
  resolveWebsite: WebsiteResolver;
  /** Only posts launched after this date. */
  postedAfter: string;
  maxPages: number;
  pauseMs?: number;
  now?: () => Date;
}): Promise<CatalogSnapshot> {
  const retrievedAt = (options.now ?? (() => new Date()))().toISOString();
  const listings = new Map<string, CatalogListing>();
  let after: string | null = null;
  let pages = 0;
  let error: string | undefined;
  let rows = 0;
  try {
    do {
      if (pages > 0 && options.pauseMs) await new Promise((r) => setTimeout(r, options.pauseMs));
      const page = parsePostsPage(
        await options.run(PRODUCT_HUNT_POSTS_QUERY, { after, postedAfter: options.postedAfter }),
      );
      pages++;
      rows += page.nodes.length;
      for (const node of page.nodes) {
        const l = await toListing(node, options.resolveWebsite, retrievedAt);
        if (l) listings.set(l.external_id, l);
      }
      after = page.hasNextPage ? page.endCursor : null;
    } while (after && pages < options.maxPages);
  } catch (err) {
    error = (err instanceof Error ? err.message : String(err)).slice(0, 300);
  }
  return {
    contract_version: CATALOG_LISTING_CONTRACT_VERSION,
    source_key: PRODUCT_HUNT_SOURCE_KEY,
    licence: PRODUCT_HUNT_LICENCE,
    retrieved_at: retrievedAt,
    queries: [{ key: "posts", status: error ? "error" : "ok", rows, ...(error ? { error } : {}) }],
    listings: [...listings.values()],
  };
}
