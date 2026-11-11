// Browser-safe entry (no Node built-ins): imported by client components
// through "@sor/domain/channels".
// Acquisition Channel registry (ADR-017, PD-37; PRD §24.3). Deterministic:
// every precise channel has one canonical key, one of the eight stable
// categories and a documented list of aliases. Free text never becomes a key:
// an unknown spelling normalizes to null and must be added here (with tests).
//
// A platform listed here is an acquisition channel a catalog SaaS may use. It
// is NOT a SOR data source: no connector or collection is implied (ADR-017 §1).

export const CHANNEL_REGISTRY_VERSION = "chanreg-1";

export const ACQUISITION_CHANNEL_CATEGORIES = [
  "organic",
  "community",
  "content_search",
  "social",
  "partnership",
  "paid",
  "other",
  "unknown",
] as const;
export type AcquisitionChannelCategory = (typeof ACQUISITION_CHANNEL_CATEGORIES)[number];

export interface AcquisitionChannelDefinition {
  key: string;
  category: Exclude<AcquisitionChannelCategory, "unknown">;
  label: string;
  /** Alternative spellings, compared after normalizeChannelText. */
  aliases: readonly string[];
}

export const ACQUISITION_CHANNELS: readonly AcquisitionChannelDefinition[] = [
  {
    key: "seo",
    category: "content_search",
    label: "SEO",
    aliases: [
      "search engine optimization",
      "search engine optimisation",
      "organic search",
      "referencement naturel",
      "google search",
    ],
  },
  {
    key: "content",
    category: "content_search",
    label: "Contenu",
    aliases: [
      "content marketing",
      "blog",
      "blogging",
      "articles",
      "guides",
      "marketing de contenu",
    ],
  },
  {
    key: "newsletter",
    category: "content_search",
    label: "Newsletter / e-mail",
    aliases: ["email", "e mail", "email marketing", "newsletters", "mailing list"],
  },
  {
    key: "x",
    category: "social",
    label: "X",
    aliases: ["twitter", "x com", "twitter x", "x twitter", "tweets"],
  },
  {
    key: "linkedin",
    category: "social",
    label: "LinkedIn",
    aliases: ["linked in", "linkedin posts"],
  },
  { key: "youtube", category: "social", label: "YouTube", aliases: ["you tube", "youtube videos"] },
  {
    key: "facebook",
    category: "social",
    label: "Facebook",
    aliases: ["facebook page", "meta facebook"],
  },
  { key: "instagram", category: "social", label: "Instagram", aliases: ["insta", "ig"] },
  { key: "tiktok", category: "social", label: "TikTok", aliases: ["tik tok"] },
  {
    key: "reddit",
    category: "community",
    label: "Reddit",
    aliases: ["subreddit", "subreddits", "r slash"],
  },
  {
    key: "hacker_news",
    category: "community",
    label: "Hacker News",
    aliases: ["hn", "hackernews", "show hn", "ycombinator news"],
  },
  {
    key: "product_hunt",
    category: "community",
    label: "Product Hunt",
    aliases: ["producthunt", "ph launch", "product hunt launch"],
  },
  {
    key: "community",
    category: "community",
    label: "Communautés",
    aliases: [
      "communities",
      "online communities",
      "slack communities",
      "discord",
      "forums",
      "communaute",
      "communautes",
    ],
  },
  {
    key: "partnerships",
    category: "partnership",
    label: "Partenariats",
    aliases: [
      "partners",
      "partnership",
      "integration partners",
      "co marketing",
      "partenariat",
      "partenariats",
    ],
  },
  {
    key: "app_marketplace",
    category: "partnership",
    label: "Marketplaces d’applications",
    aliases: [
      "app marketplace",
      "app store listing",
      "integration marketplace",
      "shopify app store",
      "chrome web store",
      "marketplace",
    ],
  },
  {
    key: "paid_advertising",
    category: "paid",
    label: "Publicité payante",
    aliases: [
      "paid ads",
      "ads",
      "ppc",
      "sea",
      "google ads",
      "adwords",
      "facebook ads",
      "linkedin ads",
      "paid social",
      "paid search",
      "publicite payante",
      "publicite",
    ],
  },
  {
    key: "referral",
    category: "organic",
    label: "Recommandation / bouche-à-oreille",
    aliases: [
      "word of mouth",
      "referrals",
      "customer referrals",
      "bouche a oreille",
      "recommandation",
    ],
  },
  {
    key: "direct",
    category: "organic",
    label: "Accès direct",
    aliases: ["direct traffic", "type in", "acces direct"],
  },
  {
    key: "outbound_sales",
    category: "other",
    label: "Prospection commerciale",
    aliases: ["outbound", "cold email", "cold outreach", "sales team", "prospection"],
  },
  {
    key: "events",
    category: "other",
    label: "Événements",
    aliases: ["conferences", "trade shows", "webinars", "meetups", "evenements"],
  },
  { key: "other", category: "other", label: "Autre canal", aliases: ["autre"] },
] as const;

/** Lower case, accents removed, every non-alphanumeric run turned into one space. */
export function normalizeChannelText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const BY_KEY = new Map(ACQUISITION_CHANNELS.map((c) => [c.key, c]));
const BY_ALIAS = new Map<string, string>();
for (const c of ACQUISITION_CHANNELS) {
  for (const spelling of [c.key, c.label, ...c.aliases]) {
    const normalized = normalizeChannelText(spelling);
    const previous = BY_ALIAS.get(normalized);
    if (previous && previous !== c.key) {
      throw new Error(`channel alias "${spelling}" maps to both ${previous} and ${c.key}`);
    }
    BY_ALIAS.set(normalized, c.key);
  }
}

/**
 * Canonical key for a channel spelling, or null when it is not in the
 * registry (the caller must refuse it; never invent a key from free text).
 */
export function normalizeChannelKey(input: string): string | null {
  const normalized = normalizeChannelText(input);
  if (!normalized) return null;
  return BY_ALIAS.get(normalized) ?? BY_ALIAS.get(normalized.replace(/ /g, "_")) ?? null;
}

export function channelDefinition(key: string): AcquisitionChannelDefinition | null {
  return BY_KEY.get(key) ?? null;
}

export const ACQUISITION_CHANNEL_KEYS: readonly string[] = ACQUISITION_CHANNELS.map((c) => c.key);
