// Minimal HTML → text extraction for evidence (no script execution, no DOM).

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  agrave: "à",
  acirc: "â",
  ccedil: "ç",
  ocirc: "ô",
  ucirc: "û",
  ugrave: "ù",
  icirc: "î",
  euro: "€",
  copy: "©",
  reg: "®",
  trade: "™",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return NAMED[code.toLowerCase()] ?? match;
  });
}

export interface ExtractedPage {
  title: string | null;
  description: string | null;
  text: string;
  links: string[];
}

/** Template placeholders (`${…}`, `{{ … }}`) are code, never a page address. */
const PLACEHOLDER = /\$\{|\{\{|\}\}/;

export function extractPage(html: string, baseUrl: string): ExtractedPage {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const description =
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1] ??
    /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i.exec(html)?.[1];
  // Only rendered markup: links and text written inside scripts, styles,
  // comments or templates are code or dead content, not navigable links.
  const rendered = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, " ");
  const links: string[] = [];
  for (const m of rendered.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    const href = decodeEntities(m[1] ?? "");
    if (PLACEHOLDER.test(href)) continue;
    try {
      const u = new URL(href, baseUrl);
      if (u.protocol === "http:" || u.protocol === "https:") links.push(u.toString());
    } catch {
      // ignore malformed links
    }
  }
  const text = decodeEntities(
    rendered
      .replace(
        /<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article|\/header|\/footer)\b[^>]*>/gi,
        "\n",
      )
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v\u00a0]+/g, " ")
    .replace(/ *\n[ \n]*/g, "\n")
    .trim();
  const clean = (v: string | undefined) =>
    v ? decodeEntities(v).replace(/\s+/g, " ").trim() || null : null;
  return { title: clean(title), description: clean(description), text, links: [...new Set(links)] };
}
