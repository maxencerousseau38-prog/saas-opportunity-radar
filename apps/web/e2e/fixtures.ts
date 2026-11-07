// Shared Playwright fixtures (S7.4b, PD-33): every journey fails on a
// Content Security Policy violation. During the Report-Only phase the browser
// only reports violations (console), so this is what validates the policy
// before it is enforced (S7.4c).
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
