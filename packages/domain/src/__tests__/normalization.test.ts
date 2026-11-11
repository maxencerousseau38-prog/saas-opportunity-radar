import { describe, expect, it } from "vitest";
import { InvalidUrlError, normalizeUrl, slugify } from "../normalization";

describe("normalizeUrl", () => {
  it("lowercases the host, strips www, default ports, fragments and the trailing slash", () => {
    expect(normalizeUrl("HTTPS://WWW.Example.COM:443/Pricing/#plans").canonicalUrl).toBe(
      "https://example.com/Pricing",
    );
  });

  it("removes tracking parameters and sorts the others", () => {
    expect(
      normalizeUrl("https://example.com/?utm_source=x&b=2&gclid=1&a=1&ref=hn&fbclid=z")
        .canonicalUrl,
    ).toBe("https://example.com?a=1&b=2");
  });

  it("converts IDNA hosts to ASCII", () => {
    expect(normalizeUrl("https://bücher.example/").host).toBe("xn--bcher-kva.example");
  });

  it("computes the registrable domain with the Public Suffix List", () => {
    expect(normalizeUrl("https://app.acme.co.uk/login").registrableDomain).toBe("acme.co.uk");
    expect(normalizeUrl("https://acme.vercel.app").registrableDomain).toBe("acme.vercel.app");
  });

  it("keeps non-default ports and drops credentials", () => {
    expect(normalizeUrl("http://user:pw@example.com:8080/a/").canonicalUrl).toBe(
      "http://example.com:8080/a",
    );
  });

  it("rejects non-http schemes", () => {
    expect(() => normalizeUrl("javascript:alert(1)")).toThrow(InvalidUrlError);
    expect(() => normalizeUrl("ftp://example.com")).toThrow(InvalidUrlError);
    expect(() => normalizeUrl("not a url")).toThrow(InvalidUrlError);
  });

  it("is idempotent", () => {
    const once = normalizeUrl("https://www.example.com/a/?utm_medium=x").canonicalUrl;
    expect(normalizeUrl(once).canonicalUrl).toBe(once);
  });
});

describe("slugify", () => {
  it("produces accent-free hyphenated slugs", () => {
    expect(slugify("Équipe Générale — CRM!")).toBe("equipe-generale-crm");
    expect(slugify("***")).toBe("item");
  });
});
