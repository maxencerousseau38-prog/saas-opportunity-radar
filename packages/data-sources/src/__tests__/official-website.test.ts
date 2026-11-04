import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OfficialWebsiteConnector, selectEnrichmentPages } from "../index";
import { startServer, testPolicy } from "./fixture-server";

describe("official-website connector", () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  let robotsHits = 0;
  const signal = new AbortController().signal;

  beforeAll(async () => {
    server = await startServer({
      "/robots.txt": (_req, res) => {
        robotsHits++;
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("User-agent: *\nDisallow: /admin\n");
      },
      "/": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<title>MetricFlow</title><p>Marketing dashboards for agencies.</p>
          <a href="/pricing">Pricing</a><a href="/blog/post">Blog</a><a href="/features/">Features</a>
          <a href="/admin">Admin</a><a href="https://elsewhere.test/pricing">x</a>`);
      },
      "/admin": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("secret");
      },
      "/away": (_req, res) => {
        res.writeHead(301, { location: `http://elsewhere.test:${server.port}/` });
        res.end();
      },
    });
  });
  afterAll(() => server.close());

  const connector = () =>
    new OfficialWebsiteConnector({
      policy: testPolicy({ "metricflow.test": ["127.0.0.1"], "elsewhere.test": ["127.0.0.1"] }),
      minIntervalMs: 0,
    });

  it("returns a normalized source document with a content hash and same-site links", async () => {
    const c = connector();
    const res = await c.fetchDocument(`http://metricflow.test:${server.port}/`, signal);
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.data.source_key).toBe("official_website");
    expect(res.data.title).toBe("MetricFlow");
    expect(res.data.text).toContain("Marketing dashboards for agencies.");
    expect(res.data.content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(res.data.storage_permitted).toBe("excerpt");
    expect(selectEnrichmentPages(res.data, 5).map((u) => new URL(u).pathname)).toEqual([
      "/pricing",
      "/features/",
    ]);
  });

  it("obeys robots.txt and caches it per origin", async () => {
    const c = connector();
    robotsHits = 0;
    expect(
      await c.fetchDocument(`http://metricflow.test:${server.port}/admin`, signal),
    ).toMatchObject({
      status: "blocked",
      reason: "robots_disallow",
    });
    await c.fetchDocument(`http://metricflow.test:${server.port}/`, signal);
    expect(robotsHits).toBe(1);
  });

  it("refuses a redirect to another site", async () => {
    expect(
      await connector().fetchDocument(`http://metricflow.test:${server.port}/away`, signal),
    ).toMatchObject({
      status: "blocked",
      reason: "redirected_off_site",
    });
  });

  it("cannot search", async () => {
    expect((await connector().search()).status).toBe("not_supported");
    expect(connector().getCapabilities()).toMatchObject({ search: false, officialSource: true });
  });
});
