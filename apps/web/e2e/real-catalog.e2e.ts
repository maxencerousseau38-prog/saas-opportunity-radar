// First bulk collection (10 Nov 2026): Discover on REAL catalog data. Runs
// only in the E2E job's "real catalog" step (REAL_CATALOG=1), after the main
// suite, once the collected Wikidata snapshot (data/catalog/wikidata) has been
// ingested into the local stack: the main journeys count the six labelled
// demo products and must run before.
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "./fixtures";
import { VIEWER, signIn, waitForResults } from "./helpers";

test.skip(process.env.REAL_CATALOG !== "1", "real catalog step only (REAL_CATALOG=1)");

const admin = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SECRET_KEY ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

test("Discover scrolls through real SaaS collected from Wikidata, with their source", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { data: source } = await admin
    .from("sources")
    .select("id")
    .eq("source_key", "wikidata")
    .single();
  const { count } = await admin
    .from("saas_products")
    .select("id", { count: "exact", head: true })
    .eq("discovery_source_id", source!.id)
    .eq("record_status", "active")
    .eq("exclusion_status", "eligible");
  expect(count ?? 0).toBeGreaterThan(500); // a real, non-trivial library
  const { count: fromUneed } = await admin
    .from("saas_products")
    .select("id, sources!inner(source_key)", { count: "exact", head: true })
    .eq("sources.source_key", "uneed")
    .eq("record_status", "active")
    .eq("exclusion_status", "eligible");
  process.stdout.write(
    `real catalog: ${count} visible products from Wikidata, ${fromUneed} from Uneed\n`,
  );

  const started = Date.now();
  await signIn(page, VIEWER);
  // Measured, not hidden: with ~8,500 real products the first search + count
  // take about 1.5 s on a laptop and longer on a busy CI runner.
  await expect(page.getByTestId("result-count")).not.toHaveText("…", { timeout: 30_000 });
  const firstLoadMs = Date.now() - started;
  test
    .info()
    .annotations.push({
      type: "first Discover load (ms, sign-in included)",
      description: String(firstLoadMs),
    });
  process.stdout.write(`real catalog: first Discover load ${firstLoadMs} ms (sign-in included)\n`);
  await waitForResults(page);
  const total = Number(
    ((await page.getByTestId("result-count").textContent()) ?? "").replace(/\D/g, ""),
  );
  expect(total).toBeGreaterThanOrEqual(count ?? 0);

  // Progressive loading: scrolling the feed loads further pages.
  const cards = page.getByRole("article");
  await expect(cards.first()).toBeVisible();
  const firstPage = await cards.count();
  await cards.last().scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 20_000);
  await expect.poll(async () => cards.count(), { timeout: 30_000 }).toBeGreaterThan(firstPage);

  // A real product found by name, with its Wikidata provenance on the profile.
  const { data: product } = await admin
    .from("saas_products")
    .select("name, slug")
    .eq("discovery_source_id", source!.id)
    .eq("record_status", "active")
    .eq("exclusion_status", "eligible")
    .not("short_description", "is", null)
    .order("name")
    .limit(1)
    .single();
  await page.getByLabel("Rechercher un SaaS").fill(product!.name);
  await expect(page.getByRole("article", { name: product!.name }).first()).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("link", { name: product!.name }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: product!.name })).toBeVisible();
  const sources = page.locator("#sources");
  await expect(sources).toContainText("Wikidata");
  await expect(sources.locator('a[href^="https://www.wikidata.org/wiki/Q"]').first()).toBeVisible();
  await expect(sources).toContainText("Déclaré");
});
