// Shared Playwright fixtures (S7.4b–c, PD-33): every journey fails on a
// Content Security Policy violation (the browser logs blocked resources to
// the console). This validated the Report-Only phase and now guards the
// enforced policy against regressions.
import { expect, test as base } from "@playwright/test";

export const test = base.extend<{ cspGuard: void }>({
  cspGuard: [
    async ({ page }, use) => {
      const violations: string[] = [];
      page.on("console", (message) => {
        const text = message.text();
        if (/Content Security Policy/i.test(text)) violations.push(text);
      });
      await use();
      expect(violations, "Content Security Policy violations").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
