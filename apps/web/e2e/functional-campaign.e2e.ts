// Functional campaign on the real catalog (REAL_CATALOG=1, after
// `catalog:ingest`): each workspace feature is exercised through the UI on
// real collected products, then checked again after a reload and in the
// database (service client, test only). AI steps use the fake provider: their
// output is simulated and must be labelled as such.
import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { MEMBER, OWNER, operatorMfa, signIn, waitForResults } from "./helpers";

test.skip(process.env.REAL_CATALOG !== "1", "real catalog step only (REAL_CATALOG=1)");

type Row = Record<string, unknown>;
const admin = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SECRET_KEY ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const run = Date.now().toString(36);

async function productBySlug(slug: string): Promise<{ id: string; name: string }> {
  const { data, error } = await admin
    .from("saas_products")
    .select("id, name")
    .eq("slug", slug)
    .single();
  if (error || !data) throw new Error(`product ${slug}: ${error?.message ?? "missing"}`);
  return data as { id: string; name: string };
}

async function stateOf(ws: string, productId: string): Promise<Row | null> {
  const { data } = await admin
    .from("workspace_product_states")
    .select("status, is_favorite, is_hidden, personal_notes")
    .eq("workspace_id", ws)
    .eq("product_id", productId)
    .maybeSingle();
  return (data as Row | null) ?? null;
}

/** Types in Discover's search box and waits for the (debounced) search of that text. */
async function searchDiscover(page: Page, text: string) {
  const searched = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      r.url().endsWith("/products/search") &&
      (r.request().postData() ?? "").includes(JSON.stringify(text)),
  );
  await page.getByLabel("Rechercher un SaaS").fill(text);
  await searched;
  await waitForResults(page);
}

async function apiSearch(page: Page, ws: string, text: string, includeHidden = false) {
  const res = await page.request.post(`/api/v1/workspaces/${ws}/products/search`, {
    data: { filters: { text, include_hidden: includeHidden }, sort: "relevance", limit: 30 },
  });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { data: Array<{ id: string; name: string }> }).data;
}

/** Latest product_enrichment job of a product in a workspace (null when never enriched). */
async function latestEnrichmentJob(ws: string, productId: string) {
  const { data, error } = await admin
    .from("job_executions")
    .select("id, state, terminal_reason, last_error_code, result, payload")
    .eq("job_kind", "product_enrichment")
    .eq("workspace_id", ws)
    .eq("payload->>product_id", productId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`enrichment jobs: ${error.message}`);
  return data?.[0] ?? null;
}

const TERMINAL_JOB_STATES = ["completed", "partial", "failed", "dead_letter", "cancelled"];

test("1. enrichment from the official website of a real product", async ({ page }) => {
  test.setTimeout(150_000);
  const ws = await signIn(page, MEMBER);
  const product = await productBySlug("plausible-analytics");
  await page.goto(`/w/${ws}/saas/plausible-analytics`);
  const status = page.getByTestId("enrichment-status");

  // The product may already carry the result of an earlier run (re-runs): its
  // label would satisfy a text check at once. Follow the job started by this
  // click, identified by its id, instead of the text on screen.
  const previous = await latestEnrichmentJob(ws, product.id);
  await status.getByRole("button", { name: "Enrichir depuis le site officiel" }).click();
  await expect
    .poll(async () => (await latestEnrichmentJob(ws, product.id))?.id, {
      message: "a new enrichment job is created by the click",
      timeout: 20_000,
    })
    .not.toBe(previous?.id);

  await expect
    .poll(async () => (await latestEnrichmentJob(ws, product.id))?.state, {
      message: "the new enrichment job reaches a terminal state",
      timeout: 120_000,
      intervals: [1_000, 2_000, 3_000],
    })
    .toMatch(new RegExp(`^(${TERMINAL_JOB_STATES.join("|")})$`));

  const job = await latestEnrichmentJob(ws, product.id);
  process.stdout.write(`enrichment job: ${JSON.stringify(job)}\n`);
  expect(job?.id).not.toBe(previous?.id);
  expect(["completed", "partial", "failed", "dead_letter"]).toContain(job?.state);

  // The status survives a reload and no longer shows a running job.
  await page.reload();
  const after = page.getByTestId("enrichment-status");
  await expect(after).toContainText(/Terminé|Échec|Abandonné/);
  await expect(
    after.getByRole("button", { name: "Enrichir depuis le site officiel" }),
  ).toBeEnabled();
});

test("2. favourite and collection on a real product persist", async ({ page }) => {
  const ws = await signIn(page, MEMBER);
  const trello = await productBySlug("trello");
  await waitForResults(page);
  await searchDiscover(page, "Trello");
  const card = page.getByRole("article", { name: "Trello", exact: true });
  const unfav = card.getByRole("button", { name: "Retirer Trello des favoris" });
  const fav = card.getByRole("button", { name: "Ajouter Trello aux favoris" });
  await expect(fav.or(unfav)).toBeVisible();
  if (await unfav.isVisible()) await unfav.click(); // re-runs start from a known state
  await fav.click();
  await expect(unfav).toBeVisible();

  const name = `Campagne ${run}`;
  await card.getByRole("button", { name: "Actions pour Trello" }).click();
  await page.getByRole("menuitem", { name: "Ajouter à une collection…" }).click();
  const dialog = page.getByRole("dialog", { name: "Ajouter à une collection" });
  await dialog.getByLabel("Nom de la nouvelle collection").fill(name);
  await dialog.getByRole("button", { name: "Créer et ajouter" }).click();
  await expect(card.getByText("Ajouté à la collection.")).toBeVisible();

  await page.reload();
  await waitForResults(page);
  await searchDiscover(page, "Trello");
  await expect(
    page
      .getByRole("article", { name: "Trello", exact: true })
      .getByRole("button", { name: "Retirer Trello des favoris" }),
  ).toBeVisible();
  expect((await stateOf(ws, trello.id))?.is_favorite).toBe(true);

  const { data: col } = await admin
    .from("collections")
    .select("id, collection_items(product_id, notes)")
    .eq("workspace_id", ws)
    .eq("name", name)
    .single();
  const items = (col?.collection_items ?? []) as Array<{ product_id: string }>;
  expect(items.map((i) => i.product_id)).toEqual([trello.id]);

  await page.getByRole("link", { name: "Saved" }).click();
  await expect(page.getByRole("heading", { name: "Saved", level: 1 })).toBeVisible();
  const collection = page.getByTestId("collection").filter({ hasText: name });
  await collection.getByLabel("Note sur Trello").fill("Note de campagne locale");
  await collection.getByRole("button", { name: "Enregistrer" }).click();
  await expect(collection.getByLabel("Note sur Trello")).toHaveValue("Note de campagne locale");
  await page.reload();
  await expect(
    page.getByTestId("collection").filter({ hasText: name }).getByLabel("Note sur Trello"),
  ).toHaveValue("Note de campagne locale");
  const { data: item } = await admin
    .from("collection_items")
    .select("notes")
    .eq("collection_id", col!.id as string)
    .single();
  expect(item?.notes).toBe("Note de campagne locale");
});

test("3. status, notes and hiding on a real product persist", async ({ page }) => {
  const ws = await signIn(page, MEMBER);
  const slack = await productBySlug("slack");
  await page.goto(`/w/${ws}/saas/slack`);
  const panel = page.getByRole("complementary", { name: "Mon espace de travail" });
  await panel.getByLabel("Statut").selectOption("to_research");
  await expect(panel.getByText("Enregistré.")).toBeVisible();
  const note = `Note locale ${run}`;
  await panel.getByLabel("Notes").fill(note);
  await panel.getByRole("button", { name: "Enregistrer la note" }).click();
  await expect(panel.getByRole("button", { name: "Enregistrer la note" })).toBeDisabled();
  const hide = panel.getByRole("button", { name: "Masquer", exact: true });
  if (await hide.isVisible()) await hide.click();
  await expect(panel.getByRole("button", { name: "Ne plus masquer" })).toBeVisible();

  await page.reload();
  const after = page.getByRole("complementary", { name: "Mon espace de travail" });
  await expect(after.getByLabel("Statut")).toHaveValue("to_research");
  await expect(after.getByLabel("Notes")).toHaveValue(note);
  await expect(after.getByRole("button", { name: "Ne plus masquer" })).toBeVisible();
  expect(await stateOf(ws, slack.id)).toEqual({
    status: "to_research",
    is_favorite: expect.any(Boolean),
    is_hidden: true,
    personal_notes: note,
  });

  // Hidden: absent from Discover and from the API search unless asked.
  expect((await apiSearch(page, ws, "Slack")).map((p) => p.id)).not.toContain(slack.id);
  expect((await apiSearch(page, ws, "Slack", true)).map((p) => p.id)).toContain(slack.id);
  await page.goto(`/w/${ws}/discover`);
  await waitForResults(page);
  await searchDiscover(page, "Slack");
  await expect(page.getByRole("article", { name: "Slack", exact: true })).toHaveCount(0);

  // Unhide: visible again.
  await page.goto(`/w/${ws}/saas/slack`);
  await page
    .getByRole("complementary", { name: "Mon espace de travail" })
    .getByRole("button", { name: "Ne plus masquer" })
    .click();
  await expect(page.getByRole("button", { name: "Masquer", exact: true })).toBeVisible();
  expect((await stateOf(ws, slack.id))?.is_hidden).toBe(false);
  expect((await apiSearch(page, ws, "Slack")).map((p) => p.id)).toContain(slack.id);
});

test("4. a saved search persists and reopens with the same results", async ({ page }) => {
  const ws = await signIn(page, MEMBER);
  await waitForResults(page);
  const total = (await page.getByTestId("result-count").textContent())?.trim() ?? "";
  await searchDiscover(page, "analytics");
  // The text applies after a short debounce: wait for the filtered count.
  await expect(page.getByTestId("result-count")).not.toHaveText(total);
  await waitForResults(page);
  const count = (await page.getByTestId("result-count").textContent())?.trim() ?? "";
  expect(count).toMatch(/^\d+ SaaS$/);
  expect(Number(count.split(" ")[0])).toBeGreaterThan(1);

  const name = `Analytics ${run}`;
  await page.getByRole("button", { name: "Sauvegarder la recherche" }).click();
  await page.getByLabel("Nom", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Sauvegarder", exact: true }).click();
  await expect(page.getByText(`Recherche « ${name} » sauvegardée.`)).toBeVisible();
  await page.keyboard.press("Escape");

  const { data: saved } = await admin
    .from("saved_searches")
    .select("kind, search_text, filters")
    .eq("workspace_id", ws)
    .eq("name", name)
    .single();
  expect(saved?.search_text ?? (saved?.filters as Row | null)?.text).toBe("analytics");

  await page.goto(`/w/${ws}/saved`);
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByText(`Recherche sauvegardée : ${name}`)).toBeVisible();
  await waitForResults(page);
  await expect(page.getByTestId("result-count")).toHaveText(count);
});

test("5. manual add: new product, existing real product, excluded product", async ({ page }) => {
  const ws = await signIn(page, MEMBER);
  await waitForResults(page);
  const name = `Campagne Facturation ${run}`;
  const site = `https://facturation-${run}.test/`;
  await page.getByRole("button", { name: "Ajouter un SaaS" }).click();
  let dialog = page.getByRole("dialog", { name: "Ajouter un SaaS manuellement" });
  await dialog.getByLabel("Nom du SaaS").fill(name);
  await dialog.getByLabel("Site officiel").fill(`${site}?utm_source=campagne`);
  await dialog
    .getByLabel("Description en une phrase (optionnel)")
    .fill("Facturation pour indépendants (donnée de test)");
  await dialog.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(dialog.getByText("Le SaaS est ajouté au catalogue")).toBeVisible();
  await page.keyboard.press("Escape");

  const { data: created } = await admin
    .from("saas_products")
    .select("id, website_url, record_status, exclusion_status")
    .eq("name", name)
    .single();
  expect(created).toMatchObject({ record_status: "active", exclusion_status: "eligible" });
  expect(created?.website_url).not.toContain("utm_source");
  await page.reload();
  await waitForResults(page);
  await searchDiscover(page, name);
  await expect(page.getByRole("article", { name })).toBeVisible();

  // The official site of an existing real product is not added twice.
  const { count: before } = await admin
    .from("saas_products")
    .select("id", { count: "exact", head: true })
    .ilike("website_url", "%trello.com%");
  await page.getByRole("button", { name: "Ajouter un SaaS" }).click();
  dialog = page.getByRole("dialog", { name: "Ajouter un SaaS manuellement" });
  await dialog.getByLabel("Nom du SaaS").fill("Trello");
  await dialog.getByLabel("Site officiel").fill("https://trello.com/");
  await dialog.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(dialog.getByText("Ce SaaS est déjà connu du catalogue.")).toBeVisible();
  // Never told that it was added again.
  await expect(dialog.getByText(/ajouté au catalogue/)).toHaveCount(0);
  const { count: after } = await admin
    .from("saas_products")
    .select("id", { count: "exact", head: true })
    .ilike("website_url", "%trello.com%");
  expect(after).toBe(before);
  await page.keyboard.press("Escape");

  // Permanent exclusion.
  await page.getByRole("button", { name: "Ajouter un SaaS" }).click();
  dialog = page.getByRole("dialog", { name: "Ajouter un SaaS manuellement" });
  await dialog.getByLabel("Nom du SaaS").fill(`Payout Partners ${run}`);
  await dialog.getByLabel("Site officiel").fill(`https://payout-${run}.test`);
  await dialog
    .getByLabel("Description en une phrase (optionnel)")
    .fill("Affiliate program management and partner payouts");
  await dialog.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(dialog.getByText("relève de l’exclusion permanente")).toBeVisible();
  expect((await apiSearch(page, ws, `Payout Partners ${run}`)).map((p) => p.name)).not.toContain(
    `Payout Partners ${run}`,
  );
});

test("6. Ask AI: dossier on a real product, imported answer stays unverified", async ({ page }) => {
  const ws = await signIn(page, MEMBER);
  const product = await productBySlug("plausible-analytics");
  const { data: rowBefore } = await admin
    .from("saas_products")
    .select("*")
    .eq("id", product.id)
    .single();
  await page.goto(`/w/${ws}/saas/plausible-analytics`);
  await page.locator('main a[href*="/ask-ai?products="]').first().click();
  await expect(page.getByText("Plausible Analytics · 1 SaaS")).toBeVisible();
  await page.getByLabel("Assistant externe").selectOption("chatgpt");
  await page.getByLabel("Stratégie de recherche").selectOption("better_alternative");
  await page.getByRole("button", { name: "Générer et enregistrer le prompt" }).click();
  await expect(page).toHaveURL(/\/ask-ai\?session=/);
  const sessionId = new URL(page.url()).searchParams.get("session") ?? "";

  const { data: session } = await admin
    .from("external_research_sessions")
    .select("status, prompt_text, destination, strategy")
    .eq("id", sessionId)
    .single();
  expect(session).toMatchObject({ destination: "chatgpt", strategy: "better_alternative" });
  expect(session?.prompt_text).toContain("Plausible Analytics");

  await page.getByLabel("Réponse de l’assistant").fill("Réponse de test, sans source primaire.");
  await page.getByRole("button", { name: "Importer et enregistrer la réponse" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Réponse importée · non vérifiée" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("Réponse importée · non vérifiée").first()).toBeVisible();
  const { data: imported } = await admin
    .from("external_research_sessions")
    .select("status, answer_text")
    .eq("id", sessionId)
    .single();
  expect(imported).toEqual({
    status: "response_imported",
    answer_text: "Réponse de test, sans source primaire.",
  });
  // The catalog is never updated by an imported answer.
  const { data: rowAfter } = await admin
    .from("saas_products")
    .select("*")
    .eq("id", product.id)
    .single();
  expect(rowAfter).toEqual(rowBefore);
});

test("7. AI Discovery run is recorded and labelled simulated", async ({ page }) => {
  test.setTimeout(120_000);
  const ws = await signIn(page, MEMBER);
  await page.goto(`/w/${ws}/ai-discovery`);
  await expect(page.getByTestId("simulated-note")).toBeVisible();
  const title = `Découverte ${run}`;
  const form = page.getByRole("form", { name: "Nouvelle recherche AI Discovery" });
  await form.getByLabel("Intitulé de la recherche").fill(title);
  await form
    .getByLabel("Demande en langage naturel")
    .fill("Trouve des SaaS B2B de prise de rendez-vous pour petites équipes");
  await form.getByRole("button", { name: "Lancer la recherche" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText(/^(Terminée|Terminée partiellement|Échec)$/)).toBeVisible({
    timeout: 100_000,
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const { data: dr } = await admin
    .from("discovery_runs")
    .select("status, terminal_reason, leads_found, candidates_found, sources_report, limitations")
    .eq("workspace_id", ws)
    .eq("title", title)
    .single();
  process.stdout.write(`discovery run: ${JSON.stringify(dr)}\n`);
  expect(["completed", "partial"]).toContain(dr?.status);
});

test("8. opportunity analyses (product and product set) and Markdown report", async ({ page }) => {
  test.setTimeout(240_000);
  const ws = await signIn(page, MEMBER);
  const product = await productBySlug("plausible-analytics");
  await page.goto(`/w/${ws}/saas/plausible-analytics`);
  await page.getByRole("button", { name: "Analyze Opportunity" }).click();
  await page
    .getByRole("form", { name: "Lancer une analyse d’opportunité" })
    .getByRole("button", { name: "Lancer l’analyse" })
    .click();
  await expect(page.getByRole("heading", { name: "Plausible Analytics", level: 1 })).toBeVisible();
  await expect(page.getByText("Terminée", { exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("simulated-banner")).toBeVisible();
  await expect(page.getByTestId("verdict")).toContainText(/VALIDATE FIRST|REJECT/);
  const analysisId = page.url().split("/").pop() ?? "";
  const { data: an } = await admin
    .from("opportunity_analyses")
    .select("status, subject_type, subject_product_id, verdict, score_total, score_coverage")
    .eq("id", analysisId)
    .single();
  process.stdout.write(`product analysis: ${JSON.stringify(an)}\n`);
  expect(an).toMatchObject({
    status: "completed",
    subject_type: "product",
    subject_product_id: product.id,
  });
  expect(an?.score_total).toBeNull(); // no complete score without full evidence

  await page.getByRole("button", { name: "Exporter en Markdown" }).click();
  await expect(page.getByRole("link", { name: /\.md$/ })).toBeVisible({ timeout: 30_000 });
  const { data: exp } = await admin
    .from("report_exports")
    .select("format, content")
    .eq("analysis_id", analysisId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  expect(exp?.format).toBe("markdown");
  expect(String(exp?.content)).toContain("Plausible Analytics");
  expect(String(exp?.content)).toMatch(/simul/i);

  // Product set chosen through the catalog search of the form.
  await page.goto(`/w/${ws}/opportunities`);
  const form = page.getByRole("form", { name: "Nouvelle analyse d’opportunité" });
  for (const name of ["Trello", "Slack"]) {
    await form.getByLabel("Rechercher un SaaS du catalogue").fill(name);
    await form.getByRole("button", { name: "Rechercher", exact: true }).click();
    await form.getByLabel(name, { exact: true }).check();
  }
  await form.getByRole("button", { name: "Lancer l’analyse" }).click();
  await page.waitForURL(/\/opportunities\/analyses\/[0-9a-f-]+$/);
  await expect(page.getByText("Terminée", { exact: true })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId("simulated-banner")).toBeVisible();
  const setId = page.url().split("/").pop() ?? "";
  const { data: setAn } = await admin
    .from("opportunity_analyses")
    .select("status, subject_type")
    .eq("id", setId)
    .single();
  expect(setAn).toEqual({ status: "completed", subject_type: "product_set" });
});

test("9. comparison of real products from Saved", async ({ page }) => {
  const ws = await signIn(page, MEMBER);
  const [trello, plausible] = await Promise.all([
    productBySlug("trello"),
    productBySlug("plausible-analytics"),
  ]);
  for (const p of [trello, plausible]) {
    const res = await page.request.patch(`/api/v1/workspaces/${ws}/products/${p.id}/state`, {
      data: { is_favorite: true },
    });
    expect(res.ok()).toBe(true);
  }
  await page.goto(`/w/${ws}/saved`);
  await page.getByLabel("Comparer Trello").first().check();
  await page.getByLabel("Comparer Plausible Analytics").first().check();
  await page.getByRole("link", { name: "Comparer la sélection (2)" }).click();
  await expect(page.getByRole("heading", { name: "Comparaison" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Trello" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Plausible Analytics" })).toBeVisible();
  // Unknown values stay explicitly unknown (never invented).
  await expect(page.getByRole("row", { name: /Prix d’entrée/ })).toBeVisible();
  const rows = (await page.getByRole("row").allTextContents()).slice(0, 8).join(" | ");
  process.stdout.write(`comparison rows: ${rows}\n`);
});

test("10. the operator resolves collected listings sent to review (S8.2)", async ({ page }) => {
  // Listings the ingestion rules did not import alone are kept in the queue.
  const { count: open } = await admin
    .from("catalog_listing_reviews")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");
  expect(open ?? 0).toBeGreaterThan(0);

  await signIn(page, OWNER); // the demo owner is the platform operator
  await operatorMfa(page);
  const section = page.getByRole("region", { name: /Annonces de catalogue à revoir/ });
  await expect(section).toContainText(`(${open})`);

  // Reject one listing, with a note.
  const card = section.getByTestId("catalog-review").first();
  const name = (await card.locator("p.font-medium").textContent())?.split(" ")[0] ?? "";
  const external = (await card.locator("p.font-medium span").textContent())?.split(" · ")[1] ?? "";
  await card.getByLabel(/^Note pour /).fill("Revue de campagne : rejet");
  await card.getByRole("button", { name: "Rejeter" }).click();
  await expect(section).toContainText(`(${(open ?? 0) - 1})`);
  const { data: rejected } = await admin
    .from("catalog_listing_reviews")
    .select("status, resolution_note, resolved_at")
    .eq("external_id", external)
    .single();
  expect(rejected).toMatchObject({
    status: "rejected",
    resolution_note: "Revue de campagne : rejet",
  });
  process.stdout.write(`rejected review: ${name} (${external})\n`);

  // Attach a listing that has a candidate product, when the queue holds one.
  const attachable = section.getByTestId("catalog-review").filter({
    has: page.getByRole("button", { name: /^Rattacher à / }),
  });
  if ((await attachable.count()) > 0) {
    const target = attachable.first();
    const ext = (await target.locator("p.font-medium span").textContent())?.split(" · ")[1] ?? "";
    await target
      .getByRole("button", { name: /^Rattacher à / })
      .first()
      .click();
    await expect(section).toContainText(`(${(open ?? 0) - 2})`);
    const { data: attached } = await admin
      .from("catalog_listing_reviews")
      .select("status, resolved_product_id")
      .eq("external_id", ext)
      .single();
    expect(attached?.status).toBe("attached");
    const { count: evidence } = await admin
      .from("evidence_items")
      .select("id", { count: "exact", head: true })
      .eq("product_id", attached!.resolved_product_id as string);
    expect(evidence ?? 0).toBeGreaterThan(0);
  }

  const { count: audited } = await admin
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("action", "catalog.listing_review_resolution");
  expect(audited ?? 0).toBeGreaterThan(0);
});
