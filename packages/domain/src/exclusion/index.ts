// Permanent Affiliate/Partner exclusion classifier (Implementation Blueprint §5.4;
// ADR-010; PD-11 A). Deterministic: the same input always gives the same result.
// The rule set is mirrored, for audit only, in the server-only `exclusion_rules`
// table (migration M4). Any change here needs a new rule-set version.

export const EXCLUSION_RULE_SET_VERSION = "excl-1" as const;

/** Slugs of the hidden, permanently excluded categories seeded by migration M4. */
export const PERMANENTLY_EXCLUDED_CATEGORY_SLUGS: readonly string[] = [
  "excluded-affiliate-marketing",
  "excluded-affiliate-networks",
  "excluded-partner-management",
  "excluded-partner-marketplaces",
  "excluded-partner-attribution",
  "excluded-partner-commissions-payouts",
  "excluded-referral-affiliate-networks",
];

export interface ExclusionInput {
  primaryCategorySlugs: string[];
  name: string;
  tagline: string | null;
  /** Short, LLM-proposed (product) or generated (hypothesis) primary use case. */
  primaryUseCase: string | null;
  /** Descriptions. */
  secondaryTexts: string[];
  /** Feature and integration names. */
  featureTexts: string[];
  llmCorePurposeFlag?: "affiliate_or_partner" | "not_affiliate_or_partner" | "unknown";
}

export type ExclusionStatus = "eligible" | "excluded" | "needs_review";
export type ExclusionField = "category" | "core" | "secondary" | "llm";

export interface ExclusionResult {
  status: ExclusionStatus;
  ruleSetVersion: typeof EXCLUSION_RULE_SET_VERSION;
  /**
   * Rules that matched. R6 (boundary case, PD-11 A) appears here as an
   * informational flag and never changes an `eligible` status.
   */
  matchedRules: Array<{ ruleKey: string; field: ExclusionField }>;
  /** R9: excluded vocabulary found only in feature or integration names. */
  incidentalMentions: Array<{ ruleKey: string; text: string }>;
}

const phrases = (...alternatives: string[]): RegExp =>
  new RegExp(`\\b(?:${alternatives.join("|")})\\b`);

// Patterns run on normalized text (lowercase, no accents, punctuation as spaces).
const R2 = phrases(
  "affiliate marketing",
  "affiliate programs?",
  "affiliate networks?",
  "affiliate management",
  "affiliate tracking",
  "affiliate software",
  "affiliate platforms?",
  "affiliate attribution",
  "affiliate commissions?",
  "affiliate payouts?",
);
const R3 = phrases(
  "partner programs?",
  "partner management",
  "partner relationship management",
  "prm",
  "partner ecosystems?",
  "partner marketplaces?",
  "partner portals?",
  "channel partners?",
  "partner attribution",
  "partner commissions?",
  "partner payouts?",
  "partnership management",
  "partnerships platforms?",
);
const R4 = phrases("referral networks?", "affiliate and referral", "referral and affiliate");
const R5_MONEY = phrases("commissions?", "payouts?");
const R5_CONTEXT = phrases("affiliates?", "partners?");
const R6 = phrases(
  "commission management",
  "sales commissions?",
  "referral programs?",
  "referral marketing",
  "customer referrals?",
);
const AFFILIATE_TOKEN = phrases("affiliates?");
const PARTNER_TOKEN = phrases("partners?");

/** Lowercase, strip accents, turn punctuation into spaces, collapse spaces. */
export function normalizeExclusionText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function coreRule(text: string): "R2" | "R3" | "R4" | "R5" | null {
  if (R2.test(text)) return "R2";
  if (R3.test(text)) return "R3";
  if (R4.test(text)) return "R4";
  if (R5_MONEY.test(text) && R5_CONTEXT.test(text)) return "R5";
  return null;
}

/**
 * R2–R5 theme of a free text (a planned query or a prompt), on normalized
 * text. Same patterns as the classifier (no rule-set change): used by the
 * Discovery planner guard (Implementation Blueprint §6.2).
 */
export function excludedThemeRule(text: string): "R2" | "R3" | "R4" | "R5" | null {
  return coreRule(normalizeExclusionText(text));
}

/** True for a permanently excluded category slug (R1). */
export function isPermanentlyExcludedCategory(slug: string): boolean {
  return PERMANENTLY_EXCLUDED_CATEGORY_SLUGS.includes(slug) || slug.startsWith("excluded-");
}

const STATUS_RANK: Record<ExclusionStatus, number> = { eligible: 0, needs_review: 1, excluded: 2 };

export function classifyExclusion(input: ExclusionInput): ExclusionResult {
  const matched: ExclusionResult["matchedRules"] = [];
  const incidental: ExclusionResult["incidentalMentions"] = [];
  let status: ExclusionStatus = "eligible";
  const raise = (to: ExclusionStatus) => {
    if (STATUS_RANK[to] > STATUS_RANK[status]) status = to;
  };
  const match = (ruleKey: string, field: ExclusionField) => {
    if (!matched.some((m) => m.ruleKey === ruleKey && m.field === field)) {
      matched.push({ ruleKey, field });
    }
  };

  // R1 — permanently excluded primary category.
  const excludedSlugs = new Set(PERMANENTLY_EXCLUDED_CATEGORY_SLUGS);
  if (input.primaryCategorySlugs.some((s) => excludedSlugs.has(s) || s.startsWith("excluded-"))) {
    match("R1", "category");
    raise("excluded");
  }

  // Core texts: name, tagline, primary use case.
  const useCase = input.primaryUseCase ? normalizeExclusionText(input.primaryUseCase) : "";
  const core = [input.name, input.tagline ?? "", input.primaryUseCase ?? ""]
    .map(normalizeExclusionText)
    .filter((t) => t.length > 0);
  for (const text of core) {
    const rule = coreRule(text);
    if (rule) {
      match(rule, "core");
      raise("excluded");
    } else if (R6.test(text)) {
      match("R6", "core"); // PD-11 A: informational only
    }
    // R7 — ambiguous standalone tokens.
    if (!rule && AFFILIATE_TOKEN.test(text)) {
      match("R7", "core");
      raise("needs_review");
    }
  }
  if (useCase && !coreRule(useCase) && PARTNER_TOKEN.test(useCase)) {
    match("R7", "core");
    raise("needs_review");
  }

  // R8 — excluded phrases in descriptions only.
  for (const raw of input.secondaryTexts) {
    const rule = coreRule(normalizeExclusionText(raw));
    if (rule) {
      match("R8", "secondary");
      raise("needs_review");
    }
  }

  // R9 — vocabulary in feature or integration names only: incidental.
  for (const raw of input.featureTexts) {
    const text = normalizeExclusionText(raw);
    const rule =
      coreRule(text) ??
      (R6.test(text) ? "R6" : AFFILIATE_TOKEN.test(text) || PARTNER_TOKEN.test(text) ? "R7" : null);
    if (rule) incidental.push({ ruleKey: "R9", text: raw.slice(0, 200) });
  }

  // R10 — an LLM can escalate to review, never make a product eligible.
  if (input.llmCorePurposeFlag === "affiliate_or_partner") {
    match("R10", "llm");
    raise("needs_review");
  }

  return {
    status,
    ruleSetVersion: EXCLUSION_RULE_SET_VERSION,
    matchedRules: matched,
    incidentalMentions: incidental,
  };
}

/** Rule keys mirrored in `exclusion_rules` for rule set excl-1 (R9 has no row). */
export const EXCLUSION_RULE_KEYS = ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R10"] as const;
