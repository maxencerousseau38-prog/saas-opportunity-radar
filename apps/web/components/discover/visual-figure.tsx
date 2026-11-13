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
    <figure data-testid="profile-visual">
      {broken ? (
        <p className="flex items-center gap-2 px-4 pt-4 text-sm text-muted">
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
          className="aspect-[1.91/1] h-auto w-full bg-surface-2 object-cover"
        />
      )}
      <figcaption className="px-4 py-2.5 text-[11px] leading-relaxed text-muted">
        <span>
          {VISUAL_ASSET_TYPE[asset.asset_type]} · observé le {observedLabel} ·{" "}
          {asset.asset_type === "licensed_image" ? (
            <>
              {asset.attribution ? `© ${asset.attribution} · ` : ""}
              licence{" "}
              {asset.licence_url ? (
                <a
                  className="underline underline-offset-2 hover:text-fg"
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
          ) : null}
          <a
            className="underline underline-offset-2 hover:text-fg"
            href={asset.source_url}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            source du visuel
          </a>
        </span>
        {asset.asset_type !== "licensed_image" || reference ? (
          <details className="mt-1">
            <summary className="cursor-pointer select-none hover:text-fg">Droits d’usage</summary>
            {asset.asset_type !== "licensed_image" ? (
              <span className="block">droits : {asset.rights_basis}</span>
            ) : null}
            {reference ? (
              <span className="block">{VISUAL_RIGHTS_NOTE[asset.rights_status]}</span>
            ) : null}
          </details>
        ) : null}
      </figcaption>
    </figure>
  );
}
