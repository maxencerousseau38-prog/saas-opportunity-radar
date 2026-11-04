import { expect, type Page } from "@playwright/test";

export const PASSWORD = process.env.SEED_PASSWORD ?? "";
export const OWNER = "demo-owner@demo.test";
export const MEMBER = "demo-member@demo.test";
export const VIEWER = "demo-viewer@demo.test";

export async function signIn(page: Page, email: string): Promise<string> {
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/w\/[0-9a-f-]+\/discover/);
  const match = /\/w\/([0-9a-f-]+)\//.exec(page.url());
  expect(match).not.toBeNull();
  return match?.[1] ?? "";
}

export async function waitForResults(page: Page) {
  await expect(page.getByTestId("result-count")).not.toHaveText("…");
  await expect(page.getByRole("status").filter({ hasText: "Chargement" })).toHaveCount(0);
}
