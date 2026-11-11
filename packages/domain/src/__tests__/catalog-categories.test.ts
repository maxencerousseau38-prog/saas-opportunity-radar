// Deterministic categorisation of collected listings (catmap-1).
import { describe, expect, it } from "vitest";
import {
  CATEGORY_MAPPING_SLUGS,
  CATEGORY_MAPPING_VERSION,
  categorizeListing,
} from "../catalog/categories";

const listing = (sourceCategories: string[], description: string | null = null) => ({
  name: "Any",
  description,
  sourceCategories,
});

describe("categorizeListing", () => {
  it("uses the source classes first, then the description, primary first", () => {
    expect(
      categorizeListing(listing(["customer relationship management software"], "online invoicing")),
    ).toEqual(["sales-crm-crm", "business-operations-finance-operations"]);
    expect(
      categorizeListing(listing(["software as a service"], "web-based project management tool")),
    ).toEqual(["business-operations-project-management"]);
  });

  it("covers categories beyond marketing (global catalog)", () => {
    expect(categorizeListing(listing(["videoconferencing software"]))).toEqual([
      "communication-collaboration-video-conferencing",
    ]);
    expect(categorizeListing(listing(["learning management system"]))).toEqual([
      "education-learning-learning-management",
    ]);
    expect(categorizeListing(listing(["password manager"]))).toEqual([
      "security-it-password-management",
    ]);
    expect(categorizeListing(listing(["applicant tracking system"]))).toEqual([
      "hr-recruiting-recruiting",
    ]);
  });

  it("never guesses: no match leaves the product uncategorised", () => {
    expect(
      categorizeListing(listing(["software as a service", "web application"], "online service")),
    ).toEqual([]);
    expect(categorizeListing(listing([], null))).toEqual([]);
  });

  it("does not categorise from the product name alone", () => {
    expect(
      categorizeListing({
        name: "Calendar CRM Analytics",
        description: null,
        sourceCategories: [],
      }),
    ).toEqual([]);
  });

  it("keeps at most three categories and is versioned", () => {
    const many = categorizeListing(
      listing(["crm", "email marketing", "business intelligence", "project management", "payroll"]),
    );
    expect(many).toHaveLength(3);
    expect(CATEGORY_MAPPING_VERSION).toBe("catmap-1");
    expect(new Set(CATEGORY_MAPPING_SLUGS).size).toBe(CATEGORY_MAPPING_SLUGS.length);
  });
});
