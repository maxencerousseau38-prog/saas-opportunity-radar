import { describe, expect, it } from "vitest";
import type { VisualReference, VisualReferenceSnapshot } from "@sor/contracts";
import { refineSiteSnapshot } from "../visuals/refine";

const ref = (kind: VisualReference["kind"], file: string, alt: string): VisualReference => ({
  kind,
  listing_source_key: "uneed",
  listing_external_id: file,
  product_name: "Acme",
  image_url: `https://acme.test/${file}`,
  page_url: "https://acme.test/",
  content_hash: "a".repeat(64),
  content_type: "image/png",
  width: 1600,
  height: 900,
  alt_text: alt,
  observed_at: "2026-11-13T10:00:00.000Z",
  licence_code: null,
  licence_url: null,
  attribution: null,
});

describe("refineSiteSnapshot (visref-2)", () => {
  it("drops decorative heroes, keeps product heroes and every screenshot", () => {
    const snapshot: VisualReferenceSnapshot = {
      contract_version: "visual-references-1",
      kind: "site",
      rules_version: "visref-2",
      collected_at: "2026-11-13T10:00:00.000Z",
      summary: { candidates: 3, references: 3, rejected: { no_site_image: 1 } },
      references: [
        ref("site_hero", "hero-app.webp", "Acme dashboard on a laptop"),
        ref("site_hero", "team-offsite.jpg", "Visuel principal du site officiel de Acme"),
        ref(
          "site_screenshot",
          "screen.png",
          "Capture de l’interface de Acme sur son site officiel",
        ),
      ],
    };
    const refined = refineSiteSnapshot(snapshot);
    expect(refined.references.map((r) => r.listing_external_id)).toEqual([
      "hero-app.webp",
      "screen.png",
    ]);
    expect(refined.summary).toEqual({
      candidates: 3,
      references: 2,
      rejected: { no_site_image: 1, hero_not_product: 1 },
    });
    expect(refineSiteSnapshot(refined)).toEqual(refined);
  });
});
