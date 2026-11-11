// S8.3 product visuals on the local Supabase stack (ADR-016): rights gate
// before any download, SSRF-safe fetch, byte checks, private copy, replay,
// revalidation. SYNTHETIC images served by a loopback fixture server under
// `.test` names (test data, never real product visuals).
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { VisualAssetManifest } from "@sor/contracts";
import { createServiceClient, type DbClient } from "@sor/database";
import { fetchVisualAsset, imagePolicy, isPublicAddress } from "@sor/data-sources";
import { admitAssets, revalidateAssets, type FetchImage } from "../../src/assets/admit";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const run = url && secretKey ? describe : describe.skip;

function png(width: number, height: number, fill: number): Buffer {
  const header = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  const dims = Buffer.alloc(8);
  dims.writeUInt32BE(width, 0);
  dims.writeUInt32BE(height, 4);
  return Buffer.concat([header, dims, Buffer.alloc(256, fill)]);
}

let db: DbClient;
let server: Server;
let port = 0;
let operator = "";
let slug = "";
let heroBytes = png(1600, 700, 1);
let fetches = 0;

const fetchImage: FetchImage = (imageUrl) => {
  fetches++;
  const local = imageUrl.replace("https://brand-s83.test", `http://brand-s83.test:${port}`);
  return fetchVisualAsset(
    local,
    imagePolicy({
      resolve: async (host) => {
        if (host !== "brand-s83.test")
          throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
        return [{ address: "127.0.0.1", family: 4 }];
      },
      isAddressAllowed: (a) => a === "127.0.0.1" || isPublicAddress(a),
      timeoutMs: 2000,
    }),
    AbortSignal.timeout(5000),
    { requireHttps: false },
  );
};

function manifest(over: Partial<VisualAssetManifest["assets"][number]> = {}): VisualAssetManifest {
  return {
    manifest_version: "visual-assets-1",
    assets: [
      {
        product_slug: slug,
        asset_type: "official_hero",
        image_url: "https://brand-s83.test/hero.png",
        page_url: "https://brand-s83.test/press",
        alt_text: "Synthetic hero (test data)",
        primary: true,
        rights: {
          status: "approved",
          basis: "Synthetic press kit licence allowing copy and storage (test data)",
          evidence_url: "https://brand-s83.test/press/licence",
          covers_private_copy: true,
        },
        ...over,
      },
    ],
  };
}

run("product visuals on the local Supabase stack", () => {
  beforeAll(async () => {
    db = createServiceClient({ url: url as string, secretKey: secretKey as string });
    server = createServer((req, res) => {
      if (req.url === "/robots.txt") {
        res.writeHead(404).end();
      } else if (req.url === "/hero.png") {
        res.writeHead(200, { "content-type": "image/png" }).end(heroBytes);
      } else if (req.url === "/logo.png") {
        res.writeHead(200, { "content-type": "image/png" }).end(png(512, 512, 2));
      } else if (req.url === "/page.png") {
        res.writeHead(200, { "content-type": "text/html" }).end("<html>not an image</html>");
      } else res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;

    const email = `operator-s83-${randomUUID().slice(0, 8)}@example.test`;
    const created = await db.auth.admin.createUser({
      email,
      password: randomUUID(),
      email_confirm: true,
    });
    if (created.error || !created.data.user) throw created.error ?? new Error("no user");
    operator = created.data.user.id;
    const op = await db
      .from("platform_operators")
      .insert({ user_id: operator, note: "S8.3 test operator" });
    if (op.error) throw op.error;
    slug = `synthetic-s83-${randomUUID().slice(0, 8)}`;
    const product = await db.from("saas_products").insert({
      name: `Synthetic S83 ${slug}`,
      slug,
      website_url: "https://brand-s83.test",
      record_status: "active",
      exclusion_status: "eligible",
    });
    if (product.error) throw product.error;
  });
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("downloads nothing when the rights do not cover a private copy", async () => {
    fetches = 0;
    const [r] = await admitAssets(
      db,
      manifest({
        rights: { status: "unknown", basis: "", evidence_url: null, covers_private_copy: false },
      }),
      { operator, fetchImage },
    );
    expect(r).toMatchObject({ status: "refused" });
    expect(r!.reasons).toContain("rights_not_approved");
    expect(fetches).toBe(0);
  });

  it("refuses a logo-shaped image and a non-image", async () => {
    const [logo] = await admitAssets(
      db,
      manifest({ image_url: "https://brand-s83.test/logo.png" }),
      {
        operator,
        fetchImage,
      },
    );
    expect(logo!.reasons).toContain("logo_like_shape");
    const [page] = await admitAssets(
      db,
      manifest({ image_url: "https://brand-s83.test/page.png" }),
      {
        operator,
        fetchImage,
      },
    );
    expect(page!.reasons[0]).toMatch(/^fetch_blocked:content_type_not_allowed/);
  });

  it("admits an authorised visual once, as a private copy", async () => {
    const [r] = await admitAssets(db, manifest(), { operator, fetchImage });
    expect(r).toMatchObject({ status: "created" });
    const { data: asset } = await db
      .from("product_visual_assets")
      .select(
        "delivery_path, rights_status, verification_status, width, height, is_primary, is_current",
      )
      .eq("id", r!.asset_id!)
      .single();
    expect(asset).toMatchObject({
      delivery_path: `/api/v1/catalog/assets/${r!.asset_id}`,
      rights_status: "approved",
      verification_status: "verified",
      width: 1600,
      height: 700,
      is_primary: true,
      is_current: true,
    });
    const { data: file } = await db
      .from("product_visual_asset_files")
      .select("byte_size, content_type")
      .eq("asset_id", r!.asset_id!)
      .single();
    expect(file).toEqual({ byte_size: heroBytes.byteLength, content_type: "image/png" });
    const [replay] = await admitAssets(db, manifest(), { operator, fetchImage });
    expect(replay).toMatchObject({ status: "existing", asset_id: r!.asset_id });
  });

  it("keeps an unchanged visual and hides one whose source changed", async () => {
    const first = await revalidateAssets(db, { fetchImage });
    const mine = await db
      .from("product_visual_assets")
      .select("id")
      .eq("source_url", "https://brand-s83.test/hero.png")
      .eq("is_current", true);
    const id = mine.data![0]!.id;
    expect(first.find((x) => x.asset_id === id)?.result).toBe("unchanged");
    heroBytes = png(1600, 700, 9); // the official visual was replaced
    const second = await revalidateAssets(db, { fetchImage });
    expect(second.find((x) => x.asset_id === id)?.result).toBe("changed");
    const { data } = await db
      .from("product_visual_assets")
      .select("is_current, last_check_status")
      .eq("id", id)
      .single();
    expect(data).toEqual({ is_current: false, last_check_status: "changed" });
    const { count } = await db
      .from("product_visual_asset_files")
      .select("asset_id", { count: "exact", head: true })
      .eq("asset_id", id);
    expect(count).toBe(0);
  });
});
