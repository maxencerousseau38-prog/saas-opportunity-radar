// PD-39: personal owner access by secret link. CI sets a random
// OWNER_ACCESS_TOKEN for a demo account; the journey checks that a wrong
// secret is refused, that the right one signs that account in without a
// password, and that the secret does not stay in the address bar.
import { expect, test } from "./fixtures";

const TOKEN = process.env.OWNER_ACCESS_TOKEN ?? "";

test.skip(!TOKEN, "OWNER_ACCESS_TOKEN is not set for this run");

test("a wrong secret is refused and leaves the visitor signed out", async ({ page }) => {
  await page.goto(`/auth/acces#${"x".repeat(48)}`);
  // Next.js renders its own empty role="alert" route announcer: filter on text.
  await expect(page.getByRole("alert").filter({ hasText: "Ce lien" })).toHaveText(
    "Ce lien d’accès n’est pas valide.",
  );
  expect(page.url()).not.toContain("#");
  // No session was created: the API, called with the browser's cookies, says 401.
  expect((await page.request.get("/api/v1/me")).status()).toBe(401);
});

test("a link without a secret says it is incomplete", async ({ page }) => {
  await page.goto("/auth/acces");
  await expect(page.getByRole("alert").filter({ hasText: "Ce lien" })).toHaveText(
    "Ce lien d’accès est incomplet.",
  );
});

test("the right secret opens the owner's workspace without a password", async ({ page }) => {
  await page.goto(`/auth/acces#${encodeURIComponent(TOKEN)}`);
  await page.waitForURL(/\/w\/[0-9a-f-]+\/discover/);
  expect(page.url()).not.toContain(TOKEN);
  await expect(page.getByTestId("result-count")).toBeVisible();
});
