// HTTP security headers (Sprint 7, S7.4b; security review finding M1).
// Pure functions: the proxy sets the per-request Content Security Policy with
// a nonce, next.config sets the static headers.
//
// CSP rollout (PD-33, 7 Nov 2026): Report-Only in S7.4b, validated by the
// E2E suite with no violation (CI run 66), enforced since S7.4c. Violations
// are still reported to /api/csp-report.

export interface CspOptions {
  nonce: string;
  /** Development server: React refresh needs eval and a websocket. */
  dev?: boolean;
  /** Served over HTTPS: upgrade any stray http subresource. */
  https?: boolean;
  /** Exact Supabase project origin, allowed for browser Auth recovery. */
  supabaseOrigin?: string;
  /** Where browsers send violation reports. */
  reportUri?: string;
}

export function buildCsp(o: CspOptions): string {
  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    // Next.js scripts carry the nonce; 'strict-dynamic' trusts what they load.
    [
      "script-src",
      ["'self'", `'nonce-${o.nonce}'`, "'strict-dynamic'", ...(o.dev ? ["'unsafe-eval'"] : [])],
    ],
    // React style attributes (e.g. logo placeholders) need inline styles.
    ["style-src", ["'self'", "'unsafe-inline'"]],
    // Product logos are external public images (no credentials, no referrer).
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    ["font-src", ["'self'", "data:"]],
    // Browser Auth calls are limited to this app and its configured Supabase project.
    [
      "connect-src",
      ["'self'", ...(o.supabaseOrigin ? [o.supabaseOrigin] : []), ...(o.dev ? ["ws:"] : [])],
    ],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    ["manifest-src", ["'self'"]],
    ["worker-src", ["'self'", "blob:"]],
  ];
  const parts = directives.map(([k, v]) => `${k} ${v.join(" ")}`);
  if (o.https) parts.push("upgrade-insecure-requests");
  if (o.reportUri) parts.push(`report-uri ${o.reportUri}`);
  return parts.join("; ");
}

/** Response header carrying the policy: enforced (S7.4c, PD-33). */
export const CSP_HEADER = "Content-Security-Policy";

/** A fresh 128-bit nonce per response (base64). */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** Static headers for every response (next.config `headers()`). */
export const STATIC_SECURITY_HEADERS: Array<{ key: string; value: string }> = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Ignored by browsers over plain HTTP (local and CI); effective on HTTPS hosts.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];
