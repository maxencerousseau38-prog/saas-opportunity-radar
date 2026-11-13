// Official site images (PD-40, amendment of ADR-016). From the official home
// page the connector already reads, list the images the publisher itself
// shows as its hero or as a screenshot of its interface. Deterministic and
// conservative: an image is a candidate only with an explicit signal (its
// file name, alternative text, classes or the hero section around it); a
// random picture, a logo, a badge, a portrait or a decoration never is.
// Nothing is fetched here: the collector downloads the best candidates once
// to check them (share-image.ts), then forgets the bytes.
import { decodeEntities } from "./html";

export type SiteImageKind = "site_hero" | "site_screenshot";

export interface SiteImageCandidate {
  url: string;
  kind: SiteImageKind;
  alt: string | null;
  /** Higher is better; only for ordering the candidates of one page. */
  score: number;
  /** Why it was kept (audit trail in the snapshot). */
  signals: string[];
}

/** At most this many candidates per page are kept, best first. */
export const MAX_SITE_IMAGE_CANDIDATES = 8;

/** Names that say "this is the product's interface" (file name, alt text, id). */
const SCREENSHOT =
  /\b(screen-?shots?|dashboards?|app-?(screen|ui|preview|shot|view|interface)s?|interfaces?|product-?(shot|ui|image|preview|demo|screenshot|tour)s?|ui-?(preview|shot)s?|previews?|demos?|mock-?ups?|in-?app)\b/;
/** Names that say "this is the page's main visual" (file name, alt text, id). */
const HERO =
  /\b(hero|banner|header-?(image|visual|img)|main-?(image|visual)|splash|landing-?(image|visual)|key-?visual)\b/;
/** Classes are noisier (object-cover, bg-cover…): only an explicit hero or banner counts. */
const HERO_CLASS = /(^|[\s_-])(hero|banner)([\s_-]|$)/;
/** Never the product: identity marks, people, social proof, store badges, decoration. */
const NOT_PRODUCT =
  /\b(logos?|icons?|favicons?|avatars?|badges?|awards?|sprites?|emojis?|flags?|testimonials?|customers?|clients?|partners?|team|founders?|ceo|persons?|people|portraits?|headshots?|profile|authors?|trust(ed)?|ratings?|stars?|reviews?|g2|capterra|product-?hunt|app-?store|google-?play|play-?store|download|qr|payments?|visa|mastercard|cookies?|pixel|tracking|loader|spinner|arrows?|chevron|patterns?|noise|gradients?|blobs?|shapes?|decorations?|illustrations?|backgrounds?|bg|placeholders?|stock|blank|spacer|thumbnails?|blog|posts?|articles?|news|press|signature|map|globe|world)\b/;
/** Hosts of widgets, avatars and badges embedded by many sites. */
const WIDGET_HOST =
  /(^|\.)(producthunt\.com|g2\.com|g2crowd\.com|capterra\.com|trustpilot\.com|gravatar\.com|googleusercontent\.com|twimg\.com|githubusercontent\.com|shields\.io|badgen\.net|getapp\.com|softwareadvice\.com|trustradius\.com|sourceforge\.net|apple\.com|google\.com|stripe\.com|paypal\.com|doubleclick\.net|facebook\.com|fbcdn\.net|linkedin\.com|licdn\.com|ytimg\.com|vimeocdn\.com)$/i;
const IDENTITY_CLASS = /\b(logo|icon|avatar|badge|brand|emoji|flag|favicon)/i;
const RASTER_EXT = /\.(png|jpe?g|webp)$/i;
const OTHER_EXT = /\.(svg|gif|ico|avif|bmp|tiff?)$/i;

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = re.exec(tag);
  const raw = m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
  return raw === null ? null : decodeEntities(raw).trim();
}

/** Largest entry of a srcset ("a.png 640w, b.png 1280w" or "1x/2x"). */
function largestFromSrcset(srcset: string | null): string | null {
  if (!srcset) return null;
  let best: { url: string; size: number } | null = null;
  for (const part of srcset.split(/,(?=\s*\S+\s+\d)|,\s+/)) {
    const [url, descriptor] = part.trim().split(/\s+/);
    if (!url) continue;
    const size = descriptor ? parseFloat(descriptor) * (descriptor.endsWith("x") ? 1000 : 1) : 1;
    if (!best || size > best.size) best = { url, size };
  }
  return best?.url ?? null;
}

/** A Next.js optimizer URL (/_next/image?url=…) points to the original asset. */
function unwrapOptimizer(url: URL): URL {
  if (url.pathname.endsWith("/_next/image")) {
    const inner = url.searchParams.get("url");
    if (inner) {
      try {
        return new URL(inner, url);
      } catch {
        return url;
      }
    }
  }
  return url;
}

function signalText(...parts: Array<string | null>): string {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[_./]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
}

/**
 * Hero and screenshot candidates of an official page, best first. The page is
 * untrusted markup: it is read as text, never executed.
 */
export function extractSiteImages(html: string, baseUrl: string): SiteImageCandidate[] {
  const body = (/<body\b[\s\S]*$/i.exec(html)?.[0] ?? html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ");
  const found = new Map<string, SiteImageCandidate>();
  let position = 0;
  for (const m of body.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    position++;
    const raw =
      largestFromSrcset(attr(tag, "srcset") ?? attr(tag, "data-srcset")) ??
      attr(tag, "data-src") ??
      attr(tag, "data-lazy-src") ??
      attr(tag, "src");
    if (!raw || raw.startsWith("data:") || /\$\{|\{\{/.test(raw)) continue;
    let url: URL;
    try {
      url = unwrapOptimizer(new URL(raw, baseUrl));
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    if (WIDGET_HOST.test(url.hostname)) continue;
    const path = url.pathname.toLowerCase();
    if (OTHER_EXT.test(path)) continue;
    const declaredWidth = Number(attr(tag, "width"));
    const declaredHeight = Number(attr(tag, "height"));
    if (declaredWidth > 0 && declaredWidth < 400) continue;
    if (declaredHeight > 0 && declaredHeight < 200) continue;

    const alt = attr(tag, "alt");
    const cls = attr(tag, "class");
    // Utility classes (bg-white, rounded-lg…) say nothing: classes only add
    // positive signals or an explicit identity-mark class.
    const named = signalText(path, alt, attr(tag, "id"), attr(tag, "title"));
    if (NOT_PRODUCT.test(named) || IDENTITY_CLASS.test(cls ?? "")) continue;
    // The section the image sits in: the 1,500 characters of markup before it.
    let before = body.slice(Math.max(0, (m.index ?? 0) - 1500), m.index);
    // Only the section the image is in: stop at the last closed section.
    const closed = [...before.matchAll(/<\/(section|header|article|main|footer)\s*>/gi)].pop();
    if (closed?.index !== undefined) before = before.slice(closed.index);
    const context = signalText(
      [...before.matchAll(/\s(?:class|id)\s*=\s*["']([^"']*)["']/gi)]
        .slice(-6)
        .map((x) => x[1] ?? "")
        .join(" "),
    );

    const signals: string[] = [];
    let score = 0;
    if (SCREENSHOT.test(named)) {
      signals.push("screenshot_named");
      score += 6;
    }
    if (HERO.test(named) || HERO_CLASS.test(cls?.toLowerCase() ?? "")) {
      signals.push("hero_named");
      score += 6;
    }
    if (HERO_CLASS.test(context)) {
      signals.push("in_hero_section");
      score += position <= 6 ? 7 : 1; // the official hero comes first (PD-40)
    }
    if (SCREENSHOT.test(context)) {
      signals.push("in_product_section");
      score += 2;
    }
    // An explicit, positive signal is required: never a random picture.
    if (!signals.some((s) => s !== "in_product_section")) continue;
    if (RASTER_EXT.test(path)) score += 1;
    if (declaredWidth >= 1000) score += 2;
    score -= Math.min(position, 30) / 10; // earlier on the page is more representative

    const kind: SiteImageKind =
      signals.includes("screenshot_named") && !signals.includes("hero_named")
        ? "site_screenshot"
        : "site_hero";
    const key = url.toString();
    const previous = found.get(key);
    if (!previous || previous.score < score) {
      found.set(key, {
        url: key,
        kind,
        alt: alt ? alt.slice(0, 300) : null,
        score: Math.round(score * 10) / 10,
        signals,
      });
    }
  }
  return [...found.values()].sort((a, b) => b.score - a.score).slice(0, MAX_SITE_IMAGE_CANDIDATES);
}
