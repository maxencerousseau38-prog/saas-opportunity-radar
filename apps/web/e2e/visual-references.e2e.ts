// S8.5 (PD-38): visuals displayed by reference on the labelled demo fixtures.
// A free-licence image (Wikimedia Commons URL answered by a synthetic image
// through Playwright routing: no network) shows its kind, author and licence;
// a publisher share image whose origin is gone falls back to the honest
// "no authentic preview" state. Everything this file adds is removed at the end.
import { crc32, deflateSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "./fixtures";
import { MEMBER, signIn, waitForResults } from "./helpers";

test.describe.configure({ mode: "serial" });

const admin = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SECRET_KEY ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const COMMONS_IMAGE =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/E2E_dashboard.png/1280px-E2E_dashboard.png";

/** A real, decodable 1280×720 PNG of one flat colour: a test fixture, not a product visual. */
function syntheticPng(): Buffer {
  const width = 1280;
  const height = 720;
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x5a)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function identify(slug: string, externalId: string): Promise<string> {
  const { data: product } = await admin
    .from("saas_products")
    .select("id")
    .eq("slug", slug)
    .single();
  const { data: source } = await admin
    .from("sources")
    .select("id")
    .eq("source_key", "wikidata")
    .single();
  const { error } = await admin.from("entity_identifiers").insert({
    product_id: product!.id,
    identifier_type: "external_id",
    value_normalized: externalId,
    source_id: source!.id,
  });
  expect(error).toBeNull();
  return product!.id as string;
}

let productIds: string[] = [];

test.afterAll(async () => {
  await admin
    .from("product_visual_assets")
    .delete()
    .in("product_id", productIds)
    .in("asset_type", ["licensed_image", "publisher_share_image"]);
  await admin
    .from("entity_identifiers")
    .delete()
    .in("value_normalized", ["Q990000001", "Q990000002"]);
});

test("free-licence and publisher references: kind, credit, licence and fallback", async ({
  page,
}) => {
  productIds = [
    await identify("mailtide", "Q990000001"),
    await identify("metricflow", "Q990000002"),
  ];
  const licensed = await admin.rpc("sor_record_visual_reference", {
    p_ref: {
      kind: "licensed",
      listing_source_key: "wikidata",
      listing_external_id: "Q990000001",
      image_url: COMMONS_IMAGE,
      page_url: "https://commons.wikimedia.org/wiki/File:E2E_dashboard.png",
      content_hash: "a".repeat(40),
      content_type: "image/png",
      width: 1280,
      height: 720,
      alt_text: "Tableau de bord de Mailtide (fixture de test synthétique)",
      licence_code: "CC-BY-SA-4.0",
      licence_url: "https://creativecommons.org/licenses/by-sa/4.0",
      attribution: "E2E Author",
    },
  });
  expect(licensed.error).toBeNull();
  expect((licensed.data as { status: string }).status).toBe("created");
  const publisher = await admin.rpc("sor_record_visual_reference", {
    p_ref: {
      kind: "publisher",
      listing_source_key: "wikidata",
      listing_external_id: "Q990000002",
      // .invalid never resolves: the origin is "gone".
      image_url: "https://cdn.metricflow.invalid/og/home.png",
      page_url: "https://metricflow.test/",
      content_hash: "b".repeat(64),
      content_type: "image/png",
      width: 1200,
      height: 630,
      alt_text: "Image de partage de MetricFlow (fixture de test synthétique)",
    },
  });
  expect(publisher.error).toBeNull();
  expect((publisher.data as { status: string }).status).toBe("created");

  // The Commons image is answered locally (no network in the test).
  await page.route("https://upload.wikimedia.org/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: syntheticPng() }),
  );
  await signIn(page, MEMBER);
  await waitForResults(page);

  const mailtide = page
    .getByRole("article", { name: "Mailtide" })
    .getByTestId("product-visual-preview");
  await expect(mailtide.getByTestId("visual-asset-type")).toHaveText("Image sous licence libre");
  await expect(mailtide.getByTestId("visual-asset-credit")).toContainText("© E2E Author");
  await expect(mailtide.getByTestId("visual-asset-credit")).toContainText("CC BY-SA 4.0");
  await expect(mailtide.getByTestId("visual-asset-credit")).toContainText("Wikimedia Commons");
  await expect(mailtide.locator("img")).toHaveAttribute("src", COMMONS_IMAGE);
  await expect(mailtide.locator("img")).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect(mailtide.getByRole("link", { name: /Source du visuel/ })).toHaveAttribute(
    "href",
    "https://commons.wikimedia.org/wiki/File:E2E_dashboard.png",
  );

  // The share image cannot load: the card says so instead of showing a hole.
  await expect(
    page.getByRole("article", { name: "MetricFlow" }).getByTestId("product-visual-preview"),
  ).toContainText("Aperçu authentique non disponible");
});
