// S8.3 (ADR-016): downloading one admitted visual through the SSRF-safe
// fetcher. Loopback fixture server and synthetic bytes only.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchVisualAsset, imagePolicy } from "../index";
import { startServer, testPolicy } from "./fixture-server";

const PNG = Buffer.concat([
  Buffer.from("89504e470d0a1a0a0000000d494844520000064000000002bc", "hex"),
  Buffer.alloc(64, 1),
]);
let server: Awaited<ReturnType<typeof startServer>>;
const policy = (overrides = {}) =>
  testPolicy(
    { "brand.test": ["127.0.0.1"], "evil.test": ["10.0.0.5"] },
    {
      ...imagePolicy(),
      resolve: testPolicy({ "brand.test": ["127.0.0.1"], "evil.test": ["10.0.0.5"] }).resolve,
      isAddressAllowed: testPolicy({}).isAddressAllowed,
      timeoutMs: 2000,
      ...overrides,
    },
  );
const url = (path: string) => `http://brand.test:${server.port}${path}`;
const run = (path: string, overrides = {}) =>
  fetchVisualAsset(url(path), policy(overrides), new AbortController().signal, {
    requireHttps: false,
  });

beforeAll(async () => {
  server = await startServer({
    "/robots.txt": (_q, r) => {
      r.writeHead(200, { "content-type": "text/plain" });
      r.end("User-agent: *\nDisallow: /private/\n");
    },
    "/hero.png": (_q, r) => {
      r.writeHead(200, { "content-type": "image/png" });
      r.end(PNG);
    },
    "/private/hero.png": (_q, r) => {
      r.writeHead(200, { "content-type": "image/png" });
      r.end(PNG);
    },
    "/page.html": (_q, r) => {
      r.writeHead(200, { "content-type": "text/html" });
      r.end("<html>not an image</html>");
    },
    "/hero.svg": (_q, r) => {
      r.writeHead(200, { "content-type": "image/svg+xml" });
      r.end("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");
    },
    "/huge.png": (_q, r) => {
      r.writeHead(200, { "content-type": "image/png" });
      r.end(Buffer.alloc(2 * 1024 * 1024 + 10));
    },
    "/redirect-internal": (_q, r) => {
      r.writeHead(302, { location: "http://evil.test/hero.png" });
      r.end();
    },
  });
});
afterAll(() => server.close());

describe("fetchVisualAsset", () => {
  it("downloads the exact bytes of an allowed image", async () => {
    const res = await run("/hero.png");
    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      expect(Buffer.from(res.data.bytes).equals(PNG)).toBe(true);
      expect(res.data.contentType).toBe("image/png");
    }
  });

  it("obeys robots.txt", async () => {
    expect(await run("/private/hero.png")).toMatchObject({
      status: "blocked",
      reason: "robots_disallow",
    });
  });

  it("refuses non-image and SVG content", async () => {
    expect((await run("/page.html")).status).toBe("blocked");
    expect((await run("/hero.svg")).status).toBe("blocked");
  });

  it("refuses oversized content", async () => {
    expect(await run("/huge.png")).toMatchObject({
      status: "blocked",
      reason: "response_too_large",
    });
  });

  it("re-validates redirects and never reaches a private address", async () => {
    expect(await run("/redirect-internal")).toMatchObject({
      status: "blocked",
      reason: "address_not_public",
    });
  });

  it("requires https outside tests", async () => {
    const res = await fetchVisualAsset(url("/hero.png"), policy(), new AbortController().signal);
    expect(res).toMatchObject({ status: "blocked", reason: "https_required" });
  });
});
