import { expect, test } from "@playwright/test";

test("signed-out visitors are sent to the French login page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(
    page.getByRole("heading", { level: 1, name: "SaaS Opportunity Radar" }),
  ).toBeVisible();
  await expect(page.getByText("l’inscription publique est désactivée")).toBeVisible();
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
  await expect(page.getByRole("alert")).toHaveText("Identifiants incorrects.");
});
