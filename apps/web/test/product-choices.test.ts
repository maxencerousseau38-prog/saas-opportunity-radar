import { describe, expect, it } from "vitest";
import { mergeProductChoices } from "@/lib/product-choices";

describe("product choices of the pain point and analysis forms", () => {
  it("puts search results first and keeps every product once", () => {
    const preloaded = [
      { id: "a", name: "Alpha" },
      { id: "b", name: "Beta" },
    ];
    const found = [
      { id: "m", name: "MetricFlow" },
      { id: "a", name: "Alpha" },
    ];
    expect(mergeProductChoices(found, preloaded).map((p) => p.id)).toEqual(["m", "a", "b"]);
  });

  it("keeps earlier search results when a new search is merged in front", () => {
    const first = mergeProductChoices([{ id: "m", name: "MetricFlow" }], []);
    const second = mergeProductChoices([{ id: "l", name: "LeadNest" }], first);
    expect(second.map((p) => p.name)).toEqual(["LeadNest", "MetricFlow"]);
  });
});
