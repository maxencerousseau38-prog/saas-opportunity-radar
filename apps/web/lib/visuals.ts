// How a product visual is presented (PD-36, PD-38, PD-40): its label, the
// note that says why it is shown, and how to frame it. Pure: shared by the
// Discover cards and the SaaS profile, unit-tested.
import type { ProductCard } from "@sor/contracts";
import { VISUAL_ASSET_TYPE } from "@/lib/labels";

type Asset = NonNullable<ProductCard["visual_asset"]>;

export interface VisualPresentation {
  /** Short label on the card. */
  cardLabel: string;
  /** Full label on the profile. */
  label: string;
  /** Why this image is shown and with what rights (title / caption). */
  rightsNote: string;
  /**
   * CSS object-position for a cover crop: an interface screenshot keeps its
   * top (navigation, main view), the rest stays centred.
   */
  objectPosition: "top" | "center";
}

const REFERENCE_NOTE: Record<string, string> = {
  official_hero:
    "Visuel principal montré par l’éditeur sur la page d’accueil de son site officiel : affiché depuis son origine, sans licence vérifiée.",
  product_screenshot:
    "Capture de l’interface montrée par l’éditeur sur son site officiel : affichée depuis son origine, sans licence vérifiée.",
  publisher_share_image:
    "Image déclarée par l’éditeur sur son site officiel pour les aperçus de liens : affichée depuis son origine, sans licence vérifiée.",
  licensed_image:
    "Image sous licence libre hébergée sur Wikimedia Commons, affichée depuis son origine avec son auteur et sa licence.",
};

const CARD_LABEL: Record<string, string> = {
  official_hero: "Visuel officiel",
  product_screenshot: "Capture du produit",
  official_illustration: "Illustration officielle",
  licensed_image: "Image sous licence libre",
  publisher_share_image: "Image de l’éditeur",
};

export function visualPresentation(asset: Asset): VisualPresentation {
  const reference = asset.delivery_mode === "external_reference";
  return {
    cardLabel: CARD_LABEL[asset.asset_type] ?? VISUAL_ASSET_TYPE[asset.asset_type] ?? "Visuel",
    label: VISUAL_ASSET_TYPE[asset.asset_type] ?? asset.asset_type,
    rightsNote: reference
      ? (REFERENCE_NOTE[asset.asset_type] ?? asset.rights_basis)
      : `Copie approuvée par l’opérateur : ${asset.rights_basis}`,
    objectPosition: asset.asset_type === "product_screenshot" ? "top" : "center",
  };
}
