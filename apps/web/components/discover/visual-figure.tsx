"use client";
import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import type { ProductCard } from "@sor/contracts";
import { licenceLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { visualPresentation } from "@/lib/visuals";

type Asset = NonNullable<ProductCard["visual_asset"]>;

/**
 * Product visual on the profile, shown whole (no crop) at its own ratio, with
 * its kind, rights and source. A reference (PD-38, PD-40) is loaded from its
 * origin; if it is gone, the profile says so.
 */
export function VisualFigure({ asset, observedLabel }: { asset: Asset; observedLabel: string }) {
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  const reference = asset.delivery_mode === "external_reference";
  const view = visualPresentation(asset);
  useEffect(() => {
    const el = img.current;
    if (!el?.complete) return;
    if (el.naturalWidth > 0) setLoaded(true);
    else setBroken(reference);
  }, [reference]);
  // Reserve the image's own ratio (no layout shift), within sensible bounds.
  const ratio =
    asset.width && asset.height ? Math.min(Math.max(asset.width / asset.height, 1.1), 3) : 1.91;
  return (
    <figure data-testid="profile-visual">
      {broken ? (
        <p className="flex items-center gap-2 px-4 pt-4 text-sm text-muted">
          <ImageOff size={14} aria-hidden /> Le visuel n’est plus disponible à son origine.
        </p>
      ) : (
        <div
          className={cn("relative w-full bg-surface-2", !loaded && "animate-pulse")}
          style={{ aspectRatio: String(ratio) }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- authorized copy served by SOR or a reference (PD-38, PD-40) */}
          <img
            ref={img}
            src={asset.url}
            alt={asset.alt_text}
            width={asset.width ?? undefined}
            height={asset.height ?? undefined}
            fetchPriority="high"
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={() => setLoaded(true)}
            onError={() => setBroken(reference)}
            style={{ objectPosition: view.objectPosition }}
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
              loaded ? "opacity-100" : "opacity-0",
            )}
          />
        </div>
      )}
      <figcaption className="px-4 py-2.5 text-[11px] leading-relaxed text-muted">
        <span>
          <span data-testid="profile-visual-type">{view.label}</span> · observé le {observedLabel} ·{" "}
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
        <details className="mt-1">
          <summary className="cursor-pointer select-none hover:text-fg">Droits d’usage</summary>
          <span className="block">{view.rightsNote}</span>
          {!reference ? <span className="block">droits : {asset.rights_basis}</span> : null}
        </details>
      </figcaption>
    </figure>
  );
}
