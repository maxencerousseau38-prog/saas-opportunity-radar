import { describe, expect, it } from "vitest";
import { OperatorCatalogReviewResolutionSchema as S } from "../index";

const product = "6f1c1c1e-2a6b-4f5e-9d3a-1b2c3d4e5f60";

describe("operator decision on a catalog listing review", () => {
  it("accepts create, attach to a product and reject with a note", () => {
    expect(S.safeParse({ action: "create" }).success).toBe(true);
    expect(S.safeParse({ action: "attach", product_id: product }).success).toBe(true);
    expect(S.safeParse({ action: "reject", note: "Page d'un app store" }).success).toBe(true);
  });

  it("requires a product to attach and a note to reject", () => {
    expect(S.safeParse({ action: "attach" }).success).toBe(false);
    expect(S.safeParse({ action: "reject" }).success).toBe(false);
    expect(S.safeParse({ action: "reject", note: "   " }).success).toBe(false);
  });

  it("refuses a product outside attach, unknown actions and fields", () => {
    expect(S.safeParse({ action: "create", product_id: product }).success).toBe(false);
    expect(S.safeParse({ action: "merge" }).success).toBe(false);
    expect(S.safeParse({ action: "create", extra: 1 }).success).toBe(false);
    expect(S.safeParse({ action: "reject", note: "x".repeat(1001) }).success).toBe(false);
  });
});
