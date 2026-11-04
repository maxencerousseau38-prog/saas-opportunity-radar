import { describe, expect, it } from "vitest";
import { CsvError, decodeEntities, extractPage, isAllowed, parseCsv, parseRobots } from "../index";

describe("robots.txt (RFC 9309)", () => {
  const txt = `User-agent: *
Disallow: /private
Allow: /private/public
Disallow: /*.pdf$

User-agent: SaaSOpportunityRadar
User-agent: OtherBot
Disallow: /pricing-internal
`;
  it("uses the most specific group", () => {
    const own = parseRobots(txt, "SaaSOpportunityRadar/0.1");
    expect(isAllowed(own, "/private")).toBe(true);
    expect(isAllowed(own, "/pricing-internal")).toBe(false);
  });
  it("applies longest match, Allow on ties, and wildcards", () => {
    const star = parseRobots(txt, "SomeoneElse");
    expect(isAllowed(star, "/private/x")).toBe(false);
    expect(isAllowed(star, "/private/public/page")).toBe(true);
    expect(isAllowed(star, "/docs/file.pdf")).toBe(false);
    expect(isAllowed(star, "/docs/file.pdf?x=1")).toBe(true);
    expect(isAllowed(star, "/")).toBe(true);
  });
  it("an empty Disallow allows everything", () => {
    expect(isAllowed(parseRobots("User-agent: *\nDisallow:\n", "x"), "/a")).toBe(true);
  });
});

describe("HTML extraction", () => {
  it("keeps visible text, drops scripts, decodes entities and resolves links", () => {
    const page = extractPage(
      `<html><head><title>Metric &amp; Flow</title><meta name="description" content="Dashboards"><script>alert(1)</script></head>
       <body><h1>Pricing</h1><p>Starter&nbsp;29&#36; / month</p><style>.x{}</style><a href="/features">Features</a>
       <a href="https://other.test/x">x</a><a href="javascript:alert(1)">bad</a><!-- secret --></body></html>`,
      "https://metricflow.test/",
    );
    expect(page.title).toBe("Metric & Flow");
    expect(page.description).toBe("Dashboards");
    expect(page.text).toContain("Starter 29$ / month");
    expect(page.text).not.toContain("alert");
    expect(page.text).not.toContain("secret");
    expect(page.links).toEqual(["https://metricflow.test/features", "https://other.test/x"]);
    expect(decodeEntities("&eacute;quipe &#x20AC;")).toBe("équipe €");
  });
});

describe("CSV", () => {
  it("parses quotes, separators, CRLF and a BOM", () => {
    const t = parseCsv(
      '﻿name,website_url,note\r\n"Acme, Inc",https://acme.test,"He said ""hi"""\r\nBeta;https://beta.test;\r\n\r\n',
      { maxRows: 10 },
    );
    expect(t.headers).toEqual(["name", "website_url", "note"]);
    expect(t.rows).toEqual([
      { name: "Acme, Inc", website_url: "https://acme.test", note: 'He said "hi"' },
      { name: "Beta", website_url: "https://beta.test", note: "" },
    ]);
  });
  it("enforces limits and rejects malformed files", () => {
    expect(() => parseCsv("a\n1\n2\n3", { maxRows: 2 })).toThrow(CsvError);
    expect(() => parseCsv('a\n"open', { maxRows: 2 })).toThrow(/unterminated/);
    expect(() => parseCsv("a,a\n1,2", { maxRows: 2 })).toThrow(/duplicate/);
    expect(() => parseCsv("", { maxRows: 2 })).toThrow(/empty/);
  });
});
