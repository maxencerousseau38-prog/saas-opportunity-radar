import { describe, expect, it } from "vitest";
import { heroShowsProduct } from "../discover/visual-relevance";

// Cases from the visref-2 review of the 13 November 2026 collection (synthetic URLs).
const hero = (file: string, alt: string | null, productName = "FocusKit") =>
  heroShowsProduct({ imageUrl: `https://cdn.example.test/img/${file}`, alt, productName });

describe("heroShowsProduct", () => {
  it("keeps heroes that name the product or describe a view of it", () => {
    expect(hero("hero-focuskit-device-showcase.webp", null)).toBe(true);
    expect(
      hero("hero-longer-mockup.webp", "SuperX content creation and AI writing interface"),
    ).toBe(true);
    expect(hero("mac-today.webp", "Tilly Mac design showing Today and the calendar", "Tilly")).toBe(
      true,
    );
    expect(hero("hero-CiQUOv4a.png", "Hyperfocus planning board", "HYPERFOCUS")).toBe(true);
    expect(hero("Plus%20AI%20preview.png", null, "AI for Google Slides")).toBe(true);
  });

  it("refuses lifestyle, stock and event photography", () => {
    expect(hero("andrew-neel-TTPMpLl_2lc-unsplash-edited.jpg", null, "DNS Shield")).toBe(false);
    expect(hero("sci-hero-image.jpg", "A woman wearing glasses and smiling.", "Defender")).toBe(
      false,
    );
    expect(hero("reinvent-2026-seating.png", "AWS re:Invent Livestream", "Rekognition")).toBe(
      false,
    );
    expect(hero("core-value-banner-img.jpg", "Core-value-banner", "Zoho Corporation")).toBe(false);
    expect(hero("hero-morning.webp", null, "Hubflo")).toBe(false);
  });

  it("does not count the collector's own fallback text as a description", () => {
    expect(
      hero("town-square-market.jpg", "Visuel principal du site officiel de Uppercut", "Uppercut"),
    ).toBe(false);
  });

  it("needs more than a very short name to match on the name alone", () => {
    expect(hero("hero-abc.png", null, "Abc")).toBe(false);
  });
});
