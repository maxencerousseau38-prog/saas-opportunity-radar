// Sprint 2 journeys on the demo fixtures (scripts/seed-demo.ts): browse,
// filter, profile, evidence, collections, favourites, saved searches,
// comparison, manual add, operator review and viewer restrictions.
import { expect, test } from "@playwright/test";
import { MEMBER, OWNER, VIEWER, signIn, waitForResults } from "./helpers";

test.describe.configure({ mode: "serial" });

test("browse Discover: only eligible products, three display modes", async ({ page }) => {
  await signIn(page, MEMBER);
  await waitForResults(page);
  await expect(page.getByTestId("result-count")).toHaveText("6 SaaS");
  await expect(page.getByRole("article", { name: "MetricFlow" })).toBeVisible();
  // Permanently excluded and under-review products never appear.
  await expect(page.getByText("AffiliTrack")).toHaveCount(0);
  await expect(page.getByText("Partnerly Hub")).toHaveCount(0);
  await expect(page.getByText("Donnée de démonstration").first()).toBeVisible();

  await page.getByRole("button", { name: "Grille" }).click();
  await expect(page.getByRole("article", { name: "Mailtide" })).toBeVisible();
  await page.getByRole("button", { name: "Liste" }).click();
  await expect(page.getByRole("link", { name: "Mailtide" })).toBeVisible();
  await page.getByRole("button", { name: "Feed" }).click();
});

test("combined filters with a count before applying, and chip removal", async ({ page }) => {
  await signIn(page, MEMBER);
  await waitForResults(page);
  await page.getByRole("button", { name: /^Filtres/ }).click();
  const panel = page.getByRole("dialog", { name: "Filtres" });
  await panel.getByLabel("B2B", { exact: true }).check();
  await panel.getByLabel("États-Unis").check();
  await expect(panel.getByRole("button", { name: "Afficher 2 résultats" })).toBeVisible();
  await panel.getByLabel("1-20 pers.").check();
  await expect(panel.getByRole("button", { name: "Afficher 2 résultats" })).toBeVisible();
  await panel.getByLabel("Outils très techniques (Developer Tools)").check();
  await expect(panel.getByRole("button", { name: "Afficher 1 résultat" })).toBeVisible();
  await panel.getByRole("button", { name: "Afficher 1 résultat" }).click();
  await waitForResults(page);
  await expect(page.getByTestId("result-count")).toHaveText("1 SaaS");
  await expect(page.getByRole("article", { name: "MetricFlow" })).toBeVisible();

  await page
    .getByRole("button", { name: "Retirer Exclure : Outils très techniques (Developer Tools)" })
    .click();
  await waitForResults(page);
  await expect(page.getByTestId("result-count")).toHaveText("2 SaaS");
  await expect(page.getByRole("article", { name: "LogLantern" })).toBeVisible();
});

test("unknown values are kept only when asked", async ({ page }) => {
  await signIn(page, MEMBER);
  await waitForResults(page);
  await page.getByRole("button", { name: /^Filtres/ }).click();
  const panel = page.getByRole("dialog", { name: "Filtres" });
  await panel.getByLabel("1-5 pers.").check();
  await expect(panel.getByRole("button", { name: "Afficher 1 résultat" })).toBeVisible();
  await panel.getByLabel("Inclure les effectifs inconnus").check();
  await expect(panel.getByRole("button", { name: "Afficher 3 résultats" })).toBeVisible();
});

test("French text search", async ({ page }) => {
  await signIn(page, MEMBER);
  await waitForResults(page);
  await page.getByLabel("Rechercher un SaaS").fill("artisans");
  await expect(page.getByTestId("result-count")).toHaveText("1 SaaS");
  await expect(page.getByRole("article", { name: "LeadNest" })).toBeVisible();
});

test("profile: sourced values, pricing, evidence and competitors", async ({ page }) => {
  await signIn(page, MEMBER);
  await waitForResults(page);
  await page.getByRole("link", { name: "MetricFlow" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "MetricFlow" })).toBeVisible();
  await expect(page.getByText("Clients payants vérifiés")).toBeVisible();

  const commercial = page.locator("#commercial");
  await expect(commercial.getByRole("cell", { name: "Starter" })).toBeVisible();
  await expect(commercial.getByText(/29,00\s\$US/)).toBeVisible();
  await expect(commercial.getByText("Une offre payante publiée ne prouve pas")).toBeVisible();

  // Unknown values are explicit, never blank.
  await expect(page.locator("#general").getByText("Inconnu").first()).toBeVisible();

  // Evidence links lead to the Sources section.
  await commercial.getByRole("link", { name: "source" }).first().click();
  await expect(page.locator("#sources")).toBeInViewport();
  await expect(page.locator("#sources").getByText("Page tarifs de MetricFlow")).toBeVisible();

  const competitors = page.locator("#competitors");
  await expect(competitors.getByRole("link", { name: "CampaignBoard" })).toBeVisible();
  await expect(competitors.getByText("AffiliTrack")).toHaveCount(0);
  await competitors.getByRole("button", { name: "Français" }).click();
  await expect(competitors.getByRole("link", { name: "LeadNest" })).toBeVisible();
});

test("favourite, collection with a note, saved search and duplicate", async ({ page }) => {
  await signIn(page, MEMBER);
  await waitForResults(page);
  const card = page.getByRole("article", { name: "Mailtide" });
  await card.getByRole("button", { name: "Ajouter Mailtide aux favoris" }).click();
  await expect(card.getByRole("button", { name: "Retirer Mailtide des favoris" })).toBeVisible();

  await card.getByRole("button", { name: "Actions pour Mailtide" }).click();
  await page.getByRole("menuitem", { name: "Ajouter à une collection…" }).click();
  const dialog = page.getByRole("dialog", { name: "Ajouter à une collection" });
  await dialog.getByLabel("Nom de la nouvelle collection").fill("Shortlist E2E");
  await dialog.getByRole("button", { name: "Créer et ajouter" }).click();
  await expect(card.getByText("Ajouté à la collection.")).toBeVisible();

  await page.getByLabel("Rechercher un SaaS").fill("email");
  await expect(page.getByTestId("result-count")).toHaveText("1 SaaS");
  await page.getByRole("button", { name: "Sauvegarder la recherche" }).click();
  await page.getByLabel("Nom", { exact: true }).fill("Email US");
  await page.getByRole("button", { name: "Sauvegarder", exact: true }).click();
  await expect(page.getByText("Recherche « Email US » sauvegardée.")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: "Saved" }).click();
  await expect(page.getByRole("heading", { name: "Saved", level: 1 })).toBeVisible();
  const collection = page.getByTestId("collection").filter({ hasText: "Shortlist E2E" });
  await expect(collection.getByRole("link", { name: "Mailtide" })).toBeVisible();
  await collection.getByLabel("Note sur Mailtide").fill("Concurrent à surveiller");
  await collection.getByRole("button", { name: "Enregistrer" }).click();
  await expect(collection.getByLabel("Note sur Mailtide")).toHaveValue("Concurrent à surveiller");

  const search = page.getByTestId("saved-search").filter({ hasText: "Email US" }).first();
  await search.getByRole("button", { name: "Dupliquer" }).click();
  await expect(page.getByRole("link", { name: "Email US (copie)" })).toBeVisible();

  await page.getByRole("link", { name: "Email US", exact: true }).click();
  await expect(page.getByText("Recherche sauvegardée : Email US")).toBeVisible();
  await expect(page.getByTestId("result-count")).toHaveText("1 SaaS");
});

test("simple comparison table", async ({ page }) => {
  const ws = await signIn(page, MEMBER);
  await page.goto(`/w/${ws}/saas/metricflow`);
  const competitors = page.locator("#competitors");
  await competitors.getByLabel("Comparer CampaignBoard").check();
  await competitors.getByRole("link", { name: /Comparer la sélection/ }).click();
  await expect(page.getByRole("heading", { name: "Comparaison" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "MetricFlow" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "CampaignBoard" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Prix d’entrée/ })).toContainText("€");
});

test("manual add: eligible product appears, affiliate product is excluded", async ({ page }) => {
  await signIn(page, MEMBER);
  await waitForResults(page);
  await page.getByRole("button", { name: "Ajouter un SaaS" }).click();
  let dialog = page.getByRole("dialog", { name: "Ajouter un SaaS manuellement" });
  await dialog.getByLabel("Nom du SaaS").fill("Invoicely Demo");
  await dialog.getByLabel("Site officiel").fill("https://www.invoicely-demo.test/?utm_source=e2e");
  await dialog
    .getByLabel("Description en une phrase (optionnel)")
    .fill("Facturation simple pour les indépendants");
  await dialog.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(dialog.getByText("Le SaaS est ajouté au catalogue")).toBeVisible();
  // Sprint 3: the new product is enriched from its official website by a job.
  await expect(dialog.getByTestId("enrichment-queued")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await waitForResults(page);
  await expect(page.getByTestId("result-count")).toHaveText("7 SaaS");
  await expect(page.getByRole("article", { name: "Invoicely Demo" })).toBeVisible();

  await page.getByRole("button", { name: "Ajouter un SaaS" }).click();
  dialog = page.getByRole("dialog", { name: "Ajouter un SaaS manuellement" });
  await dialog.getByLabel("Nom du SaaS").fill("Payout Partners");
  await dialog.getByLabel("Site officiel").fill("https://payout-partners.test");
  await dialog
    .getByLabel("Description en une phrase (optionnel)")
    .fill("Affiliate program management and partner payouts");
  await dialog.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(dialog.getByText("relève de l’exclusion permanente")).toBeVisible();
});

test("viewer: read-only workspace", async ({ page }) => {
  const ws = await signIn(page, VIEWER);
  await waitForResults(page);
  await expect(page.getByRole("button", { name: "Ajouter un SaaS" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ajouter MetricFlow aux favoris" })).toBeDisabled();
  const res = await page.request.patch(
    `/api/v1/workspaces/${ws}/products/00000000-0000-4000-8000-000000000000/state`,
    {
      data: { is_favorite: true },
    },
  );
  expect(res.status()).toBe(403);
});

test("operator resolves an exclusion review and a correction report", async ({ page }) => {
  const ws = await signIn(page, MEMBER);
  // A member reports an error on a product.
  await page.goto(`/w/${ws}/saas/leadnest`);
  await page.getByRole("button", { name: "Signaler", exact: true }).click();
  const report = page.getByRole("dialog", { name: "Signaler une erreur" });
  await report.getByLabel("Description").fill("Le pays du siège est faux");
  await report.getByRole("button", { name: "Envoyer" }).click();
  await expect(report.getByText("le signalement a été enregistré")).toBeVisible();

  // Non-operators get 404 on the console.
  const denied = await page.goto("/operator");
  expect(denied?.status()).toBe(404);

  await page.context().clearCookies();
  await signIn(page, OWNER);
  await page.goto("/operator");
  const review = page.getByTestId("exclusion-review").filter({ hasText: "Partnerly Hub" });
  await review
    .getByLabel("Motif pour Partnerly Hub")
    .fill("Partage de revenus avec des revendeurs : revu, cas limite accepté pour la démo");
  await review.getByRole("button", { name: "Rendre éligible" }).click();
  await expect(
    page.getByTestId("exclusion-review").filter({ hasText: "Partnerly Hub" }),
  ).toHaveCount(0);

  const open = page
    .getByTestId("correction-report")
    .filter({ hasText: "Le pays du siège est faux" });
  await open.getByRole("button", { name: "Accepter" }).click();
  await expect(
    page.getByTestId("correction-report").filter({ hasText: "Le pays du siège est faux" }),
  ).toHaveCount(0);

  await page.goto(`/w/${ws}/discover`);
  await waitForResults(page);
  await expect(page.getByRole("article", { name: "Partnerly Hub" })).toBeVisible();
});

test("settings: members are listed and the owner can invite an existing account", async ({
  page,
}) => {
  const ws = await signIn(page, OWNER);
  await page.goto(`/w/${ws}/settings`);
  await expect(page.getByTestId("member-row")).toHaveCount(3);
  await expect(page.getByRole("cell", { name: "demo-viewer@demo.test" })).toBeVisible();
  await page.getByLabel("Rôle de demo-viewer@demo.test").selectOption("member");
  await expect(page.getByText("Rôle mis à jour.")).toBeVisible();
  await page.getByLabel("Rôle de demo-viewer@demo.test").selectOption("viewer");
  await expect(page.getByLabel("Rôle de demo-viewer@demo.test")).toHaveValue("viewer");
});
