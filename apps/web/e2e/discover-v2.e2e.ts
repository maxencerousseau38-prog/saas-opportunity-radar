// S8.3 Discover V2 completion (ADR-016, ADR-017) on the labelled demo
// fixtures: an operator documents an Acquisition Channel from a cited source
// and retracts it; an authorised visual (SYNTHETIC test image, admitted
// through the audited RPC) appears with its type and source, is served
// privately, then removed; Feed/Grid/List, keyboard, mobile width and
// automated accessibility checks. Everything this file adds is removed or
// retracted at the end.
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { MEMBER, OWNER, VIEWER, operatorMfa, signIn, waitForResults } from "./helpers";

test.describe.configure({ mode: "serial" });

const admin = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SECRET_KEY ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/** Synthetic 1600×700 PNG header + padding: a test fixture, not a product visual. */
function syntheticPng(): string {
  const header = Buffer.from("89504e470d0a1a0a0000000d494844520000064000000002bc", "hex");
  return `\\x${Buffer.concat([header, Buffer.alloc(512, 7)]).toString("hex")}`;
}

async function ownerId(): Promise<string> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  const user = data.users.find((u) => u.email === OWNER);
  if (!user) throw new Error("demo owner missing");
  return user.id;
}

async function productId(slug: string): Promise<string> {
  const { data } = await admin.from("saas_products").select("id").eq("slug", slug).single();
  return data!.id as string;
}

async function axe(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    `accessibility violations on ${label}`,
  ).toEqual([]);
}

test("an operator documents an Acquisition Channel from a cited source, then retracts it", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signIn(page, OWNER);
  await operatorMfa(page);
  const form = page.getByRole("form", { name: "Documenter un canal" });
  await form.getByLabel("Slug du SaaS", { exact: true }).fill("leadnest");
  await form.locator('select[name="channel"]').selectOption("reddit");
  await form.locator('select[name="status"]').selectOption("declared");
  await form.locator('select[name="role"]').selectOption("primary");
  await form
    .getByLabel("URL de la source (https)", { exact: true })
    .fill("https://leadnest.test/blog/how-we-grew");
  await form
    .getByLabel("Extrait ou résumé autorisé de la source")
    .fill("We found our first 100 customers on Reddit (demo fixture)");
  // A primary role needs an excerpt that establishes it.
  await form
    .getByLabel("Extrait qui établit que le canal est principal")
    .fill("Reddit remains our main acquisition channel (demo fixture)");
  await form.getByLabel(/J’ai ouvert la source/).check();
  await form.getByLabel(/L’extrait est une citation directe/).check();
  await form.getByRole("button", { name: "Enregistrer le canal" }).click();
  await expect(page.getByText("Canal enregistré : Reddit (confiance 70%)")).toBeVisible();
  await axe(page, "operator console");

  // Discover: the card shows the channel, its status, role, source and confidence.
  await page.goto("/");
  await waitForResults(page);
  const card = page.getByRole("article", { name: "LeadNest" });
  const chip = card.getByTestId("acquisition-channel");
  await expect(chip).toContainText("Reddit");
  await expect(chip).toContainText("Déclaré");
  await expect(chip).toContainText("Principal · leadnest.test");
  await expect(chip).toContainText("confiance 70%");
  await expect(chip).toHaveAttribute("href", "https://leadnest.test/blog/how-we-grew");
  await expect(chip).toHaveAttribute("title", /Statut déclaré/);

  // Filter K: the channel and its status narrow the catalog, unknowns excluded.
  await page.getByRole("button", { name: /Filtres/ }).click();
  await page.getByRole("checkbox", { name: "Reddit" }).check();
  await page.getByRole("checkbox", { name: "Déclaré" }).check();
  await page.getByRole("button", { name: /^(Afficher \d+ résultats?|Appliquer)/ }).click();
  await expect(page.getByTestId("result-count")).toHaveText("1 SaaS");
  await expect(page.getByRole("article", { name: "LeadNest" })).toBeVisible();

  // Profile: full provenance, primacy excerpt and confidence reasons.
  await card.getByRole("link", { name: "LeadNest", exact: true }).click();
  const section = page.getByRole("region", { name: "Acquisition Channels" });
  await expect(section).toContainText("★ Canal principal : Reddit");
  await expect(section).toContainText("Principal selon la source");
  await expect(section).toContainText("chanconf-1");
  await axe(page, "profile");

  // Retraction: hidden from Discover at once, kept in history (session already AAL2).
  await page.goto("/operator");
  const row = page.getByTestId("channel-admin-row").filter({ hasText: "LeadNest" });
  await row.getByLabel(/Motif du retrait du canal reddit/).fill("Démonstration terminée");
  await row.getByRole("button", { name: "Retirer" }).click();
  await expect(page.getByTestId("channel-admin-row").filter({ hasText: "LeadNest" })).toHaveCount(
    0,
  );
  await page.goto("/");
  await waitForResults(page);
  await expect(
    page.getByRole("article", { name: "LeadNest" }).getByTestId("acquisition-channel"),
  ).toHaveCount(0);
  await expect(page.getByRole("article", { name: "LeadNest" })).toContainText(
    "Acquisition Channels : inconnus / non documentés",
  );
});

test("an authorised visual is shown with its type and source, served privately, then removed", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const operator = await ownerId();
  const mailtide = await productId("mailtide");
  // Rights gate: an asset without rights covering a private copy is refused.
  const refused = await admin.rpc("sor_admit_visual_asset", {
    p_operator: operator,
    p_product_id: mailtide,
    p_asset: { asset_type: "official_hero", covers_private_copy: false },
    p_content: syntheticPng(),
  });
  expect(refused.error?.code).toBe("22023");
  const admitted = await admin.rpc("sor_admit_visual_asset", {
    p_operator: operator,
    p_product_id: mailtide,
    p_asset: {
      asset_type: "official_hero",
      image_url: "https://mailtide.test/press/hero.png",
      page_url: "https://mailtide.test/press",
      alt_text: "Tableau de bord de Mailtide (image de test synthétique)",
      rights_basis: "Licence de démonstration : copie et stockage autorisés (fixture de test)",
      rights_evidence_url: "https://mailtide.test/press/licence",
      covers_private_copy: true,
      content_type: "image/png",
      width: 1600,
      height: 700,
      primary: true,
    },
    p_content: syntheticPng(),
  });
  expect(admitted.error).toBeNull();
  const assetId = (admitted.data as { asset_id: string }).asset_id;

  await signIn(page, VIEWER);
  await waitForResults(page);
  const preview = page
    .getByRole("article", { name: "Mailtide" })
    .getByTestId("product-visual-preview");
  await expect(preview.getByTestId("visual-asset-type")).toHaveText("Visuel officiel");
  await expect(preview.getByRole("link", { name: /Source du visuel/ })).toHaveAttribute(
    "href",
    // The page where the official visual was observed (its evidence).
    "https://mailtide.test/press",
  );
  await expect(preview.locator("img")).toHaveAttribute("src", `/api/v1/catalog/assets/${assetId}`);
  // The other cards keep the honest fallback.
  await expect(
    page.getByRole("article", { name: "MetricFlow" }).getByTestId("product-visual-preview"),
  ).toContainText("Aperçu authentique non disponible");

  // Private delivery: bytes for a signed-in member, never for anonymous requests.
  const served = await page.request.get(`/api/v1/catalog/assets/${assetId}`);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("image/png");
  expect(served.headers()["cache-control"]).toBe("private, max-age=600");
  const anonymous = await request.get(`/api/v1/catalog/assets/${assetId}`);
  expect(anonymous.status()).toBe(401);

  // Takedown: hidden at once, private copy deleted, delivery refused.
  await page.context().clearCookies();
  await signIn(page, OWNER);
  await operatorMfa(page);
  const row = page.getByTestId("visual-admin-row").filter({ hasText: "Mailtide" }).first();
  await row.getByLabel(/Motif du retrait du visuel de Mailtide/).fill("Fin de la démonstration");
  await row.getByRole("button", { name: "Retirer le visuel" }).click();
  await expect(
    page.getByTestId("visual-admin-row").filter({ hasText: "Mailtide" }).first(),
  ).toContainText("Retiré");
  expect((await page.request.get(`/api/v1/catalog/assets/${assetId}`)).status()).toBe(404);
  await page.goto("/");
  await waitForResults(page);
  await expect(
    page.getByRole("article", { name: "Mailtide" }).getByTestId("product-visual-preview"),
  ).toContainText("Aperçu authentique non disponible");
});

test("Feed, Grid and List keep the same actions, keyboard and mobile layout", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, MEMBER);
  await waitForResults(page);
  for (const mode of ["Feed", "Grille", "Liste"] as const) {
    const toggle = page.getByRole("button", { name: mode, exact: true });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("link", { name: "MetricFlow", exact: true }).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /(Ajouter MetricFlow aux|Retirer MetricFlow des) favoris/ }),
    ).toBeVisible();
    await axe(page, `Discover ${mode}`);
  }
  // Sorts: least_analyzed works on real workspace data; ai_potential stays unavailable.
  // The total does not depend on the sort (earlier journeys may have added products).
  const total = await page.getByTestId("result-count").textContent();
  await page.getByLabel("Trier").selectOption("least_analyzed");
  await waitForResults(page);
  await expect(page.getByTestId("result-count")).toHaveText(total ?? "");
  await expect(page.getByLabel("Trier").locator('option[value="ai_potential"]')).toBeDisabled();

  await page.getByRole("button", { name: "Feed", exact: true }).click();
  await page.setViewportSize({ width: 375, height: 800 });
  await waitForResults(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "no horizontal scroll at 375 px").toBeLessThanOrEqual(0);
});
