// Security headers and Content Security Policy (S7.4b; PD-33 Report-Only
// phase): every page carries the static headers and a per-request policy
// whose nonce is on the framework's scripts.
import { expect, test } from "./fixtures";
import { MEMBER, signIn } from "./helpers";

test("pages carry the security headers and a nonce-based policy", async ({ page }) => {
  const res = await page.goto("/login");
  const headers = res!.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  const csp = headers["content-security-policy-report-only"];
  expect(csp).toBeDefined();
  expect(csp).toContain("frame-ancestors 'none'");
  const nonce = /'nonce-([^']+)'/.exec(csp!)?.[1];
  expect(nonce).toBeTruthy();
  // Next.js puts the request nonce on its scripts.
  const scripts = await page
    .locator("script")
    .evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).nonce));
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.every((n) => n === nonce)).toBe(true);

  // A new response gets a new nonce.
  const again = await page.goto("/login");
  expect(again!.headers()["content-security-policy-report-only"]).not.toContain(nonce);
});

test("signed-in pages are covered by the policy too", async ({ page }) => {
  const ws = await signIn(page, MEMBER);
  const res = await page.goto(`/w/${ws}/settings`);
  expect(res!.headers()["content-security-policy-report-only"]).toContain(
    "script-src 'self' 'nonce-",
  );
  expect(res!.headers()["x-frame-options"]).toBe("DENY");
});

test("the CSP report endpoint accepts reports without a session", async ({ request }) => {
  const res = await request.post("/api/csp-report", {
    headers: { "content-type": "application/csp-report" },
    data: JSON.stringify({
      "csp-report": {
        "document-uri": "http://127.0.0.1:3100/login",
        "effective-directive": "img-src",
        "blocked-uri": "https://example.invalid/x.png",
      },
    }),
  });
  expect(res.status()).toBe(204);
});
