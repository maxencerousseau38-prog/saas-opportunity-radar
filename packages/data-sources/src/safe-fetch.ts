// Safe fetcher (Implementation Blueprint §5.2): SSRF defences, DNS pinning,
// manual redirect re-validation, size/time/content-type limits, no cookies.
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { failure, type ConnectorOutcome } from "./connector";
import { isPublicAddress } from "./ip-policy";

export const DEFAULT_USER_AGENT = "SaaSOpportunityRadar/0.1 (evidence research; obeys robots.txt)";
export const DEFAULT_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "application/json",
];

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface SafeFetchPolicy {
  maxBytes: number;
  timeoutMs: number;
  maxRedirects: number;
  userAgent: string;
  allowedContentTypes: string[];
  resolve: (hostname: string) => Promise<ResolvedAddress[]>;
  /** Address policy. Production code never overrides it; tests may. */
  isAddressAllowed: (address: string) => boolean;
}

export interface FetchedResource {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  redirects: number;
}

export async function systemResolve(hostname: string): Promise<ResolvedAddress[]> {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
}

export function defaultPolicy(overrides: Partial<SafeFetchPolicy> = {}): SafeFetchPolicy {
  return {
    maxBytes: 5 * 1024 * 1024,
    timeoutMs: 15_000,
    maxRedirects: 5,
    userAgent: DEFAULT_USER_AGENT,
    allowedContentTypes: DEFAULT_CONTENT_TYPES,
    resolve: systemResolve,
    isAddressAllowed: isPublicAddress,
    ...overrides,
  };
}

/** Step 1: http(s) only, no credentials, a host name. */
export function checkUrl(raw: string): URL | string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "invalid_url";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "scheme_not_allowed";
  if (url.username || url.password) return "credentials_in_url";
  if (!url.hostname) return "missing_host";
  return url;
}

interface RawResponse {
  status: number;
  location: string | null;
  contentType: string;
  body: string;
  retryAfterMs?: number;
}

function requestOnce(
  url: URL,
  pinned: ResolvedAddress,
  policy: SafeFetchPolicy,
  signal: AbortSignal,
): Promise<RawResponse | { error: "too_large" | "content_type"; contentType?: string }> {
  // Step 3: connect to the validated address; Host header and TLS SNI keep the name.
  const lookup: LookupFunction = (_hostname, options, callback) => {
    const cb = callback as (err: Error | null, address: unknown, family?: number) => void;
    if ((options as { all?: boolean }).all)
      cb(null, [{ address: pinned.address, family: pinned.family }]);
    else cb(null, pinned.address, pinned.family);
  };
  const options: RequestOptions & { servername?: string } = {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || undefined,
    path: `${url.pathname}${url.search}`,
    method: "GET",
    headers: {
      "user-agent": policy.userAgent,
      accept: "text/html,application/xhtml+xml,text/plain;q=0.9,application/json;q=0.8",
      "accept-encoding": "identity",
    },
    lookup,
    agent: false,
    signal,
    timeout: policy.timeoutMs,
  };
  if (url.protocol === "https:") options.servername = url.hostname;
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      options,
      (res: IncomingMessage) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
        const retryAfter = Number(res.headers["retry-after"]);
        if (status >= 300 && status < 400) {
          res.resume();
          resolve({ status, location, contentType, body: "" });
          return;
        }
        const declared = Number(res.headers["content-length"]);
        if (Number.isFinite(declared) && declared > policy.maxBytes) {
          res.destroy();
          resolve({ error: "too_large" });
          return;
        }
        if (
          status >= 200 &&
          status < 300 &&
          !policy.allowedContentTypes.some((t) => contentType.startsWith(t))
        ) {
          res.destroy();
          resolve({ error: "content_type", contentType });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > policy.maxBytes) {
            res.destroy();
            resolve({ error: "too_large" });
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            status,
            location,
            contentType,
            body: Buffer.concat(chunks).toString("utf8"),
            ...(Number.isFinite(retryAfter) ? { retryAfterMs: retryAfter * 1000 } : {}),
          }),
        );
        res.on("error", reject);
      },
    );
    req.on("timeout", () =>
      req.destroy(Object.assign(new Error("timeout"), { name: "TimeoutError" })),
    );
    req.on("error", reject);
    req.end();
  });
}

/**
 * Fetches an untrusted URL. Returns `blocked` for every policy rejection,
 * never throws for network conditions.
 */
export async function safeFetch(
  rawUrl: string,
  policy: SafeFetchPolicy,
  signal: AbortSignal,
): Promise<ConnectorOutcome<FetchedResource>> {
  let current = rawUrl;
  for (let hop = 0; hop <= policy.maxRedirects; hop++) {
    const checked = checkUrl(current);
    if (typeof checked === "string") return failure("blocked", checked, false);
    // Step 2: every resolved address must be public (no mixed answers).
    let addresses: ResolvedAddress[];
    try {
      addresses = await policy.resolve(checked.hostname.replace(/^\[|\]$/g, ""));
    } catch (err) {
      // A name that does not exist will not exist on retry; other DNS errors may be transient.
      const code = (err as { code?: string }).code;
      return code === "ENOTFOUND" || code === "ENODATA"
        ? failure("unavailable", "dns_name_not_found", false)
        : failure("unavailable", "dns_resolution_failed", true);
    }
    if (addresses.length === 0) return failure("unavailable", "dns_no_address", true);
    if (addresses.some((a) => !policy.isAddressAllowed(a.address))) {
      return failure("blocked", "address_not_public", false);
    }
    let response: Awaited<ReturnType<typeof requestOnce>>;
    try {
      response = await requestOnce(checked, addresses[0] as ResolvedAddress, policy, signal);
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (signal.aborted) return failure("error", "aborted", false);
      return failure("error", name === "TimeoutError" ? "timeout" : "network_error", true);
    }
    if ("error" in response) {
      return response.error === "too_large"
        ? failure("blocked", "response_too_large", false)
        : failure(
            "blocked",
            `content_type_not_allowed:${response.contentType ?? ""}`.slice(0, 120),
            false,
          );
    }
    if (response.status >= 300 && response.status < 400) {
      if (!response.location) return failure("error", "redirect_without_location", false);
      // Step 4: re-validate every hop.
      current = new URL(response.location, checked).toString();
      continue;
    }
    if (response.status === 429)
      return failure("rate_limited", "http_429", true, response.retryAfterMs);
    if (response.status === 408 || response.status >= 500) {
      return failure("error", `http_${response.status}`, true);
    }
    if (response.status === 404 || response.status === 410)
      return failure("unavailable", `http_${response.status}`, false);
    if (response.status === 401 || response.status === 403)
      return failure("blocked", `http_${response.status}`, false);
    if (response.status < 200 || response.status >= 300)
      return failure("error", `http_${response.status}`, false);
    return {
      status: "ok",
      data: {
        requestedUrl: rawUrl,
        finalUrl: checked.toString(),
        status: response.status,
        contentType: response.contentType,
        body: response.body,
        redirects: hop,
      },
    };
  }
  return failure("blocked", "too_many_redirects", false);
}
