// First bulk collection (10 Nov 2026): Discover on REAL catalog data. Runs
// only in the E2E job's "real catalog" step (REAL_CATALOG=1), after the main
// suite, once the collected Wikidata snapshot (data/catalog/wikidata) has been
// ingested into the local stack: the main journeys count the six labelled
// demo products and must run before.
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "./fixtures";
import { MEMBER, VIEWER, signIn, waitForResults } from "./helpers";

test.skip(process.env.REAL_CATALOG !== "1", "real catalog step only (REAL_CATALOG=1)");

const admin = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SECRET_KEY ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

test("Discover scrolls through real SaaS collected from Wikidata, with their source and licence", async ({
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
  test.info().annotations.push({
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
  await page.getByRole("link", { name: product!.name, exact: true }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: product!.name })).toBeVisible();
  const sources = page.locator("#sources");
  await expect(sources).toContainText("Wikidata");
  await expect(sources.locator('a[href^="https://www.wikidata.org/wiki/Q"]').first()).toBeVisible();
  await expect(sources).toContainText("Déclaré");
  // S8.2: the licence recorded with the collected listing is shown.
  await expect(
    sources.getByTestId("source-licence").filter({ hasText: "CC0-1.0" }).first(),
  ).toBeVisible();

  // S8.2: a product collected from Uneed carries the required attribution.
  const { data: uneedProduct } = await admin
    .from("saas_products")
    .select("name, slug, sources!inner(source_key)")
    .eq("sources.source_key", "uneed")
    .eq("record_status", "active")
    .eq("exclusion_status", "eligible")
    .order("name")
    .limit(1)
    .single();
  await page.goto(page.url().replace(/\/saas\/[^/?#]+.*$/, `/saas/${uneedProduct!.slug}`));
  await expect(page.getByRole("heading", { level: 1, name: uneedProduct!.name })).toBeVisible();
  await expect(
    page
      .locator("#sources")
      .getByTestId("source-licence")
      .filter({ hasText: "Source: Uneed, uneed.best" })
      .first(),
  ).toBeVisible();
});

// PD-41: the "Pour vous" feed is renewed at each opening (never-seen SaaS
// first, cards already shown later), stays the same within one session
// (reload, pagination) and leaves favourites alone.
test("Discover renews the feed at each opening without breaking pagination or favourites", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const firstNames = async (n: number) =>
    (
      await page
        .getByRole("article")
        .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""))
    ).slice(0, n);

  const workspaceId = await signIn(page, MEMBER);
  await waitForResults(page);
  await expect(page.getByLabel("Trier")).toHaveValue("discovery");
  const top = await firstNames(8);
  expect(top).toHaveLength(8);

  // Same session: a reload keeps the order.
  await page.reload();
  await waitForResults(page);
  expect(await firstNames(8)).toEqual(top);

  // Pagination: further pages load, no card twice.
  const cards = page.getByRole("article");
  const firstPage = await cards.count();
  await page.mouse.wheel(0, 20_000);
  await expect.poll(async () => cards.count(), { timeout: 30_000 }).toBeGreaterThan(firstPage);
  const all = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-product-id")));
  expect(new Set(all).size).toBe(all.length);

  // Favourites: unchanged by the feed; reverted at the end.
  await page.evaluate(() => window.scrollTo(0, 0));
  const first = cards.first();
  const name = (await first.getAttribute("aria-label")) ?? "";
  await first.getByRole("button", { name: `Ajouter ${name} aux favoris` }).click();
  await expect(first.getByRole("button", { name: `Retirer ${name} des favoris` })).toBeVisible();

  // The cards seen on screen are recorded for the workspace (batches every few seconds).
  await expect
    .poll(
      async () => {
        const { count } = await admin
          .from("workspace_feed_signals")
          .select("product_id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .gt("shown_count", 0);
        return count ?? 0;
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThanOrEqual(2);
  const { data: seen } = await admin
    .from("workspace_feed_signals")
    .select("product_id")
    .eq("workspace_id", workspaceId)
    .gt("shown_count", 0);
  const seenIds = new Set((seen ?? []).map((r) => r.product_id));

  // A new opening (new tab session): another selection, none of the cards already seen.
  const context = await browser.newContext();
  const next = await context.newPage();
  await signIn(next, MEMBER);
  await waitForResults(next);
  const nextIds = await next
    .getByRole("article")
    .evaluateAll((els) => els.slice(0, 12).map((e) => e.getAttribute("data-product-id") ?? ""));
  expect(nextIds).toHaveLength(12);
  expect(nextIds.filter((id) => seenIds.has(id))).toEqual([]);
  // The favourite is still there in the new session.
  await next.getByLabel("Rechercher un SaaS").fill(name);
  await waitForResults(next);
  await expect(
    next
      .getByRole("article", { name })
      .first()
      .getByRole("button", { name: `Retirer ${name} des favoris` }),
  ).toBeVisible({ timeout: 15_000 });
  await next
    .getByRole("article", { name })
    .first()
    .getByRole("button", { name: `Retirer ${name} des favoris` })
    .click();
  await expect(
    next
      .getByRole("article", { name })
      .first()
      .getByRole("button", { name: `Ajouter ${name} aux favoris` }),
  ).toBeVisible();
  await context.close();
});
