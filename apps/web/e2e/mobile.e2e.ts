import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { MEMBER, signIn, waitForResults } from "./helpers";

// SOR is used daily from a phone (product-owner direction, 12 Nov 2026):
// iPhone-sized viewport, bottom tab bar, card tap to the profile, no sideways scroll.
test.use({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });

async function noHorizontalScroll(page: Page, where: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `no horizontal scroll on ${where}`).toBeLessThanOrEqual(0);
}

test("on a phone: feed, bottom navigation, card to profile and back", async ({ page }) => {
  await signIn(page, MEMBER);
  await waitForResults(page);

  const tabs = page.getByRole("navigation", { name: "Navigation mobile" });
  await expect(tabs).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeHidden();
  await expect(tabs.getByRole("link", { name: "Discover" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await noHorizontalScroll(page, "Discover");

  // A category chip narrows the feed in one tap.
  await page.getByRole("button", { name: "Marketing & Growth", exact: true }).click();
  await waitForResults(page);
  await expect(
    page.getByRole("button", { name: "Marketing & Growth", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Tout", exact: true }).click();
  await waitForResults(page);

  // Tapping the card opens the profile.
  await page
    .getByRole("article", { name: "MetricFlow" })
    .getByRole("link", { name: "MetricFlow", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "MetricFlow" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Site officiel/ })).toBeVisible();
  await noHorizontalScroll(page, "profile");
  await page.getByRole("link", { name: "Discover", exact: true }).first().click();
  await waitForResults(page);

  // Secondary destinations live in the "Plus" sheet.
  await tabs.getByRole("button", { name: "Plus" }).click();
  const sheet = page.getByRole("dialog", { name: "Plus" });
  await sheet.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await noHorizontalScroll(page, "Settings");

  await tabs.getByRole("link", { name: "Saved" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Saved" })).toBeVisible();
  await noHorizontalScroll(page, "Saved");
});
