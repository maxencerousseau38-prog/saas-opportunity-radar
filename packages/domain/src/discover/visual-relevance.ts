// Visual relevance (PD-40, rules visref-2). A "hero" found on an official home
// page is kept only when it visibly concerns the product: its alternative
// text or file name names the product or describes a product view (interface,
// app, dashboard, device…). Lifestyle and stock photography — people, scenes,
// events, landscapes — is the site's decoration, not the product's universe,
// and is refused. Offline and deterministic: it reads the image URL, its
// alternative text and the product name, nothing else. No I/O here.

/** Words that describe a view of the product itself. */
const PRODUCT_VIEW =
  /\b(interfaces?|apps?|applications?|dashboards?|mock-?ups?|screens?|screenshots?|shots?|previews?|demos?|devices?|mac|macbook|laptop|desktop|iphone|ipad|mobile|platform|editor|workspace|boards?|products?|tools?|software|ui|ux|saas|crm|analytics|charts?|reports?|inbox|calendar|views?|features?|canvas|builder|panels?|console|extension|plugin|widgets?|showcase|walkthrough|tour)\b/;
/** Words of people, places and stock photography: decoration, not the product. */
const NOT_A_PRODUCT_VIEW =
  /\b(woman|women|man|men|person|people|team|teams|smiling|smile|portraits?|headshots?|photos?|photographs?|unsplash|pexels|pixabay|shutterstock|istock|istockphoto|getty|gettyimages|adobestock|depositphotos|freepik|stock|livestream|events?|conference|meetup|summit|office|city|landscape|sky|sunset|sunrise|morning|nature|mountains?|beach|ocean|forest|coffee|street|market|crowd|audience|family|kids?|children|values?|culture|careers?)\b/;
/** Alternative text the collector writes when the page gives none. */
const COLLECTOR_FALLBACK_ALT =
  /^(Visuel principal du site officiel de |Capture de l’interface de |Image de partage de )/;

function words(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/%20/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compact(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** The file name of an image URL, without query or extension. */
function fileName(imageUrl: string): string {
  try {
    const path = decodeURIComponent(new URL(imageUrl).pathname);
    return (path.split("/").pop() ?? "").replace(/\.[a-z0-9]+$/i, "");
  } catch {
    return "";
  }
}

/** True when a page's hero image visibly concerns the product (visref-2). */
export function heroShowsProduct(args: {
  imageUrl: string;
  alt: string | null;
  productName: string;
}): boolean {
  const alt = args.alt && !COLLECTOR_FALLBACK_ALT.test(args.alt) ? args.alt : "";
  const file = fileName(args.imageUrl);
  const text = words(`${alt} ${file}`);
  if (NOT_A_PRODUCT_VIEW.test(text)) return false;
  const name = compact(args.productName);
  if (name.length >= 4 && compact(`${alt} ${file}`).includes(name)) return true;
  return PRODUCT_VIEW.test(text);
}
