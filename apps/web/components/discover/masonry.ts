/** Minimal card shape the layout needs. */
export interface MasonryItem {
  tagline: string | null;
  short_description: string | null;
  visual_asset: unknown;
}

/** Rough relative height of a card: cover image, header, up to three text lines. */
export function estimateHeight(item: MasonryItem): number {
  const text = (item.tagline ?? item.short_description ?? "").length;
  return (item.visual_asset ? 52 : 18) + 30 + Math.min(3, Math.ceil(text / 38)) * 9;
}

/**
 * Greedy masonry (Pinterest-like grid): each card goes to the currently
 * shortest column. Prefix-stable: appending a page never moves the cards
 * already on screen, so infinite scroll does not reshuffle the grid.
 */
export function masonry<T extends MasonryItem>(items: T[], cols: number): T[][] {
  const n = Math.max(1, Math.floor(cols));
  const columns: T[][] = Array.from({ length: n }, () => []);
  const heights = new Array<number>(n).fill(0);
  for (const item of items) {
    let target = 0;
    for (let i = 1; i < n; i++) if (heights[i]! < heights[target]!) target = i;
    columns[target]!.push(item);
    heights[target]! += estimateHeight(item);
  }
  return columns;
}
