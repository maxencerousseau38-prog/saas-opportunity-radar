// Security headers and Content Security Policy (S7.4b–c; PD-33, enforced):
// every page carries the static headers and a per-request policy whose nonce
// is on the framework's scripts; an injected script without it is blocked.
import { test as unguarded } from "@playwright/test";
import { expect, test } from "./fixtures";
import { MEMBER, signIn } from "./helpers";

test("pages carry the security headers and a nonce-based policy", async ({ page }) => {
  const res = await page.goto("/login");
  const headers = res!.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  const csp = headers["content-security-policy"];
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

  expect(headers["content-security-policy-report-only"]).toBeUndefined();

  // A new response gets a new nonce.
  const again = await page.goto("/login");
  expect(again!.headers()["content-security-policy"]).not.toContain(nonce);
});

test("signed-in pages are covered by the policy too", async ({ page }) => {
  const ws = await signIn(page, MEMBER);
  const res = await page.goto(`/w/${ws}/settings`);
  expect(res!.headers()["content-security-policy"]).toContain("script-src 'self' 'nonce-");
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

// Deliberate violation: not covered by the fixture that fails on violations.
unguarded("the enforced policy blocks an injected inline script", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
  });
  await page.goto("/login");
  const ran = await page.evaluate(async () => {
    const w = window as unknown as { __cspProbe?: boolean };
    w.__cspProbe = false;
    const s = document.createElement("script");
    s.textContent = "window.__cspProbe = true";
    document.body.appendChild(s);
    await new Promise((r) => setTimeout(r, 100));
    return w.__cspProbe;
  });
  expect(ran).toBe(false);
  expect(violations.join(" ")).toContain("script-src");
});
