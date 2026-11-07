// CSP violation reports (S7.4b). Browsers post them without credentials;
// the endpoint is public, bounded and only logs a minimal, redacted line
// (directive, blocked origin, document path — never query strings).

export interface CspViolation {
  directive: string;
  blocked: string;
  document_path: string;
}

const MAX_BYTES = 8_192;

function originOf(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "unknown";
  if (/^(inline|eval|data|blob|self|wasm-eval|trusted-types-sink)$/.test(value)) return value;
  try {
    const u = new URL(value);
    return u.origin === "null" ? u.protocol.replace(":", "") : u.origin;
  } catch {
    return "invalid";
  }
}

function pathOf(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  try {
    return new URL(value).pathname.slice(0, 200);
  } catch {
    return "unknown";
  }
}

/** Parses a legacy `report-uri` body or a Reporting API batch; never throws. */
export function parseCspReport(text: string): CspViolation[] {
  if (text.length === 0 || text.length > MAX_BYTES) return [];
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return [];
  }
  const items: Array<Record<string, unknown>> = [];
  if (Array.isArray(body)) {
    for (const r of body.slice(0, 20))
      if (r && typeof r === "object" && (r as Record<string, unknown>).body)
        items.push((r as { body: Record<string, unknown> }).body);
  } else if (body && typeof body === "object" && (body as Record<string, unknown>)["csp-report"]) {
    items.push((body as { "csp-report": Record<string, unknown> })["csp-report"]);
  }
  return items.map((r) => ({
    directive: String(
      r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"] ?? "unknown",
    ).slice(0, 60),
    blocked: originOf(r["blocked-uri"] ?? r.blockedURL),
    document_path: pathOf(r["document-uri"] ?? r.documentURL),
  }));
}

/** At most `limit` logged reports per minute per process. */
export function rateLimiter(limit: number, now: () => number = Date.now) {
  let windowStart = now();
  let count = 0;
  return () => {
    const t = now();
    if (t - windowStart >= 60_000) {
      windowStart = t;
      count = 0;
    }
    count += 1;
    return count <= limit;
  };
}
