// Controlled discovery rebound (docs/DATA_SOURCES.md controls) and the
// simulated search connector, on SYNTHETIC documents (no network).
import { describe, expect, it } from "vitest";
import type { SourceDocument } from "@sor/contracts/evidence";
import {
  DEFAULT_REBOUND_CONTROLS,
  DISCOVERY_SOURCES,
  SEARCH_SOURCE_KEYS,
  SimulatedSearchConnector,
  extractReboundLeads,
  isExcludedReboundDomain,
  selectReboundPages,
} from "../index";

const doc = (url: string, links: string[], external: string[] = []): SourceDocument => ({
  source_key: "official_website",
  canonical_url: url,
  external_id: null,
  title: null,
  text: "",
  published_at: null,
  retrieved_at: "2026-11-06T10:00:00Z",
  content_hash: "a".repeat(64),
  fetch_status: "ok",
  http_status: 200,
  storage_permitted: "excerpt",
  metadata: { links, external_links: external },
});

describe("selectReboundPages (control 2)", () => {
  it("keeps allow-listed same-site pages only, at most 3", () => {
    const home = doc("https://seed.test", [
      "https://seed.test/pricing",
      "https://seed.test/integrations",
      "https://seed.test/integrations/",
      "https://seed.test/alternatives/foo",
      "https://seed.test/seed-vs-rival",
      "https://seed.test/compare",
      "https://seed.test/apps",
    ]);
    expect(
      selectReboundPages(home, DEFAULT_REBOUND_CONTROLS).map((u) => new URL(u).pathname),
    ).toEqual(["/integrations", "/alternatives/foo", "/seed-vs-rival"]);
  });

  it("never reads affiliate, partner or account pages", () => {
    const home = doc("https://seed.test", [
      "https://seed.test/partners/integrations",
      "https://seed.test/affiliate-program/apps",
      "https://seed.test/login/apps",
    ]);
    expect(selectReboundPages(home, DEFAULT_REBOUND_CONTROLS)).toEqual([]);
  });
});

describe("extractReboundLeads (control 3)", () => {
  const page = doc(
    "https://seed.test/integrations",
    [],
    [
      "https://www.rival.example/features?utm_source=seed",
      "https://app.rival.example/login",
      "https://twitter.com/seed",
      "https://github.com/seed/sdk",
      "https://www.g2.com/products/seed",
      "https://blog.seed.test/post",
      "https://other.example/",
      "https://third.example/",
    ],
  );

  it("keeps one lead per other site, never shared hosts, social networks or review sites", () => {
    expect(extractReboundLeads(page, "seed.test", DEFAULT_REBOUND_CONTROLS)).toEqual([
      {
        leadUrl: "https://rival.example/",
        registrableDomain: "rival.example",
        sourcePageUrl: "https://seed.test/integrations",
      },
      {
        leadUrl: "https://other.example/",
        registrableDomain: "other.example",
        sourcePageUrl: "https://seed.test/integrations",
      },
      {
        leadUrl: "https://third.example/",
        registrableDomain: "third.example",
        sourcePageUrl: "https://seed.test/integrations",
      },
    ]);
  });

  it("caps leads per seed and skips domains already seen in the run", () => {
    expect(
      extractReboundLeads(
        page,
        "seed.test",
        { pagesPerSeed: 3, leadsPerSeed: 1 },
        new Set(["rival.example"]),
      ).map((l) => l.registrableDomain),
    ).toEqual(["other.example"]);
  });

  it("matches excluded domains and their subdomains", () => {
    expect(isExcludedReboundDomain("producthunt.com")).toBe(true);
    expect(isExcludedReboundDomain("news.ycombinator.com")).toBe(true);
    expect(isExcludedReboundDomain("metricflow.example")).toBe(false);
  });
});

describe("source descriptors", () => {
  it("record the storage policy decided by the terms review", () => {
    expect(DISCOVERY_SOURCES.hacker_news).toMatchObject({
      storagePolicy: "metadata_only",
      reliabilityLevel: 3,
    });
    expect(SEARCH_SOURCE_KEYS).toEqual(["hacker_news"]);
  });
});

describe("SimulatedSearchConnector", () => {
  it("returns labelled synthetic results and can simulate an outage", async () => {
    const s = new SimulatedSearchConnector({
      sourceKey: "simulated_search",
      results: { analytics: [{ url: "https://a.example/", title: "A" }] },
    });
    const res = await s.search({ query: "Analytics", limit: 5 }, new AbortController().signal);
    expect(res).toEqual({
      status: "ok",
      data: [{ url: "https://a.example/", title: "A", metadata: { simulated: 1 } }],
    });
    const down = new SimulatedSearchConnector({
      sourceKey: "x",
      results: {},
      failWith: "unavailable",
    });
    expect((await down.search({ query: "a", limit: 1 }, new AbortController().signal)).status).toBe(
      "unavailable",
    );
  });
});
