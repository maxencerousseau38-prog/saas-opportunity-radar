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
