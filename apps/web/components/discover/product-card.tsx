"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import type { ProductCard } from "@sor/contracts";
import { Badge } from "@/components/ui/badge";
import {
  ACQUISITION_CHANNEL,
  ACQUISITION_CHANNEL_CATEGORY,
  ACQUISITION_CHANNEL_STATUS,
  PRICING_STATUS,
  confidenceLabel,
  isDemoUrl,
  licenceLabel,
} from "@/lib/labels";
import { cn } from "@/lib/utils";
import { visualPresentation } from "@/lib/visuals";
import { ProductActions, type ActionProps } from "./product-actions";

type Channel = ProductCard["acquisition_channels"][number];

/** Status tones shared by Feed, Grid and List (PRD §24.4: visually distinct). */
const CHANNEL_STATUS_TONE = {
  confirmed: "success",
  declared: "accent",
  estimated: "warning",
  unknown: "neutral",
} as const;

/** Host of the cited source (the operator's citation, not the SOR source registry). */
function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

/** Status, role, provenance, date and the reasons behind the confidence. */
function channelTitle(channel: Channel): string {
  return [
    `${ACQUISITION_CHANNEL[channel.channel_key] ?? channel.channel_key} (${ACQUISITION_CHANNEL_CATEGORY[channel.channel_category] ?? channel.channel_category})`,
    `${channel.role === "primary" ? "Canal principal" : "Canal secondaire"} · ${ACQUISITION_CHANNEL_STATUS[channel.status] ?? channel.status}`,
    `Source : ${sourceHost(channel.source_url)} · observé le ${new Date(channel.observed_at).toLocaleDateString("fr-FR")}`,
    channel.role_rationale ? `Principal selon la source : « ${channel.role_rationale} »` : null,
    channel.inference_rationale ? `Méthode de l’estimation : ${channel.inference_rationale}` : null,
    `${confidenceLabel(channel.confidence)}${channel.confidence_reasons.length ? ` — ${channel.confidence_reasons.join(" ; ")}` : ""}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Deterministic hue-free shade per name: monochrome, but cards stay distinguishable. */
function shade(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 5;
}
const MONOGRAM_BG = [
  "from-surface-3 to-surface",
  "from-surface-2 to-bg",
  "from-[oklch(0.32_0.005_286)] to-surface-2",
  "from-surface to-surface-3",
  "from-[oklch(0.26_0.004_286)] to-[oklch(0.17_0.004_286)]",
];

export function primaryCategory(product: Pick<ProductCard, "categories">): string | null {
  return product.categories.find((c) => c.is_primary)?.name ?? product.categories[0]?.name ?? null;
}

export function ProductLogo({
  name,
  logoUrl,
  size = 40,
}: {
  name: string;
  logoUrl: string | null;
  size?: number;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external logos, no optimisation proxy
      <img
        src={logoUrl}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-[22%] bg-surface-2 object-contain"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[22%] border border-border bg-gradient-to-br font-semibold text-fg/90",
        MONOGRAM_BG[shade(name)],
      )}
    >
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Visible, keyboard-reachable access to the official site from the card. */
function OfficialSiteLink({ product }: { product: ProductCard }) {
  if (!product.website_url) return null;
  return (
    <a
      href={product.website_url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      aria-label={`Ouvrir le site officiel de ${product.name}`}
      className="relative z-10 inline-flex max-w-full items-center gap-1 truncate text-xs text-muted transition-colors hover:text-fg"
    >
      <span className="truncate">{domainOf(product.website_url)}</span>
      <ArrowUpRight size={13} aria-hidden className="shrink-0" />
    </a>
  );
}

/**
 * The card cover: an authorised, evidence-linked visual (PD-38 reference or
 * private copy) with its type and source, or an honest typographic identity —
 * never a fabricated screenshot.
 */
function ProductCover({
  product,
  onBroken,
  priority,
}: {
  product: ProductCard;
  onBroken: () => void;
  priority: boolean;
}) {
  const asset = product.visual_asset!;
  const img = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const reference = asset.delivery_mode === "external_reference";
  const view = visualPresentation(asset);
  // The image may load or fail before hydration attaches its handlers.
  useEffect(() => {
    const el = img.current;
    if (!el?.complete) return;
    if (el.naturalWidth > 0) setLoaded(true);
    else if (reference) onBroken();
  }, [reference, onBroken]);
  return (
    <div
      role="group"
      aria-label={`Aperçu authentique de ${product.name}`}
      data-testid="product-visual-preview"
      className={cn(
        "relative aspect-[1.91/1] overflow-hidden bg-surface-2",
        !loaded && "animate-pulse",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- source-approved external product asset */}
      <img
        ref={img}
        src={asset.url}
        alt={asset.alt_text}
        width={asset.width ?? undefined}
        height={asset.height ?? undefined}
        // The first cards of the feed are the page's largest paint.
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => {
          // A reference (PD-38) is loaded from its origin: if it is gone, fall
          // back to the honest identity. A private copy keeps its frame.
          if (reference) onBroken();
        }}
        style={{ objectPosition: view.objectPosition }}
        className={cn(
          "absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-500 group-hover/card:scale-[1.02]",
          loaded ? "opacity-100" : "opacity-0",
        )}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/50 to-transparent" />
      <a
        href={asset.source_url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        aria-label={`Source du visuel (${view.label})`}
        title={view.rightsNote}
        className="absolute bottom-2 left-2 z-10 flex max-w-[calc(100%-5rem)] items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white/90 backdrop-blur-md hover:text-white"
      >
        <span data-testid="visual-asset-type" className="truncate">
          {view.cardLabel}
        </span>
        {asset.asset_type === "licensed_image" ? (
          <span data-testid="visual-asset-credit" className="truncate opacity-80">
            {" · "}
            {asset.attribution ? `© ${asset.attribution} · ` : ""}
            {licenceLabel(asset.licence_code)} · Wikimedia Commons
          </span>
        ) : null}
        <ExternalLink size={10} aria-hidden className="shrink-0" />
      </a>
      {asset.asset_type === "licensed_image" && asset.licence_url ? (
        <a
          href={asset.licence_url}
          target="_blank"
          rel="noopener noreferrer nofollow license"
          aria-label={`Licence ${licenceLabel(asset.licence_code)}`}
          className="absolute right-2 bottom-2 z-10 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white/90 backdrop-blur-md hover:text-white"
        >
          Licence
        </a>
      ) : null}
    </div>
  );
}

/**
 * Without an authorised visual the card shows its typographic identity —
 * never a fabricated screenshot — and says so to assistive technologies.
 */
function IdentityMark({ product, size }: { product: ProductCard; size: number }) {
  return (
    <div
      role="group"
      aria-label={`Identité catalogue de ${product.name}`}
      data-testid="product-visual-preview"
      className="shrink-0"
    >
      <ProductLogo name={product.name} logoUrl={product.logo_url} size={size} />
      <span className="sr-only">
        Aperçu authentique non disponible · Capture d’interface non disponible
      </span>
    </div>
  );
}

/** Documented acquisition channels only (never an "unknown" placeholder on a card). */
function Channels({ product }: { product: ProductCard }) {
  if (!product.acquisition_channels.length) return null;
  return (
    <div
      className="relative z-10 flex flex-wrap items-center gap-1.5"
      aria-label="Acquisition Channels documentés"
    >
      {product.acquisition_channels.slice(0, 2).map((channel) => (
        <a
          key={`${channel.channel_key}:${channel.evidence_id}`}
          href={channel.source_url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          title={channelTitle(channel)}
          data-testid="acquisition-channel"
          className="inline-flex flex-col rounded-lg border border-border px-2 py-1 text-[11px] hover:bg-surface-2"
        >
          <span className="flex items-center gap-1">
            {channel.role === "primary" ? "★ " : ""}
            {ACQUISITION_CHANNEL[channel.channel_key] ?? channel.channel_key}
            <Badge tone={CHANNEL_STATUS_TONE[channel.status]}>
              {ACQUISITION_CHANNEL_STATUS[channel.status]}
            </Badge>
          </span>
          <span className="text-[10px] text-muted">
            {channel.role === "primary" ? "Principal" : "Secondaire"} ·{" "}
            {sourceHost(channel.source_url)} · {confidenceLabel(channel.confidence)}
          </span>
        </a>
      ))}
      {product.acquisition_channels.length > 2 ? (
        <span className="text-[11px] text-muted">+{product.acquisition_channels.length - 2}</span>
      ) : null}
    </div>
  );
}

function Flags({ product }: { product: ProductCard }) {
  const ws = product.workspace;
  const demo = isDemoUrl(product.website_url);
  if (!demo && !ws.is_hidden && !ws.in_collection) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {demo ? <Badge tone="warning">Donnée de démonstration</Badge> : null}
      {ws.in_collection ? <Badge tone="outline">En collection</Badge> : null}
      {ws.is_hidden ? <Badge>Masqué</Badge> : null}
    </span>
  );
}

/** The whole card opens the profile: one stretched link, other controls sit above it. */
function CardLink({ product, workspaceId }: { product: ProductCard; workspaceId: string }) {
  return (
    <Link
      href={`/w/${workspaceId}/saas/${product.slug}`}
      className="outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-2 focus-visible:after:ring-ring"
    >
      {product.name}
    </Link>
  );
}

export function ProductCardView({
  product,
  variant,
  priority = false,
  ...actions
}: ActionProps & { product: ProductCard; variant: "feed" | "grid"; priority?: boolean }) {
  const feed = variant === "feed";
  const [broken, setBroken] = useState(false);
  const markBroken = useCallback(() => setBroken(true), []);
  const hasVisual = Boolean(product.visual_asset) && !broken;
  const category = primaryCategory(product);
  const sentence = product.tagline ?? product.short_description;
  return (
    <article
      aria-label={product.name}
      data-product-id={product.id}
      className="group/card relative flex animate-fade-up flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-border-strong"
    >
      {hasVisual ? (
        <ProductCover product={product} onBroken={markBroken} priority={priority} />
      ) : null}
      <div className={cn("flex flex-col gap-2.5", feed ? "p-4" : "p-3")}>
        <div className="flex items-start gap-3">
          {hasVisual ? (
            feed ? (
              <ProductLogo name={product.name} logoUrl={product.logo_url} size={40} />
            ) : null
          ) : (
            <IdentityMark product={product} size={feed ? 48 : 36} />
          )}
          <div className="min-w-0 flex-1 self-center">
            <h2
              className={cn(
                "font-semibold tracking-tight",
                feed ? "truncate text-[17px] leading-6" : "line-clamp-2 text-[15px] leading-5",
              )}
            >
              <CardLink product={product} workspaceId={actions.workspaceId} />
            </h2>
            <p className="truncate text-xs text-muted">{category ?? "Non classé"}</p>
          </div>
          {feed ? <ProductActions product={product} {...actions} className="-mt-1 -mr-2" /> : null}
        </div>
        <p
          className={cn(
            "text-fg/85",
            feed
              ? "line-clamp-3 text-[15px] leading-[1.45]"
              : "line-clamp-4 text-[13px] leading-snug",
          )}
        >
          {sentence ?? <span className="text-muted italic">Description non renseignée</span>}
        </p>
        <Flags product={product} />
        <Channels product={product} />
        {feed ? (
          <OfficialSiteLink product={product} />
        ) : (
          <div className="-mr-2 -mb-1 flex items-center justify-between gap-1">
            <span className="min-w-0">
              <OfficialSiteLink product={product} />
            </span>
            <ProductActions product={product} {...actions} />
          </div>
        )}
      </div>
    </article>
  );
}

/** Compact row for the List mode (dense scanning, same actions). */
export function ProductListRow({ product, ...actions }: ActionProps & { product: ProductCard }) {
  const category = primaryCategory(product);
  const sentence = product.tagline ?? product.short_description;
  return (
    <article
      aria-label={product.name}
      data-product-id={product.id}
      className="relative flex items-center gap-3 border-b border-border px-1 py-3 last:border-0 sm:px-3"
    >
      {product.visual_asset ? (
        <ProductLogo name={product.name} logoUrl={product.logo_url} size={44} />
      ) : (
        <IdentityMark product={product} size={44} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="truncate text-[15px] font-semibold">
            <CardLink product={product} workspaceId={actions.workspaceId} />
          </h2>
          {category ? (
            <span className="hidden shrink-0 text-xs text-muted sm:inline">{category}</span>
          ) : null}
        </div>
        <p className="truncate text-[13px] text-muted">
          {sentence ?? <span className="italic">Description non renseignée</span>}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {category ? <span className="text-[11px] text-muted sm:hidden">{category}</span> : null}
          {product.pricing_status !== "unknown" ? (
            <Badge tone="outline" className="hidden sm:inline-flex">
              {PRICING_STATUS[product.pricing_status]}
            </Badge>
          ) : null}
          <Flags product={product} />
          <Channels product={product} />
        </div>
      </div>
      <ProductActions product={product} {...actions} />
    </article>
  );
}
