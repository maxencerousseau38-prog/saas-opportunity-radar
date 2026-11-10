import { expect, test } from "./fixtures";

test("signed-out visitors see the public read-only demo; workspaces stay protected", async ({
  page,
}) => {
  // Since 8 Nov 2026 the signed-out home page is the labelled public demo.
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByText("Démonstration publique · sans compte")).toBeVisible();
  // A workspace page without a session leads back to the public demo.
  await page.goto("/w/00000000-0000-4000-8000-000000000000/discover");
  await expect(page).toHaveURL(/\/$/);
  // The French login page offers account creation.
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { level: 1, name: "SaaS Opportunity Radar" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Créer un compte" })).toBeVisible();
});

test("the API answers 401 without a session", async ({ request }) => {
  const res = await request.get("/api/v1/me");
  expect(res.status()).toBe(401);
  const body = (await res.json()) as { error: { code: string; request_id: string } };
  expect(body.error.code).toBe("UNAUTHENTICATED");
  expect(body.error.request_id).toMatch(/^[0-9a-f-]{36}$/);
});

test("wrong credentials show one generic message", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill("nobody@demo.test");
  await page.getByLabel("Mot de passe").fill("wrong-password-123");
  await page.getByRole("button", { name: "Se connecter" }).click();
  // Next.js also renders an empty route-announcer alert: target ours by text.
  await expect(page.getByRole("alert").filter({ hasText: "Identifiants" })).toHaveText(
    "Identifiants incorrects.",
  );
});
