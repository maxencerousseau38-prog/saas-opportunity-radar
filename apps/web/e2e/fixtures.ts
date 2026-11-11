// Shared Playwright fixtures (S7.4b–c, PD-33): every journey fails on a
// Content Security Policy violation. This validated the Report-Only phase and
// now guards the enforced policy against regressions.
//
// Two channels (S8.1): blocked resources are logged to the console, but a
// blocked eval caught by page code (e.g. a library probing `new Function`) is
// only reported as a `securitypolicyviolation` event and a DevTools issue,
// never on the console, so the event is collected as well.
import { expect, test as base } from "@playwright/test";

export const test = base.extend<{ cspGuard: void }>({
  cspGuard: [
    async ({ page }, use) => {
      const violations: string[] = [];
      page.on("console", (message) => {
        const text = message.text();
        if (/Content Security Policy/i.test(text)) violations.push(text);
      });
      // The binding survives navigations; the listener is added to every document.
      await page.exposeBinding("__sorCspViolation", (_source, report: string) => {
        violations.push(report);
      });
      await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (event) => {
          const report = (window as unknown as { __sorCspViolation?: (r: string) => void })
            .__sorCspViolation;
          report?.(
            `securitypolicyviolation: ${event.effectiveDirective} blocked ${event.blockedURI || "(inline)"} ` +
              `in ${new URL(event.documentURI).pathname} (${event.sourceFile || "unknown source"}:${event.lineNumber})`,
          );
        });
      });
      await use();
      expect(violations, "Content Security Policy violations").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
