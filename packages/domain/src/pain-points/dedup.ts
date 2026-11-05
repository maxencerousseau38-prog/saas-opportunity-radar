// P2 Normalizer & Deduplicator (Implementation Blueprint §7.2): normalized
// text hash, near-duplicate detection by trigram similarity (rule set
// `dedup-1`), same-author flags. Duplicates are kept but excluded from counts.
import { createHash } from "node:crypto";

export const DEDUP_RULE_SET_VERSION = "dedup-1" as const;
/** [ASSUMPTION] provisional threshold, calibrated on the evaluation set (Sprint 4). */
export const NEAR_DUPLICATE_THRESHOLD = 0.85;

export function normalizeFeedbackText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function normalizedTextHash(text: string): string {
  return createHash("sha256").update(normalizeFeedbackText(text), "utf8").digest("hex");
}

/** Character trigrams of each word, padded like pg_trgm ("  w", " wo", …, "rd "). */
export function trigrams(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of normalizeFeedbackText(text).split(" ")) {
    if (!word) continue;
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  }
  return out;
}

/** pg_trgm-style similarity: shared trigrams / union of trigrams. */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}

export interface DedupItem {
  id: string;
  productId: string;
  text: string;
  publishedAt: string | null;
  authorReferenceHash: string | null;
}

export interface DedupResult {
  /** item id → canonical item id, for near duplicates only. */
  duplicateOf: Map<string, string>;
  /** Item ids whose author also wrote another item of the set. */
  sameAuthorFlagged: Set<string>;
  ruleSetVersion: typeof DEDUP_RULE_SET_VERSION;
}

/**
 * Deterministic: items are taken in (published_at asc, nulls last, id) order;
 * an item similar enough to an earlier canonical item of the same product
 * becomes its duplicate.
 */
export function deduplicate(
  items: DedupItem[],
  threshold: number = NEAR_DUPLICATE_THRESHOLD,
): DedupResult {
  const ordered = [...items].sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : Number.POSITIVE_INFINITY;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : Number.POSITIVE_INFINITY;
    return ta !== tb ? ta - tb : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const duplicateOf = new Map<string, string>();
  const canonical: Array<{ item: DedupItem; grams: Set<string>; hash: string }> = [];
  for (const item of ordered) {
    const grams = trigrams(item.text);
    const hash = normalizedTextHash(item.text);
    const match = canonical.find((c) => {
      if (c.item.productId !== item.productId) return false;
      if (c.hash === hash) return true;
      let shared = 0;
      for (const t of grams) if (c.grams.has(t)) shared++;
      const union = grams.size + c.grams.size - shared;
      return union > 0 && shared / union >= threshold;
    });
    if (match) duplicateOf.set(item.id, match.item.id);
    else canonical.push({ item, grams, hash });
  }
  const byAuthor = new Map<string, string[]>();
  for (const item of items) {
    if (!item.authorReferenceHash) continue;
    byAuthor.set(item.authorReferenceHash, [
      ...(byAuthor.get(item.authorReferenceHash) ?? []),
      item.id,
    ]);
  }
  const sameAuthorFlagged = new Set<string>();
  for (const ids of byAuthor.values())
    if (ids.length > 1) ids.forEach((id) => sameAuthorFlagged.add(id));
  return { duplicateOf, sameAuthorFlagged, ruleSetVersion: DEDUP_RULE_SET_VERSION };
}
