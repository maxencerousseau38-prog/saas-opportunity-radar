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

  // Regression (audit 11 Nov 2026): links written inside scripts, comments or
  // templates were resolved into page URLs such as "/$%7Blink.href%7D".
  it("never extracts links from scripts, comments, templates or placeholders", () => {
    const page = extractPage(
      `<html><head><title>Synthetic</title></head><body>
       <a href="/pricing">Pricing</a>
       <script>
         const tpl = \`<a href="\${link.href}">y</a>\`;
         document.write("<a href='/js-only-page'>z</a>");
       </script>
       <!-- <a href="/old-commented-page">old</a> -->
       <template><a href="{{ product.url }}">t</a></template>
       <noscript><a href="/noscript-only">n</a></noscript>
       <a href="/plans/\${plan.id}">templated in markup</a>
       <a href="https://cdn.other.test/{{asset}}">templated external</a>
       <p>Visible <a href="/features">Features</a> text</p>
       </body></html>`,
      "https://synthetic.test/",
    );
    expect(page.links).toEqual([
      "https://synthetic.test/pricing",
      "https://synthetic.test/features",
    ]);
    expect(page.title).toBe("Synthetic");
    expect(page.text).toContain("Visible Features text");
    expect(page.text).not.toContain("document.write");
    expect(page.text).not.toContain("old-commented-page");
  });
});

describe("CSV", () => {
  it("parses quotes, separators, CRLF and a BOM", () => {
    const t = parseCsv(
      '\uFEFFname,website_url,note\r\n"Acme, Inc",https://acme.test,"He said ""hi"""\r\nBeta;https://beta.test;\r\n\r\n',
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
