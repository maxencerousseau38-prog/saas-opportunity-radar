// Sprint 6 journey with the worker running (fake provider, labelled): start
// a discovery run and follow its progress (no network: Hacker News stays
// disabled and no site is fetched), then open the labelled demo run, inspect
// fit score, coverage and evidence confidence separately, open the cited
// evidence, accept an eligible candidate and see an excluded one rejected.
// Viewers read runs but cannot start one. Settings show the source registry.
import { expect, test } from "@playwright/test";
import { MEMBER, VIEWER, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

test("a member starts a discovery run and follows its progress; disabled sources are reported", async ({
  page,
}) => {
  const ws = await signIn(page, MEMBER);
  await page.goto(`/w/${ws}/ai-discovery`);
  await expect(page.getByTestId("simulated-note")).toBeVisible();
  const form = page.getByRole("form", { name: "Nouvelle recherche AI Discovery" });
  await form.getByLabel("Intitulé de la recherche").fill("SaaS B2B analytics");
  await form
    .getByLabel("Demande en langage naturel")
    .fill("Trouve des SaaS B2B américains dans l'analytics marketing");
  // No site fetch in E2E: the rebound reads real official sites.
  await form.getByLabel(/Rebond depuis les sites officiels/).uncheck();
  await form.getByRole("button", { name: "Lancer la recherche" }).click();

  await expect(page.getByRole("heading", { name: "SaaS B2B analytics" })).toBeVisible();
  await expect(page.getByText("Terminée", { exact: true })).toBeVisible({ timeout: 60_000 });
  await page.reload();
  const sources = page.getByRole("region", { name: "Sources explorées" });
  await expect(sources.getByRole("row", { name: /hacker_news/ })).toContainText("Non activée");
  await expect(page.getByText("Aucune piste trouvée")).toBeVisible();
  await expect(page.getByText("Aucun candidat")).toBeVisible();
  await expect(page.getByTestId("run-counts")).toContainText("Candidats trouvés");

  // Save the prompt and filters as a discovery saved search (PRD §6.4).
  page.once("dialog", (d) => void d.accept("Recherche analytics"));
  await page.getByRole("button", { name: "Enregistrer la recherche" }).click();
  await expect(page.getByText("Recherche enregistrée : Recherche analytics")).toBeVisible();
});

test("candidates show fit, coverage and confidence separately; an eligible one is added to Discover", async ({
  page,
}) => {
  const ws = await signIn(page, MEMBER);
  await page.goto(`/w/${ws}/ai-discovery`);
  await page.getByRole("link", { name: /Démo — recherche de découverte/ }).click();
  await page.waitForURL(/\/ai-discovery\/[0-9a-f-]+$/);

  const candidates = page.getByTestId("discovery-candidate");
  await expect(candidates).toHaveCount(2);
  const pixel = candidates.filter({ hasText: "Pixelpulse (démo)" });
  await expect(pixel.getByTestId("fit-score")).toContainText("75 / 100");
  await expect(pixel.getByTestId("fit-coverage")).toContainText("80 %");
  await expect(pixel.getByTestId("evidence-confidence")).toContainText("30 / 100");
  await expect(pixel.getByRole("link", { name: /^Source :/ })).toHaveAttribute(
    "href",
    "https://pixelpulse.test",
  );

  // The excluded candidate is rejected, never scored, never addable.
  const referly = candidates.filter({ hasText: "Referly Partners (démo)" });
  await expect(referly).toContainText("Exclusion permanente");
  await expect(referly.getByTestId("fit-score")).toContainText("Non calculable");
  await expect(referly.getByRole("button", { name: /Ajouter/ })).toHaveCount(0);

  await pixel.getByRole("button", { name: "Ajouter Pixelpulse (démo) au catalogue" }).click();
  await expect(pixel).toContainText("Accepté (ajouté à Discover)");
  await pixel.getByRole("link", { name: "Pixelpulse (démo)" }).click();
  await expect(page.getByRole("heading", { name: "Pixelpulse (démo)", level: 1 })).toBeVisible();
});

test("viewers read runs but cannot start one; settings list the source registry and quotas", async ({
  page,
}) => {
  const ws = await signIn(page, VIEWER);
  await page.goto(`/w/${ws}/ai-discovery`);
  await expect(page.getByRole("heading", { name: "Recherches" })).toBeVisible();
  await expect(page.getByRole("form", { name: "Nouvelle recherche AI Discovery" })).toHaveCount(0);
  const res = await page.request.post(`/api/v1/workspaces/${ws}/discovery-runs`, {
    headers: { "idempotency-key": "viewer-discovery-attempt-1" },
    data: { title: "x", prompt: "find saas" },
  });
  expect(res.status()).toBe(403);

  await page.goto(`/w/${ws}/settings`);
  const hn = page.getByRole("row", { name: /Hacker News/ });
  await expect(hn).toContainText("Métadonnées seules");
  await expect(hn).toContainText("Revue à terminer");

  // Job quotas (S7.2): the viewer sees the workspace usage and their own budget.
  const quotas = page.getByRole("table", { name: "Quotas de traitements" });
  await expect(quotas.getByRole("row", { name: /créés aujourd’hui/ })).toContainText("/ 200");
  await expect(quotas.getByRole("row", { name: /Mes demandes/ })).toContainText("0 / 30");
  await expect(quotas.getByRole("row", { name: /Coût IA aujourd’hui/ })).toContainText("$US");
  const usage = await page.request.get(`/api/v1/workspaces/${ws}/usage`);
  expect(usage.status()).toBe(200);
  const body = (await usage.json()) as { data: { max_concurrent_jobs: number } };
  expect(body.data.max_concurrent_jobs).toBe(3);
});
