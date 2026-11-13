import { describe, expect, it } from "vitest";
import { visualPresentation } from "../lib/visuals";

const asset = (asset_type: string, delivery_mode = "external_reference") =>
  ({
    asset_type,
    url: "https://cdn.example.test/v.png",
    alt_text: "Synthetic test case",
    source_url: "https://example.test/",
    observed_at: "2026-11-13T10:00:00Z",
    rights_basis: "Press kit (synthetic)",
    confidence: null,
    width: 1600,
    height: 900,
    delivery_mode,
    rights_status: delivery_mode === "private_copy" ? "approved" : "publisher_published",
    licence_code: null,
    licence_url: null,
    attribution: null,
  }) as Parameters<typeof visualPresentation>[0];

describe("visualPresentation (PD-40)", () => {
  it("labels each kind honestly and says why it is shown", () => {
    expect(visualPresentation(asset("official_hero"))).toMatchObject({
      cardLabel: "Visuel officiel",
      objectPosition: "center",
    });
    expect(visualPresentation(asset("official_hero")).rightsNote).toMatch(
      /site officiel.*sans licence vérifiée/,
    );
    expect(visualPresentation(asset("product_screenshot"))).toMatchObject({
      cardLabel: "Capture du produit",
      label: "Capture authentique du produit",
    });
    expect(visualPresentation(asset("publisher_share_image")).cardLabel).toBe("Image de l’éditeur");
  });

  it("keeps the top of an interface screenshot in a cover crop", () => {
    expect(visualPresentation(asset("product_screenshot")).objectPosition).toBe("top");
    expect(visualPresentation(asset("publisher_share_image")).objectPosition).toBe("center");
  });

  it("states the documented rights of an operator-approved copy", () => {
    expect(visualPresentation(asset("official_hero", "private_copy")).rightsNote).toBe(
      "Copie approuvée par l’opérateur : Press kit (synthetic)",
    );
  });
});
