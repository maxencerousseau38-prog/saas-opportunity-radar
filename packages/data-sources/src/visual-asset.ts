// Fetching one admitted product visual (ADR-016, S8.3). Not a connector and
// not a source: the operator names the exact image of a product whose rights
// cover a private copy; this module only downloads it safely. Reuses the
// SSRF-safe fetcher (public addresses only, re-validated redirects, size and
// content-type limits, timeout) and obeys robots.txt of the image's origin.
import { failure, type ConnectorOutcome } from "./connector";
import { ALLOW_ALL, DISALLOW_ALL, isAllowed, parseRobots, type RobotsRules } from "./robots";
import { defaultPolicy, safeFetch, type SafeFetchPolicy } from "./safe-fetch";

const ROBOTS_TOKEN = "SaaSOpportunityRadar";

export const IMAGE_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export interface FetchedImage {
  finalUrl: string;
  contentType: string;
  bytes: Uint8Array;
}

export function imagePolicy(overrides: Partial<SafeFetchPolicy> = {}): SafeFetchPolicy {
  return defaultPolicy({
    allowedContentTypes: IMAGE_CONTENT_TYPES,
    maxBytes: IMAGE_MAX_BYTES,
    accept: IMAGE_CONTENT_TYPES.join(","),
    ...overrides,
  });
}

async function robotsFor(
  origin: string,
  policy: SafeFetchPolicy,
  signal: AbortSignal,
): Promise<RobotsRules> {
  // Same rules as the official-website connector (RFC 9309).
  const documentPolicy: SafeFetchPolicy = { ...policy };
  delete documentPolicy.accept;
  const res = await safeFetch(
    `${origin}/robots.txt`,
    {
      ...documentPolicy,
      allowedContentTypes: ["text/plain", "text/html", ""],
      maxBytes: 512 * 1024,
    },
    signal,
  );
  if (res.status === "ok") return parseRobots(res.data.body, ROBOTS_TOKEN);
  if (
    res.status === "unavailable" ||
    (res.status === "blocked" && /http_40[13]/.test(res.reason))
  ) {
    return ALLOW_ALL;
  }
  return DISALLOW_ALL; // policy failure, 5xx or network error: assume complete disallow
}

/**
 * Downloads one https image, obeying robots.txt; never follows to http.
 * `requireHttps` is false only in tests (loopback fixture server).
 */
export async function fetchVisualAsset(
  imageUrl: string,
  policy: SafeFetchPolicy,
  signal: AbortSignal,
  { requireHttps = true }: { requireHttps?: boolean } = {},
): Promise<ConnectorOutcome<FetchedImage>> {
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    return failure("blocked", "invalid_url", false);
  }
  if (requireHttps && url.protocol !== "https:") return failure("blocked", "https_required", false);
  const rules = await robotsFor(url.origin, policy, signal);
  if (!isAllowed(rules, `${url.pathname}${url.search}`))
    return failure("blocked", "robots_disallow", false);
  const res = await safeFetch(imageUrl, policy, signal);
  if (res.status !== "ok") return res;
  if (requireHttps && !res.data.finalUrl.startsWith("https://")) {
    return failure("blocked", "redirected_to_http", false);
  }
  return {
    status: "ok",
    data: { finalUrl: res.data.finalUrl, contentType: res.data.contentType, bytes: res.data.bytes },
  };
}
