// Sprint 5 journey with the worker running (fake provider, labelled): an
// opportunity analysis started from a SaaS profile and from a Pain Point
// Cluster; score, band, WTP, confidence, coverage and verdict shown
// separately; cited evidence opened from the score table; incomplete evidence
// gives VALIDATE FIRST; Markdown export. Viewers cannot start analyses.
import { expect, test } from "@playwright/test";
import { MEMBER, VIEWER, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

test("an analysis keeps score elements separate, cites evidence and is VALIDATE FIRST without complete evidence", async ({
  page,
}) => {
  const ws = await signIn(page, MEMBER);

  // Customer feedback for the customer voice (the analysis runs P1–P7 for its scope).
  await page.goto(`/w/${ws}/settings`);
  const csv = [
    "product_slug,source_url,source_name,published_at,rating,rating_scale_max,text,author_reference,author_company",
    "metricflow,https://reviews.test/oa1,Survey,2026-09-10T00:00:00Z,2,5,The PDF report export is slow on big dashboards.,eve@example.com,Shop E",
    "metricflow,https://reviews.test/oa2,Survey,2026-09-11T00:00:00Z,2,5,PDF report export is slow for our team.,fay@example.com,",
    "leadnest,https://reviews.test/oa3,Survey,2026-09-12T00:00:00Z,1,5,Our PDF report export is so slow.,gus@example.com,Shop G",
  ].join("\n");
  await page.getByLabel("Contenu CSV des avis").fill(csv);
  await page.getByLabel("Conservation du texte").selectOption("excerpt");
  await page.getByText("Je suis autorisé à conserver une référence").click();
  await page
    .getByLabel("Base juridique de l’utilisation")
    .fill("Export de notre propre enquête clients");
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

  // "Analyze Opportunity" on the SaaS profile (PRD §7.2).
  await page.goto(`/w/${ws}/saas/metricflow`);
  await page.getByRole("button", { name: "Analyze Opportunity" }).click();
  const form = page.getByRole("form", { name: "Lancer une analyse d’opportunité" });
  await expect(form.getByLabel("Pays ciblé (code ISO)")).toHaveValue("FR");
  await form.getByRole("button", { name: "Lancer l’analyse" }).click();

  await expect(page.getByRole("heading", { name: "MetricFlow", level: 1 })).toBeVisible();
  await expect(page.getByText("Terminée", { exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("simulated-banner")).toBeVisible();

  // Score, band, WTP, confidence, coverage and verdict are separate (§9.7).
  await expect(page.getByTestId("score")).toContainText("Provisoire");
  await expect(page.getByTestId("score")).not.toContainText("/ 100");
  await expect(page.getByTestId("band")).toContainText("Score incomplet");
  await expect(page.getByTestId("wtp")).toBeVisible();
  await expect(page.getByTestId("confidence")).toContainText(/\d+ \((faible|moyenne|élevée)\)/);
  await expect(page.getByTestId("coverage")).toContainText("%");
  await expect(page.getByTestId("verdict")).toContainText("VALIDATE FIRST");
  await expect(page.getByText("Couverture incomplète : score final impossible")).toBeVisible();

  // Open cited evidence from the score table.
  const cited = page.getByRole("link", { name: /\[preuve / }).first();
  const anchor = await cited.getAttribute("href");
  expect(anchor).toMatch(/^#ev-/);
  await cited.click();
  const entry = page.locator(anchor as string);
  await expect(entry).toBeVisible();
  await expect(entry.getByRole("link", { name: /^Source/ })).toBeVisible();

  // The excluded competitor is never analysed, only counted.
  await expect(page.getByText(/produit\(s\) exclu\(s\) ou non visible\(s\) omis/)).toBeVisible();
  await expect(page.getByText("AffiliTrack")).toHaveCount(0);

  // Markdown export.
  await page.getByRole("button", { name: "Exporter en Markdown" }).click();
  await expect(page.getByRole("link", { name: /\.md$/ })).toBeVisible({ timeout: 30_000 });

  // A Pain Point Cluster as subject.
  await page
    .getByRole("link", { name: /PDF report/i })
    .first()
    .click();
  await page.getByRole("button", { name: "Analyser l’opportunité de ce problème" }).click();
  await page
    .getByRole("form", { name: "Lancer une analyse d’opportunité" })
    .getByRole("button", { name: "Lancer l’analyse" })
    .click();
  await expect(page.getByText("Cluster de problèmes", { exact: false })).toBeVisible();
  await expect(page.getByText("Terminée", { exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("verdict")).toContainText(/VALIDATE FIRST|REJECT/);
});

test("viewers read analyses but cannot start one", async ({ page }) => {
  const ws = await signIn(page, VIEWER);
  await page.goto(`/w/${ws}/opportunities`);
  await expect(page.getByRole("heading", { name: "Analyses d’opportunité" })).toBeVisible();
  await expect(page.getByRole("form", { name: "Nouvelle analyse d’opportunité" })).toHaveCount(0);
  await page.goto(`/w/${ws}/saas/metricflow`);
  await expect(page.getByRole("button", { name: "Analyze Opportunity" })).toHaveCount(0);
  const res = await page.request.post(`/api/v1/workspaces/${ws}/analyses`, {
    headers: { "idempotency-key": "viewer-analysis-attempt-1" },
    data: { subject: { type: "product", product_id: "00000000-0000-4000-8000-000000000000" } },
  });
  expect(res.status()).toBe(403);
});
