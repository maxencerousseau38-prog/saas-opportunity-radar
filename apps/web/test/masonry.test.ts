import { describe, expect, it } from "vitest";
import { masonry } from "../components/discover/masonry";

const card = (id: number, visual: boolean, text = "A short sentence about the product.") => ({
  id,
  tagline: null,
  short_description: text,
  visual_asset: visual ? { url: "x" } : null,
});

describe("Discover masonry grid", () => {
  it("keeps every card exactly once", () => {
    const items = Array.from({ length: 25 }, (_, i) => card(i, i % 3 === 0));
    const cols = masonry(items, 3);
    expect(cols).toHaveLength(3);
    expect(
      cols
        .flat()
        .map((c) => c.id)
        .sort((a, b) => a - b),
    ).toEqual(items.map((c) => c.id));
  });

  it("is prefix-stable: loading the next page never moves visible cards", () => {
    const first = Array.from({ length: 24 }, (_, i) => card(i, i % 2 === 0));
    const next = Array.from({ length: 24 }, (_, i) => card(24 + i, i % 4 === 0));
    const before = masonry(first, 4).map((c) => c.map((x) => x.id));
    const after = masonry([...first, ...next], 4).map((c) => c.map((x) => x.id));
    after.forEach((column, i) => expect(column.slice(0, before[i]!.length)).toEqual(before[i]));
  });

  it("balances columns: a tall card sends the next ones elsewhere", () => {
    const cols = masonry([card(1, true), card(2, false), card(3, false)], 2);
    expect(cols[0]!.map((c) => c.id)).toEqual([1]);
    expect(cols[1]!.map((c) => c.id)).toEqual([2, 3]);
  });

  it("falls back to one column for invalid counts", () => {
    expect(masonry([card(1, false)], 0)).toHaveLength(1);
  });
});
