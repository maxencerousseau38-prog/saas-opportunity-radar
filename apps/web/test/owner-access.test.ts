import { describe, expect, it } from "vitest";
import { ownerSecretMatches } from "@/lib/owner-access";

describe("ownerSecretMatches (PD-39)", () => {
  const secret = "k".repeat(48);

  it("accepts only the exact configured secret", () => {
    expect(ownerSecretMatches(secret, secret)).toBe(true);
    expect(ownerSecretMatches(`${secret}x`, secret)).toBe(false);
    expect(ownerSecretMatches(secret.slice(1), secret)).toBe(false);
    expect(ownerSecretMatches("K".repeat(48), secret)).toBe(false);
  });

  it("is closed when nothing is configured or the candidate is not a usable string", () => {
    expect(ownerSecretMatches(secret, undefined)).toBe(false);
    expect(ownerSecretMatches(secret, "")).toBe(false);
    expect(ownerSecretMatches("", secret)).toBe(false);
    expect(ownerSecretMatches(null, secret)).toBe(false);
    expect(ownerSecretMatches({ toString: () => secret }, secret)).toBe(false);
    expect(ownerSecretMatches("k".repeat(300), "k".repeat(300))).toBe(false);
  });
});
