// Security headers and CSP (S7.4b).
import { describe, expect, it } from "vitest";
import { STATIC_SECURITY_HEADERS, buildCsp, newNonce } from "@/lib/security-headers";
import { parseCspReport, rateLimiter } from "@/lib/csp-report";

describe("buildCsp", () => {
  it("allows scripts only with the request nonce and blocks framing and plugins", () => {
    const csp = buildCsp({ nonce: "abc123", reportUri: "/api/csp-report" });
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("report-uri /api/csp-report");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("allows browser Auth only to the configured Supabase project origin", () => {
    const csp = buildCsp({
      nonce: "n",
      supabaseOrigin: "https://aowrwljrixpeawjmqgmj.supabase.co",
    });
    expect(csp).toContain("connect-src 'self' https://aowrwljrixpeawjmqgmj.supabase.co");
    expect(csp).not.toContain("https://other-project.supabase.co");
    expect(csp).not.toContain("https://*.supabase.co");
  });

  it("relaxes only what the development server needs, upgrades over HTTPS", () => {
    const dev = buildCsp({ nonce: "n", dev: true });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("connect-src 'self' ws:");
    expect(buildCsp({ nonce: "n", https: true })).toContain("upgrade-insecure-requests");
  });

  it("creates a fresh 128-bit nonce each time", () => {
    const a = newNonce();
    expect(Buffer.from(a, "base64")).toHaveLength(16);
    expect(newNonce()).not.toBe(a);
  });

  it("sets the static headers", () => {
    const keys = STATIC_SECURITY_HEADERS.map((h) => h.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Referrer-Policy",
        "Permissions-Policy",
        "Strict-Transport-Security",
      ]),
    );
  });
});

describe("parseCspReport", () => {
  it("keeps the directive, the blocked origin and the document path only", () => {
    const body = JSON.stringify({
      "csp-report": {
        "document-uri": "https://app.example/w/1/discover?q=secret",
        "violated-directive": "script-src-elem",
        "effective-directive": "script-src-elem",
        "blocked-uri": "https://evil.example/x.js?token=abc",
      },
    });
    expect(parseCspReport(body)).toEqual([
      {
        directive: "script-src-elem",
        blocked: "https://evil.example",
        document_path: "/w/1/discover",
      },
    ]);
  });

  it("reads Reporting API batches and ignores junk or oversized bodies", () => {
    const batch = JSON.stringify([
      {
        type: "csp-violation",
        body: { effectiveDirective: "img-src", blockedURL: "inline", documentURL: "https://a/b" },
      },
    ]);
    expect(parseCspReport(batch)).toEqual([
      { directive: "img-src", blocked: "inline", document_path: "/b" },
    ]);
    expect(parseCspReport("not json")).toEqual([]);
    expect(parseCspReport("x".repeat(9000))).toEqual([]);
  });
});

describe("rateLimiter", () => {
  it("allows a bounded number of reports per minute", () => {
    let t = 0;
    const allow = rateLimiter(2, () => t);
    expect([allow(), allow(), allow()]).toEqual([true, true, false]);
    t = 60_000;
    expect(allow()).toBe(true);
  });
});
