// Agent D4 — Identity Resolver (deterministic, Implementation Blueprint §6.5; ADR-002).
import { normalizeUrl } from "../normalization";

/** Shared-host registrable domains: a match on them never identifies a product. */
export const SHARED_HOST_DOMAINS: readonly string[] = [
  "apple.com",
  "google.com",
  "microsoft.com",
  "shopify.com",
  "wordpress.com",
  "wordpress.org",
  "wix.com",
  "wixsite.com",
  "squarespace.com",
  "webflow.io",
  "github.com",
  "github.io",
  "gitlab.com",
  "gitlab.io",
  "bitbucket.org",
  "vercel.app",
  "netlify.app",
  "herokuapp.com",
  "notion.site",
  "medium.com",
  "substack.com",
  "producthunt.com",
  "chrome.google.com",
  "atlassian.com",
  "salesforce.com",
  "hubspot.com",
  "zapier.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "youtube.com",
];

export interface IdentityCandidate {
  name: string;
  officialUrl: string | null;
  description: string | null;
  sourceKey: string;
  externalId: string | null;
}

/** Facts the caller looked up in `entity_identifiers` / the catalog for this candidate. */
export interface IdentityLookup {
  productByCanonicalUrl: string | null;
  productByExternalId: string | null;
  /** Products whose active `domain` identifier equals the registrable domain. */
  productsByDomain: string[];
  /** Company whose website registrable domain equals the candidate's. */
  companyByDomain: string | null;
  /** Visible-or-not products with a similar name (case/accents-insensitive). */
  similarNameProducts: Array<{ id: string; name: string }>;
}

export type IdentityDecision =
  | { outcome: "matched_existing"; productId: string; rule: "canonical_url" | "external_id" | "domain" }
  | { outcome: "new"; companyId: string | null; rule: "company_domain" | "no_match" }
  | { outcome: "needs_review"; reason: string; possibleDuplicateOf: string | null };

export function isSharedHost(registrableDomain: string | null): boolean {
  return registrableDomain !== null && SHARED_HOST_DOMAINS.includes(registrableDomain);
}

export function nameKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function resolveIdentity(candidate: IdentityCandidate, lookup: IdentityLookup): IdentityDecision {
  if (lookup.productByCanonicalUrl) {
    return { outcome: "matched_existing", productId: lookup.productByCanonicalUrl, rule: "canonical_url" };
  }
  if (lookup.productByExternalId) {
    return { outcome: "matched_existing", productId: lookup.productByExternalId, rule: "external_id" };
  }
  // A candidate without a credible official URL goes to review (CLAUDE.md §8).
  let registrable: string | null = null;
  if (candidate.officialUrl) {
    try {
      registrable = normalizeUrl(candidate.officialUrl).registrableDomain;
    } catch {
      return { outcome: "needs_review", reason: "invalid_official_url", possibleDuplicateOf: null };
    }
  } else {
    return { outcome: "needs_review", reason: "missing_official_url", possibleDuplicateOf: null };
  }
  const shared = isSharedHost(registrable);
  const domainProducts = [...new Set(lookup.productsByDomain)];
  if (!shared && domainProducts.length === 1 && domainProducts[0]) {
    return { outcome: "matched_existing", productId: domainProducts[0], rule: "domain" };
  }
  const similar = lookup.similarNameProducts.find((p) => nameKey(p.name) === nameKey(candidate.name));
  if (!shared && lookup.companyByDomain) {
    // Same company domain, different product path: a new product of that company,
    // unless a same-named product exists (then a human decides).
    if (similar) {
      return { outcome: "needs_review", reason: "same_name_same_company", possibleDuplicateOf: similar.id };
    }
    return { outcome: "new", companyId: lookup.companyByDomain, rule: "company_domain" };
  }
  if (domainProducts.length > 1 && !shared) {
    return { outcome: "needs_review", reason: "domain_maps_to_several_products", possibleDuplicateOf: null };
  }
  // Name similarity is a review signal only, never a merge.
  if (similar) {
    return { outcome: "needs_review", reason: "similar_name", possibleDuplicateOf: similar.id };
  }
  return { outcome: "new", companyId: null, rule: "no_match" };
}
