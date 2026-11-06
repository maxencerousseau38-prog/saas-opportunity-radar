// Controlled discovery rebound (PD-28, approved 6 Nov 2026; docs/DATA_SOURCES.md
// "Discovery rebound — controls"). From an already catalogued product's own
// site, read a few allow-listed pages (integrations, alternatives,
// comparisons) and keep links to other products' sites as LEADS only. A
// lead becomes a candidate only once its own official site has been fetched
// and cited (D3). Depth 1: a lead is never used as a seed in the same run.
import type { SourceDocument } from "@sor/contracts/evidence";
import { SHARED_HOST_DOMAINS, normalizeUrl } from "@sor/domain";

/** Same-site paths worth reading for the rebound (control 2). */
export const REBOUND_PATH_ALLOWLIST =
  /(^|\/)(integrations?|apps|app-directory|marketplace|alternatives?|compare|comparisons?|versus)(\/|$|-)|-vs-|\/vs(\/|-|$)/i;

/**
 * Pages never read: affiliate/partner program pages (permanently excluded
 * theme) and account pages.
 */
const REBOUND_PATH_DENYLIST =
  /(affiliate|partner|referral|login|signin|sign-in|signup|account|careers|jobs)/i;

/**
 * Hosts that are never product leads (control 3): shared hosts of the
 * identity resolver, plus social networks, stores, review platforms that are
 * not approved sources, and web infrastructure.
 */
export const REBOUND_EXCLUDED_DOMAINS: readonly string[] = [
  ...SHARED_HOST_DOMAINS,
  "instagram.com",
  "tiktok.com",
  "pinterest.com",
  "reddit.com",
  "discord.com",
  "discord.gg",
  "t.me",
  "whatsapp.com",
  "g2.com",
  "capterra.com",
  "trustpilot.com",
  "alternativeto.net",
  "wikipedia.org",
  "stackoverflow.com",
  "npmjs.com",
  "cloudflare.com",
  "gstatic.com",
  "googleapis.com",
  "googletagmanager.com",
  "doubleclick.net",
  "gravatar.com",
  "w3.org",
  "schema.org",
  "ycombinator.com",
];

export interface ReboundControls {
  /** Allow-listed pages read per seed (control 2). */
  pagesPerSeed: number;
  /** External leads kept per seed (control 3). */
  leadsPerSeed: number;
}

export const DEFAULT_REBOUND_CONTROLS: ReboundControls = { pagesPerSeed: 3, leadsPerSeed: 20 };

const linksOf = (doc: SourceDocument, key: "links" | "external_links"): string[] =>
  Array.isArray(doc.metadata[key])
    ? (doc.metadata[key] as unknown[]).filter((l): l is string => typeof l === "string")
    : [];

/** Allow-listed same-site pages of a seed's home page (control 2). */
export function selectReboundPages(home: SourceDocument, controls: ReboundControls): string[] {
  const seen = new Set<string>([home.canonical_url]);
  const picked: string[] = [];
  for (const link of linksOf(home, "links")) {
    let path: string;
    let canonical: string;
    try {
      path = new URL(link).pathname.toLowerCase();
      canonical = normalizeUrl(link).canonicalUrl;
    } catch {
      continue;
    }
    if (!REBOUND_PATH_ALLOWLIST.test(path) || REBOUND_PATH_DENYLIST.test(path)) continue;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    picked.push(link);
    if (picked.length >= controls.pagesPerSeed) break;
  }
  return picked;
}

export interface ReboundLead {
  /** Root of the linked site: the lead's presumed official site, to be verified. */
  leadUrl: string;
  registrableDomain: string;
  /** The seed page that mentions the lead (provenance). */
  sourcePageUrl: string;
}

export function isExcludedReboundDomain(domain: string): boolean {
  return REBOUND_EXCLUDED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * External links of an allow-listed seed page, as leads (control 3): other
 * registrable domains only, excluded hosts dropped, one lead per domain,
 * capped per seed.
 */
export function extractReboundLeads(
  page: SourceDocument,
  seedDomain: string,
  controls: ReboundControls,
  already: ReadonlySet<string> = new Set(),
): ReboundLead[] {
  const leads: ReboundLead[] = [];
  const seen = new Set(already);
  for (const link of linksOf(page, "external_links")) {
    let domain: string | null;
    try {
      domain = normalizeUrl(link).registrableDomain;
    } catch {
      continue;
    }
    if (!domain || domain === seedDomain || seen.has(domain) || isExcludedReboundDomain(domain))
      continue;
    seen.add(domain);
    leads.push({
      leadUrl: `https://${domain}/`,
      registrableDomain: domain,
      sourcePageUrl: page.canonical_url,
    });
    if (leads.length >= controls.leadsPerSeed) break;
  }
  return leads;
}
