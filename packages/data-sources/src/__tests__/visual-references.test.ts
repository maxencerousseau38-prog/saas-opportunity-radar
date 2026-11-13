// S8.5 (PD-38): visual references. Share image declared on the official site
// (loopback fixture server, synthetic bytes) and free-licence files from
// Wikimedia Commons (recorded API shapes, synthetic values).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildWikidataImagesQuery,
  collectCommonsReferences,
  collectShareImage,
  commonsReference,
  extractShareImage,
  OfficialWebsiteConnector,
  parseCommonsImageInfo,
  parseWikidataImages,
  shareImagePolicy,
} from "../index";
import { startServer, testPolicy } from "./fixture-server";

/** Synthetic PNG header padded to a realistic size (visref-2 rejects near-blank images). */
function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(Math.max(64, Math.ceil(width * height * 0.05)), 1);
  Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").copy(b, 0);
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

describe("extractShareImage", () => {
  const base = "https://example.com/";
  it("reads og:image in either attribute order and resolves it", () => {
    expect(
      extractShareImage(
        '<head><meta content="/og/home.png" property="og:image"><meta property="og:image:alt" content="Dashboard"></head>',
        base,
      ),
    ).toEqual({ url: "https://example.com/og/home.png", declaredBy: "og:image", alt: "Dashboard" });
    expect(
      extractShareImage(
        '<head><meta name="twitter:image" content="https://cdn.example.com/t.jpg"></head>',
        base,
      ),
    ).toEqual({ url: "https://cdn.example.com/t.jpg", declaredBy: "twitter:image", alt: null });
  });
  it("prefers an https URL and ignores templated values", () => {
    expect(
      extractShareImage(
        '<head><meta property="og:image" content="http://example.com/a.png"><meta property="og:image:secure_url" content="https://example.com/b.png"></head>',
        base,
      )?.url,
    ).toBe("https://example.com/b.png");
    expect(
      extractShareImage(
        '<head><meta property="og:image" content="http://example.com/a.png"></head>',
        base,
      )?.url,
    ).toBe("http://example.com/a.png");
    expect(
      extractShareImage('<head><meta property="og:image" content="{{ page.image }}"></head>', base),
    ).toBeNull();
    expect(extractShareImage("<head><title>No image</title></head>", base)).toBeNull();
  });
});

describe("collectShareImage", () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  const hosts = { "brand.test": ["127.0.0.1"] };
  const policy = () => testPolicy(hosts, { maxBytes: 64 * 1024 });
  const imgPolicy = () =>
    shareImagePolicy({
      resolve: policy().resolve,
      isAddressAllowed: policy().isAddressAllowed,
      timeoutMs: 2000,
    });
  const connector = () =>
    new OfficialWebsiteConnector({
      policy: policy(),
      minIntervalMs: 0,
      sleep: async () => undefined,
    });
  const listing = (path: string) => ({
    source_key: "uneed",
    external_id: "brand",
    name: "Brand",
    website_url: `http://brand.test:${server.port}${path}`,
  });
  const run = (path: string) =>
    collectShareImage({
      connector: connector(),
      listing: listing(path),
      policy: imgPolicy(),
      signal: new AbortController().signal,
      requireHttps: false,
      now: () => new Date("2026-11-12T10:00:00Z"),
    });

  beforeAll(async () => {
    server = await startServer({
      "/robots.txt": (_q, r) => {
        r.writeHead(200, { "content-type": "text/plain" });
        r.end("User-agent: *\nDisallow: /private\n");
      },
      "/": (_q, r) => {
        r.writeHead(200, { "content-type": "text/html" });
        r.end(
          '<html><head><meta property="og:image" content="/og/home.png"></head><body>Brand</body></html>',
        );
      },
      "/logo-page": (_q, r) => {
        r.writeHead(200, { "content-type": "text/html" });
        r.end('<html><head><meta property="og:image" content="/static/logo.png"></head></html>');
      },
      "/square-page": (_q, r) => {
        r.writeHead(200, { "content-type": "text/html" });
        r.end('<html><head><meta property="og:image" content="/og/square.png"></head></html>');
      },
      "/bare": (_q, r) => {
        r.writeHead(200, { "content-type": "text/html" });
        r.end("<html><head><title>Brand</title></head></html>");
      },
      "/private": (_q, r) => {
        r.writeHead(200, { "content-type": "text/html" });
        r.end('<html><head><meta property="og:image" content="/og/home.png"></head></html>');
      },
      "/og/home.png": (_q, r) => {
        r.writeHead(200, { "content-type": "image/png" });
        r.end(png(1200, 630));
      },
      "/static/logo.png": (_q, r) => {
        r.writeHead(200, { "content-type": "image/png" });
        r.end(png(1200, 630));
      },
      "/og/square.png": (_q, r) => {
        r.writeHead(200, { "content-type": "image/png" });
        r.end(png(800, 800));
      },
    });
  });
  afterAll(() => server.close());

  it("keeps the declared share image with its real size and hash, as a reference", async () => {
    const decision = await run("/");
    expect("reference" in decision).toBe(true);
    if (!("reference" in decision)) return;
    expect(decision.reference).toMatchObject({
      kind: "publisher",
      listing_source_key: "uneed",
      listing_external_id: "brand",
      image_url: `http://brand.test:${server.port}/og/home.png`,
      content_type: "image/png",
      width: 1200,
      height: 630,
      licence_code: null,
      attribution: null,
      observed_at: "2026-11-12T10:00:00.000Z",
    });
    expect(decision.reference.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses logos, square images, pages without a share image and robots.txt exclusions", async () => {
    expect(await run("/logo-page")).toEqual({ rejection: "logo_like_name" });
    expect(await run("/square-page")).toEqual({ rejection: "logo_like_shape" });
    expect(await run("/bare")).toEqual({ rejection: "no_share_image" });
    expect(await run("/private")).toEqual({ rejection: "page_robots_disallow" });
  });
});

describe("Wikimedia Commons", () => {
  const sparql = {
    results: {
      bindings: [
        {
          item: { value: "http://www.wikidata.org/entity/Q1" },
          image: {
            value:
              "http://commons.wikimedia.org/wiki/Special:FilePath/Product%20One%20screenshot.png",
          },
        },
        {
          item: { value: "http://www.wikidata.org/entity/Q2" },
          image: {
            value: "http://commons.wikimedia.org/wiki/Special:FilePath/Product_Two_logo.svg",
          },
        },
        {
          item: { value: "http://www.wikidata.org/entity/Q3" },
          image: { value: "http://commons.wikimedia.org/wiki/Special:FilePath/Product_Three.jpg" },
        },
      ],
    },
  };
  const file = (title: string, extra: Record<string, unknown>, meta: Record<string, string>) => ({
    title,
    imageinfo: [
      {
        descriptionurl: `https://commons.wikimedia.org/wiki/${title.replace(/ /g, "_")}`,
        thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/x/xy/${encodeURIComponent(title)}/1280px.png`,
        thumbwidth: 1280,
        thumbheight: 720,
        mime: "image/png",
        sha1: "a".repeat(40),
        extmetadata: Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, { value: v }])),
        ...extra,
      },
    ],
  });
  const commons = {
    query: {
      normalized: [{ from: "File:Product_Three.jpg", to: "File:Product Three.jpg" }],
      pages: [
        file(
          "File:Product One screenshot.png",
          {},
          {
            LicenseShortName: "CC BY-SA 4.0",
            LicenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
            Artist: '<a href="//commons.wikimedia.org/wiki/User:Jane">Jane Doe</a>',
          },
        ),
        file(
          "File:Product Two logo.svg",
          { mime: "image/svg+xml" },
          { LicenseShortName: "Public domain" },
        ),
        file(
          "File:Product Three.jpg",
          { mime: "image/jpeg" },
          { LicenseShortName: "CC BY-NC 4.0", Artist: "Someone" },
        ),
      ],
    },
  };

  it("maps Wikidata images to Commons file titles", () => {
    expect(buildWikidataImagesQuery(["Q1", "bad", "Q2"])).toContain("VALUES ?item { wd:Q1 wd:Q2 }");
    expect(parseWikidataImages(sparql)).toEqual(
      new Map([
        ["Q1", "File:Product One screenshot.png"],
        ["Q2", "File:Product Two logo.svg"],
        ["Q3", "File:Product Three.jpg"],
      ]),
    );
  });

  it("keeps only free, attributed, raster, non-logo files", () => {
    const files = parseCommonsImageInfo(commons);
    const at = "2026-11-12T10:00:00.000Z";
    const one = commonsReference(
      { external_id: "Q1", name: "Product One" },
      files.get("File:Product One screenshot.png")!,
      at,
    );
    expect(one).toEqual({
      reference: expect.objectContaining({
        kind: "licensed",
        listing_source_key: "wikidata",
        listing_external_id: "Q1",
        page_url: "https://commons.wikimedia.org/wiki/File:Product_One_screenshot.png",
        licence_code: "CC-BY-SA-4.0",
        attribution: "Jane Doe",
        content_hash: "a".repeat(40),
        width: 1280,
        height: 720,
      }),
    });
    expect(
      commonsReference(
        { external_id: "Q2", name: "Two" },
        files.get("File:Product Two logo.svg")!,
        at,
      ),
    ).toEqual({
      rejection: "unsupported_format",
    });
    // The normalized title is found under the title Wikidata gave.
    expect(
      commonsReference(
        { external_id: "Q3", name: "Three" },
        files.get("File:Product_Three.jpg")!,
        at,
      ),
    ).toEqual({
      rejection: "licence_not_free",
    });
  });

  it("collects in batches and counts why listings have no image", async () => {
    const result = await collectCommonsReferences({
      listings: [
        { external_id: "Q1", name: "Product One" },
        { external_id: "Q2", name: "Product Two" },
        { external_id: "Q3", name: "Product Three" },
        { external_id: "Q4", name: "Product Four" },
      ],
      run: async () => sparql,
      get: async () => commons,
      now: () => new Date("2026-11-12T10:00:00Z"),
    });
    expect(result.candidates).toBe(4);
    expect(result.references.map((r) => r.listing_external_id)).toEqual(["Q1"]);
    expect(result.rejected).toEqual({
      no_image_on_wikidata: 1,
      unsupported_format: 1,
      licence_not_free: 1,
    });
  });
});
