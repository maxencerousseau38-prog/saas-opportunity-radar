// Sprint 4 journey with the worker running (fake provider, labelled): CSV
// feedback import → pain point run over two competitors → cluster with
// separate volume / authors / companies, evidence, correction → generated
// hypothesis with its own status. Viewers cannot start runs.
import { expect, test } from "./fixtures";
import { MEMBER, VIEWER, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

test("a pain point run clusters complaints across competitors and keeps them evidence-linked", async ({
  page,
}) => {
  const ws = await signIn(page, MEMBER);
  await page.goto(`/w/${ws}/settings`);
  const csv = [
    "product_slug,source_url,source_name,published_at,rating,rating_scale_max,text,author_reference,author_company",
    "metricflow,https://reviews.test/pp1,Survey,2026-09-01T00:00:00Z,2,5,The CSV export times out on big accounts.,ann@example.com,Shop A",
    "metricflow,https://reviews.test/pp2,Survey,2026-09-03T00:00:00Z,2,5,CSV export keeps timing out for us.,bob@example.com,",
    "leadnest,https://reviews.test/pp3,Survey,2026-09-05T00:00:00Z,1,5,Our CSV export times out every time.,cat@example.com,Shop C",
  ].join("\n");
  await page.getByLabel("Contenu CSV des avis").fill(csv);
  await page.getByLabel("Conservation du texte").selectOption("excerpt");
  await page.getByText("Je suis autorisé à conserver une référence").click();
  await page
    .getByLabel("Base juridique de l’utilisation")
    .fill("Export de notre propre enquête clients");
  // Wait for this import job itself: an earlier job of the serial suite may
  // already read "Terminé partiellement", and a run started before the import
  // completes would analyse no feedback.
  const queued = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" && r.url().endsWith(`/workspaces/${ws}/imports/feedback`),
  );
  await page.getByRole("button", { name: "Importer les avis" }).click();
  const { data: job } = (await (await queued).json()) as { data: { status_url: string } };
  await expect
    .poll(
      async () =>
        ((await (await page.request.get(job.status_url)).json()) as { data: { state: string } })
          .data.state,
      { timeout: 30_000 },
    )
    .toBe("completed");

  await page.goto(`/w/${ws}/opportunities`);
  const form = page.getByRole("form", { name: "Nouvelle analyse de problèmes" });
  await form.getByLabel("Titre").fill("Exports chez les concurrents");
  await form.getByLabel("MetricFlow").check();
  await form.getByLabel("LeadNest").check();
  await form.getByRole("button", { name: "Lancer l’analyse" }).click();

  await expect(page.getByRole("heading", { name: "Exports chez les concurrents" })).toBeVisible();
  await expect(page.getByText("Terminée", { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("L’échantillon d’avis n’est pas représentatif")).toBeVisible();

  const cluster = page.getByRole("link", { name: /CSV export/i }).first();
  await expect(cluster).toBeVisible();
  await cluster.click();
  // Raw volume, distinct authors and distinct companies are shown separately
  // (first match: the header of the opened cluster; other clusters of the run
  // — e.g. from the opportunity-analysis journey — may show the same counts).
  await expect(
    page.getByText(/3 retour\(s\) · auteurs distincts : 3 \(vérifié\)/).first(),
  ).toBeVisible();
  await expect(
    page.getByText(/entreprises distinctes : 2 \(estimation basse\)/).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Des plaintes ne prouvent pas que des clients paieraient"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Source : Survey/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Confirmer le cluster" }).click();
  await expect(page.getByText("Confirmé", { exact: true })).toBeVisible();

  await page.goto(`/w/${ws}/opportunities`);
  const hypothesis = page.getByRole("link", { name: /^Address:/ }).first();
  await expect(hypothesis).toBeVisible();
  await hypothesis.click();
  // Opportunities lists several hypotheses: wait for the hypothesis page itself.
  await page.waitForURL(/\/opportunities\/generated\//);
  await expect(page.getByText("Hypothèse non notée")).toBeVisible();
  await page.getByLabel("Statut").selectOption("to_research");
  await expect(page.getByLabel("Statut")).toHaveValue("to_research");
});

test("viewers can read pain point results but cannot start a run", async ({ page }) => {
  const ws = await signIn(page, VIEWER);
  await page.goto(`/w/${ws}/opportunities`);
  await expect(page.getByRole("heading", { name: "Problèmes clients récurrents" })).toBeVisible();
  await expect(page.getByRole("form", { name: "Nouvelle analyse de problèmes" })).toHaveCount(0);
  const res = await page.request.post(`/api/v1/workspaces/${ws}/pain-point-runs`, {
    headers: { "idempotency-key": "viewer-pain-attempt-1" },
    data: {
      title: "x",
      scope: { type: "product", product_id: "00000000-0000-4000-8000-000000000000" },
    },
  });
  expect(res.status()).toBe(403);
});
