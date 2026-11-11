// Content Security Policy violation reports (S7.4b, PD-33). Public by nature:
// browsers send reports without credentials. Bounded body, minimal redacted
// log line, rate-limited per process, always 204.
import { parseCspReport, rateLimiter } from "@/lib/csp-report";

const allow = rateLimiter(100);

export async function POST(request: Request): Promise<Response> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length <= 8_192) {
    const violations = parseCspReport(await request.text());
    for (const v of violations) {
      if (!allow()) break;
      console.warn(JSON.stringify({ level: "warn", msg: "csp violation", ...v }));
    }
  }
  return new Response(null, { status: 204 });
}
