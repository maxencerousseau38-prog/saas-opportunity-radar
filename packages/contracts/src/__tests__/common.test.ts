import { describe, expect, it } from "vitest";
import {
  ApiErrorSchema,
  CountryCodeSchema,
  CurrencyCodeSchema,
  EvidenceRefSchema,
  HttpUrlSchema,
  ISODateTimeSchema,
  UUIDSchema,
} from "../common";

describe("HttpUrlSchema", () => {
  it.each(["https://example.com", "http://example.com/pricing?x=1"])("accepts %s", (url) => {
    expect(HttpUrlSchema.safeParse(url).success).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "ftp://example.com/file",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "not a url",
  ])("rejects %s", (url) => {
    expect(HttpUrlSchema.safeParse(url).success).toBe(false);
  });
});

describe("code schemas", () => {
  it("upper-cases valid country and currency codes", () => {
    expect(CountryCodeSchema.parse("fr")).toBe("FR");
    expect(CurrencyCodeSchema.parse("eur")).toBe("EUR");
  });

  it.each(["F1", "FRA", ""])("rejects country code %j", (code) => {
    expect(CountryCodeSchema.safeParse(code).success).toBe(false);
  });
});

describe("identifiers and dates", () => {
  it("accepts a version-4 UUID as produced by gen_random_uuid()", () => {
    expect(UUIDSchema.safeParse("3f1c2b6e-8a4d-4c1e-9b7a-2d5e6f708192").success).toBe(true);
  });

  it("requires an explicit offset on datetimes", () => {
    expect(ISODateTimeSchema.safeParse("2026-11-04T10:00:00+01:00").success).toBe(true);
    expect(ISODateTimeSchema.safeParse("2026-11-04T10:00:00Z").success).toBe(true);
    expect(ISODateTimeSchema.safeParse("2026-11-04").success).toBe(false);
  });
});

describe("EvidenceRefSchema", () => {
  const id = "3f1c2b6e-8a4d-4c1e-9b7a-2d5e6f708192";

  it("defaults support_type to 'supports'", () => {
    expect(EvidenceRefSchema.parse({ evidence_id: id }).support_type).toBe("supports");
  });

  it("rejects unknown keys (AI outputs are strict)", () => {
    expect(EvidenceRefSchema.safeParse({ evidence_id: id, url: "https://x.y" }).success).toBe(
      false,
    );
  });
});

describe("ApiErrorSchema", () => {
  it("requires a request_id", () => {
    expect(
      ApiErrorSchema.safeParse({ error: { code: "NOT_FOUND", message: "Not found" } }).success,
    ).toBe(false);
  });
});
