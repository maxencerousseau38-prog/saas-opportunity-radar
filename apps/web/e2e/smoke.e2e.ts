import { expect, test } from "@playwright/test";

test("home page renders the Sprint 0 shell in French", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "SaaS Opportunity Radar" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByText("Aucune donnée n’est encore disponible")).toBeVisible();
});
