// Product profile sources (S8.2): the licence or attribution stored with a
// collected catalog listing is carried to the "Sources et fiabilité" section.
import { describe, expect, it } from "vitest";
import { sourcesOf } from "@/lib/services/catalog";

type Row = Parameters<typeof sourcesOf>[0][number];

function evidence(id: string, snapshot: string, licence: string | null): Row {
  return {
    id,
    claim_type: "listing",
    claim_text: "Listed in a public catalog",
    fact_status: "declared",
    reliability_level: 3,
    verification_status: "unverified",
    source_snapshots: {
      id: snapshot,
      retrieved_at: "2026-11-10T18:23:49.952Z",
      last_retrieved_at: "2026-11-10T18:23:49.952Z",
      published_at: null,
      fetch_status: "success",
      licence,
      source_records: {
        canonical_url: "https://uneed.best/tool/example",
        title: "Example",
        sources: { source_key: "uneed", name: "Uneed", source_type: "directory" },
      },
    },
  } as unknown as Row;
}

describe("sourcesOf", () => {
  it("carries the stored licence / attribution of each source document", () => {
    const [uneed, other] = sourcesOf([
      evidence("e1", "s1", "Uneed read API (no data licence stated; Source: Uneed, uneed.best)"),
      evidence("e2", "s1", "Uneed read API (no data licence stated; Source: Uneed, uneed.best)"),
      evidence("e3", "s2", null),
    ]);
    expect(uneed?.licence).toContain("Source: Uneed, uneed.best");
    expect(uneed?.evidence).toHaveLength(2);
    expect(other?.licence).toBeNull();
  });

  it("never shows an empty licence", () => {
    expect(sourcesOf([evidence("e1", "s1", "")])[0]?.licence).toBeNull();
  });
});
