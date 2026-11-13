// PD-40 (visref-2): hero and interface screenshot shown on the official home
// page. Extraction from synthetic markup, then the combined collector against
// a loopback fixture server (synthetic bytes, not images of any product).
import type { ServerResponse } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  collectOfficialVisuals,
  extractSiteImages,
  OfficialWebsiteConnector,
  shareImagePolicy,
} from "../index";
import { startServer, testPolicy } from "./fixture-server";

/** Synthetic PNG header padded to `bytesPerPixel` (detail proxy). */
function png(width: number, height: number, bytesPerPixel = 0.08): Buffer {
  const b = Buffer.alloc(Math.max(64, Math.ceil(width * height * bytesPerPixel)), 7);
  Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").copy(b, 0);
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

describe("extractSiteImages", () => {
  const base = "https://acme.io/";

  it("keeps a hero and a named screenshot, best first, with their signals", () => {
    const html = `<html><head><title>Acme</title></head><body>
      <header class="nav"><img src="/brand/acme.png" class="logo-dark" alt="Acme"></header>
      <section class="hero-section">
        <h1>Ship faster</h1>
        <img src="/_next/image?url=%2Fimages%2Fhome.webp&w=3840&q=75" alt="Acme product" width="1600" height="900">
      </section>
      <section id="features">
        <img srcset="/shots/dashboard-640.png 640w, /shots/dashboard-1600.png 1600w" alt="Analytics dashboard">
      </section>
    </body></html>`;
    const found = extractSiteImages(html, base);
    expect(found.map((c) => [c.url, c.kind])).toEqual([
      ["https://acme.io/images/home.webp", "site_hero"],
      ["https://acme.io/shots/dashboard-1600.png", "site_screenshot"],
    ]);
    expect(found[0]!.signals).toContain("in_hero_section");
    expect(found[1]!.signals).toContain("screenshot_named");
  });

  it("never keeps a picture without an explicit hero or screenshot signal", () => {
    const html = `<body><main>
      <img src="/img/office.jpg" alt="Our office" width="1600" height="900">
      <img src="/img/photo-2.jpg">
    </main></body>`;
    expect(extractSiteImages(html, base)).toEqual([]);
  });

  it("refuses logos, people, badges, stock-like decoration, widgets and vector or tiny images", () => {
    const html = `<body><section class="hero">
      <img src="/hero/logo.png" alt="Acme">
      <img src="/hero/team-photo.jpg" alt="Our founders">
      <img src="/hero/main.png" class="w-full bg-white" alt="Hero" width="120">
      <img src="https://api.producthunt.com/widgets/embed-image/v1/featured.png?post_id=1" alt="Product Hunt">
      <img src="/hero/visual.svg" alt="Hero illustration">
      <img src="/hero/screen.gif" alt="Dashboard demo">
      <img src="data:image/png;base64,AAAA" alt="Dashboard">
      <img src="/hero/award-badge.png" alt="Award">
      <img src="/hero/customer-logos.png" alt="Trusted by">
      <img src="/hero/main.png" class="brand-mark">
    </section></body>`;
    expect(extractSiteImages(html, base)).toEqual([]);
  });

  it("ignores markup inside scripts and templates", () => {
    const html = `<body><script>const x = '<img src="/hero.png" class="hero">';</script>
      <template><img src="/hero.png" class="hero"></template></body>`;
    expect(extractSiteImages(html, base)).toEqual([]);
  });
});

describe("collectOfficialVisuals", () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  const hosts = { "acme.test": ["127.0.0.1"] };
  const policy = () => testPolicy(hosts, { maxBytes: 64 * 1024 });
  const imgPolicy = () =>
    shareImagePolicy({
      resolve: policy().resolve,
      isAddressAllowed: policy().isAddressAllowed,
      timeoutMs: 2000,
    });
  const run = (path: string) =>
    collectOfficialVisuals({
      connector: new OfficialWebsiteConnector({
        policy: policy(),
        minIntervalMs: 0,
        sleep: async () => undefined,
      }),
      listing: {
        source_key: "uneed",
        external_id: "acme",
        name: "Acme",
        website_url: `http://acme.test:${server.port}${path}`,
      },
      policy: imgPolicy(),
      signal: new AbortController().signal,
      requireHttps: false,
      now: () => new Date("2026-11-13T10:00:00Z"),
    });
  const image = (bytes: Buffer) => (_q: unknown, r: ServerResponse) => {
    r.writeHead(200, { "content-type": "image/png" });
    r.end(bytes);
  };
  const page = (body: string) => (_q: unknown, r: ServerResponse) => {
    r.writeHead(200, { "content-type": "text/html" });
    r.end(
      `<html><head><meta property="og:image" content="/og.png"></head><body>${body}</body></html>`,
    );
  };

  beforeAll(async () => {
    server = await startServer({
      "/robots.txt": (_q, r) => {
        r.writeHead(200, { "content-type": "text/plain" });
        r.end("User-agent: *\nDisallow: /private\n");
      },
      "/": page('<section class="hero"><img src="/hero.png" alt="Acme workspace"></section>'),
      "/flat": page('<section class="hero"><img src="/hero-flat.png" alt="Acme"></section>'),
      "/fallback": page(
        '<div class="hero"><img src="/hero-flat.png"></div><img src="/screenshot-app.png" alt="App screenshot">',
      ),
      "/none": page("<main><p>No visual</p></main>"),
      "/og.png": image(png(1200, 630)),
      "/hero.png": image(png(1600, 900)),
      "/hero-flat.png": image(png(1600, 900, 0.005)),
      "/screenshot-app.png": image(png(1440, 900)),
    });
  });
  afterAll(() => server.close());

  it("returns the share image and the hero from one visit, as references", async () => {
    const { share, site } = await run("/");
    expect(share).toMatchObject({ reference: { kind: "publisher", width: 1200, height: 630 } });
    expect(site).toMatchObject({
      reference: {
        kind: "site_hero",
        image_url: `http://acme.test:${server.port}/hero.png`,
        page_url: `http://acme.test:${server.port}`,
        alt_text: "Acme workspace",
        width: 1600,
        height: 900,
        licence_code: null,
      },
    });
  });

  it("refuses a near-blank hero and falls back to the next candidate", async () => {
    expect((await run("/flat")).site).toEqual({ rejection: "low_detail" });
    const { site } = await run("/fallback");
    expect(site).toMatchObject({
      reference: {
        kind: "site_screenshot",
        image_url: `http://acme.test:${server.port}/screenshot-app.png`,
      },
    });
  });

  it("states why there is no site image", async () => {
    expect((await run("/none")).site).toEqual({ rejection: "no_site_image" });
    expect(await run("/private")).toEqual({
      share: { rejection: "page_robots_disallow" },
      site: { rejection: "page_robots_disallow" },
    });
  });
});
