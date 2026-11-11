// URL and domain normalization (Implementation Blueprint §6.5; ADR-002).
import { getDomain } from "tldts";

const TRACKING_PARAMS = /^(utm_.+|gclid|fbclid|ref)$/i;

export interface NormalizedUrl {
  /** Canonical form used as identity key. */
  canonicalUrl: string;
  /** Lowercase ASCII host without `www.`. */
  host: string;
  /** Registrable domain from the Public Suffix List, or null (IP, unknown suffix). */
  registrableDomain: string | null;
}

export class InvalidUrlError extends Error {
  constructor() {
    super("Only absolute http(s) URLs can be normalized");
    this.name = "InvalidUrlError";
  }
}

/**
 * Lowercase host, strip `www.`, IDNA to ASCII (done by WHATWG URL), drop
 * default ports, credentials, fragments and tracking parameters, sort the
 * remaining query parameters and remove the trailing slash.
 */
export function normalizeUrl(input: string): NormalizedUrl {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new InvalidUrlError();
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new InvalidUrlError();
  if (!url.hostname) throw new InvalidUrlError();

  const host = url.hostname
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.$/, "");
  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.test(key))
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  const query = params.length
    ? `?${params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}`
    : "";
  const port = url.port ? `:${url.port}` : ""; // URL already drops default ports
  const path = url.pathname.replace(/\/+$/, "");

  return {
    canonicalUrl: `${url.protocol}//${host}${port}${path}${query}`,
    host,
    registrableDomain: getDomain(host, { allowPrivateDomains: true }) ?? null,
  };
}
