// Server-only environment access. Importing this module from a client
// component fails the build ("server-only"), so secrets cannot reach the browser.
import "server-only";
import { parseWebServerEnv, type WebServerEnv } from "@sor/contracts/env";

let cached: WebServerEnv | undefined;

/** Validated server environment; throws EnvValidationError (names only, no values). */
export function getServerEnv(): WebServerEnv {
  cached ??= parseWebServerEnv(process.env);
  return cached;
}

/** Origin for links sent by email: SITE_URL, else (local / test) the request origin. */
export function siteUrl(request: Request): string {
  const configured = getServerEnv().SITE_URL;
  return (configured ?? new URL(request.url).origin).replace(/\/+$/, "");
}
