// Product choices of the pain point and analysis forms. The page preloads the
// first products by name only; catalog search results (and products already
// selected) are merged in front so every visible product can be chosen.
export interface ProductChoice {
  id: string;
  name: string;
}

/** Search results first, then earlier choices, without duplicates (first occurrence wins). */
export function mergeProductChoices(
  ...lists: ReadonlyArray<ReadonlyArray<ProductChoice>>
): ProductChoice[] {
  const seen = new Set<string>();
  const out: ProductChoice[] = [];
  for (const list of lists) {
    for (const p of list) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push({ id: p.id, name: p.name });
    }
  }
  return out;
}
