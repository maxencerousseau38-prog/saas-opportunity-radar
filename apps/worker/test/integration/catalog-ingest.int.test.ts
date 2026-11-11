// Catalog ingestion on the local Supabase stack (CI job "worker-integration"):
// collected listings → identity resolution, exclusion classifier, category
// mapping, provenance RPC. SYNTHETIC listings (labelled test data, `.test`
// hosts); the real Wikidata snapshot is ingested by the E2E job.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { CatalogListing } from "@sor/contracts";
import { createServiceClient, type DbClient } from "@sor/database";
import { CATEGORY_MAPPING_SLUGS } from "@sor/domain";
import { ingestListings } from "../../src/catalog/ingest";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const run = url && secretKey ? describe : describe.skip;
let db: DbClient;

const tag = () => randomUUID().slice(0, 8);

function listing(over: Partial<CatalogListing> = {}): CatalogListing {
  const t = tag();
  const qid = `Q9${Math.floor(Math.random() * 1e9)}`;
  return {
    source_key: "wikidata",
    external_id: qid,
    source_url: `https://www.wikidata.org/wiki/${qid}`,
    name: `Synthetic Board ${t}`,
    description: "synthetic project management software (test data)",
    website_url: `https://board-${t}.test/`,
    launch_year: 2016,
    country_code: "DE",
    company_name: `Synthetic GmbH ${t}`,
    company_external_id: `Q8${Math.floor(Math.random() * 1e9)}`,
    source_categories: ["software as a service", "project management software"],
    licence: "CC0-1.0",
    retrieved_at: "2026-11-10T12:00:00.000Z",
    ...over,
  };
}

async function productByUrl(website: string) {
  const { data } = await db
    .from("saas_products")
    .select(
      "id, name, record_status, exclusion_status, launch_year, short_description, discovery_source_id, product_categories(is_primary, categories(slug))",
    )
    .eq("website_url", website.replace(/\/$/, ""))
    .maybeSingle();
  return data;
}

run("catalog ingestion on the local Supabase stack", () => {
  beforeAll(() => {
    db = createServiceClient({ url: url as string, secretKey: secretKey as string });
  });

  it("creates visible, categorised products with provenance, idempotently", async () => {
    const a = listing();
    const b = listing({
      description: "synthetic video conferencing service (test data)",
      source_categories: ["videoconferencing software"],
    });
    const first = await ingestListings(db, [a, b], { sourceKey: "wikidata" });
    expect(first.counts).toMatchObject({ created: 2, error: 0 });
    const pa = await productByUrl(a.website_url);
    expect(pa).toMatchObject({
      name: a.name,
      record_status: "active",
      exclusion_status: "eligible",
      launch_year: 2016,
      short_description: a.description,
    });
    expect(pa?.product_categories).toEqual([
      { is_primary: true, categories: { slug: "business-operations-project-management" } },
    ]);
    const pb = await productByUrl(b.website_url);
    expect(pb?.product_categories?.[0]?.categories?.slug).toBe(
      "communication-collaboration-video-conferencing",
    );
    const { count: evidence } = await db
      .from("evidence_items")
      .select("id", { count: "exact", head: true })
      .eq("product_id", pa!.id);
    expect(evidence).toBe(1);

    const replay = await ingestListings(db, [a, b], { sourceKey: "wikidata" });
    expect(replay.counts).toMatchObject({ created: 0, matched_existing: 2, error: 0 });
    const { count: products } = await db
      .from("saas_products")
      .select("id", { count: "exact", head: true })
      .in(
        "website_url",
        [a.website_url, b.website_url].map((u) => u.replace(/\/$/, "")),
      );
    expect(products).toBe(2);
  });

  it("keeps excluded products hidden and never imports app-store pages or domain-only matches", async () => {
    const t = tag();
    const affiliate = listing({
      name: `Synthetic Affiliates ${t}`,
      description: "synthetic affiliate tracking software (test data)",
      source_categories: ["affiliate marketing software"],
    });
    const appStore = listing({ website_url: `https://apps.apple.com/app/synthetic-${t}/id1` });
    const base = listing({ website_url: `https://suite-${t}.test/` });
    const sibling = listing({ website_url: `https://suite-${t}.test/other-product` });
    const summary = await ingestListings(db, [affiliate, appStore, base, sibling], {
      sourceKey: "wikidata",
    });
    expect(summary.counts).toMatchObject({
      created: 1,
      created_hidden: 1,
      needs_review: 2,
      error: 0,
    });
    expect(summary.reasons).toMatchObject({
      exclusion_excluded: 1,
      shared_host_website: 1,
      same_domain_other_url: 1,
    });
    expect(await productByUrl(affiliate.website_url)).toMatchObject({
      record_status: "candidate",
      exclusion_status: "excluded",
    });
  });

  it("maps only to categories that exist and are visible in the taxonomy", async () => {
    const { data } = await db
      .from("categories")
      .select("slug")
      .in("slug", CATEGORY_MAPPING_SLUGS)
      .eq("is_user_visible", true)
      .eq("is_active", true);
    expect((data ?? []).map((c) => c.slug).sort()).toEqual([...CATEGORY_MAPPING_SLUGS].sort());
  });

  it("rejects invalid listings without writing anything", async () => {
    const summary = await ingestListings(
      db,
      [
        { ...listing(), website_url: "ftp://nope.test" },
        { foo: 1 },
        listing({ source_key: "other_source" }),
      ],
      { sourceKey: "wikidata" },
    );
    expect(summary.counts).toMatchObject({ rejected: 3, created: 0, error: 0 });
  });
});
