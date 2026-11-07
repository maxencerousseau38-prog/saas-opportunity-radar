// Sprint 3 journeys with the worker running: CSV imports processed
// asynchronously with per-row results, and the enrichment status of a product.
import { expect, test } from "./fixtures";
import { MEMBER, VIEWER, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

test("a CSV product import is processed by the worker with per-row results", async ({ page }) => {
  const ws = await signIn(page, MEMBER);
  await page.goto(`/w/${ws}/settings`);
  const csv = [
    "name,website_url,company_name,country_code,employee_min,employee_max,category_slugs,source_url",
    "Csv Imported Tool,https://csv-imported-tool.test,Csv Co,FR,2,6,marketing-growth-seo,",
    "Broken Row,not-a-url,,,,,,",
  ].join("\n");
  await page.getByLabel("Contenu CSV des SaaS").fill(csv);
  await page.getByRole("button", { name: "Importer les SaaS" }).click();
  await expect(page.getByText("Import mis en file d’attente")).toBeVisible();
  const job = page.getByTestId("import-job").first();
  await expect(job).toContainText("Terminé partiellement", { timeout: 30_000 });
  await expect(job).toContainText("Créé : 1");
  await expect(job).toContainText("Rejeté : 1");
  await job.getByText("Lignes à corriger").click();
  await expect(job).toContainText("Ligne 3");

  await page.goto(`/w/${ws}/discover`);
  await page.getByLabel("Rechercher un SaaS").fill("Csv Imported");
  await expect(page.getByRole("article", { name: "Csv Imported Tool" })).toBeVisible();
});

test("a product shows its official-website enrichment status; viewers cannot start it", async ({
  page,
}) => {
  const ws = await signIn(page, MEMBER);
  await page.goto(`/w/${ws}/saas/metricflow`);
  const status = page.getByTestId("enrichment-status");
  await expect(status).toBeVisible();
  await status.getByRole("button", { name: "Enrichir depuis le site officiel" }).click();
  // The demo domain does not exist: the job ends partially, never with invented data.
  await expect(status).toContainText(
    /Terminé partiellement|Nouvelle tentative prévue|En cours|En file/,
    { timeout: 30_000 },
  );
  await expect(status).toContainText("Terminé partiellement", { timeout: 45_000 });

  await page.context().clearCookies();
  const viewerWs = await signIn(page, VIEWER);
  await page.goto(`/w/${viewerWs}/saas/metricflow`);
  await expect(page.getByTestId("enrichment-status").getByRole("button")).toHaveCount(0);
  const res = await page.request.post(
    `/api/v1/workspaces/${viewerWs}/products/00000000-0000-4000-8000-000000000000/enrichment`,
    {
      headers: { "idempotency-key": "viewer-attempt-0001" },
    },
  );
  expect(res.status()).toBe(403);
});
