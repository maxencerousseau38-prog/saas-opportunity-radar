"use client";
import { useState } from "react";
import { ImageOff } from "lucide-react";
import type { ProductCard } from "@sor/contracts";
import { VISUAL_ASSET_TYPE, VISUAL_RIGHTS_NOTE, licenceLabel } from "@/lib/labels";

type Asset = NonNullable<ProductCard["visual_asset"]>;

/**
 * Product visual on the profile with its kind, rights and source. A reference
 * (PD-38) is loaded from its origin; if it is gone, the profile says so.
 */
export function VisualFigure({ asset, observedLabel }: { asset: Asset; observedLabel: string }) {
  const [broken, setBroken] = useState(false);
  const reference = asset.delivery_mode === "external_reference";
  return (
    <figure className="space-y-2" data-testid="profile-visual">
      {broken ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <ImageOff size={14} aria-hidden /> Le visuel n’est plus disponible à son origine.
        </p>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- authorized copy served by SOR or PD-38 reference
        <img
          src={asset.url}
          alt={asset.alt_text}
          width={asset.width ?? undefined}
          height={asset.height ?? undefined}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setBroken(reference)}
          className="h-auto max-h-96 w-full rounded-md border border-border object-contain"
        />
      )}
      <figcaption className="text-xs text-muted">
        {VISUAL_ASSET_TYPE[asset.asset_type]} · observé le {observedLabel} ·{" "}
        {asset.asset_type === "licensed_image" ? (
          <>
            {asset.attribution ? `© ${asset.attribution} · ` : ""}
            licence{" "}
            {asset.licence_url ? (
              <a
                className="text-accent underline"
                href={asset.licence_url}
                target="_blank"
                rel="noopener noreferrer nofollow license"
              >
                {licenceLabel(asset.licence_code)}
              </a>
            ) : (
              licenceLabel(asset.licence_code)
            )}{" "}
            ·{" "}
          </>
        ) : (
          <>droits : {asset.rights_basis} · </>
        )}
        <a
          className="text-accent underline"
          href={asset.source_url}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          source du visuel
        </a>
        {reference ? (
          <span className="block">{VISUAL_RIGHTS_NOTE[asset.rights_status]}</span>
        ) : null}
      </figcaption>
    </figure>
  );
}
