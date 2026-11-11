"use client";
import Link from "next/link";
import { ExternalLink, ImageOff } from "lucide-react";
import type { ProductCard } from "@sor/contracts";
import { Badge } from "@/components/ui/badge";
import { Unknown } from "@/components/ui/states";
import {
  ACQUISITION_CHANNEL,
  ACQUISITION_CHANNEL_CATEGORY,
  ACQUISITION_CHANNEL_STATUS,
  CUSTOMER_TYPE,
  PRICING_STATUS,
  VISUAL_ASSET_TYPE,
  confidenceLabel,
  countryName,
  isDemoUrl,
  teamLabel,
} from "@/lib/labels";
import { cn } from "@/lib/utils";
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
        className="shrink-0 rounded-md bg-surface-2 object-contain"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-md bg-surface-2 font-semibold text-muted"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function StatusBadges({ product }: { product: ProductCard }) {
  const ws = product.workspace;
  return (
    <>
      {isDemoUrl(product.website_url) ? (
        <Badge tone="warning">Donnée de démonstration</Badge>
      ) : null}
      {ws.last_viewed_at === null ? <Badge tone="accent">Nouveau</Badge> : null}
      {ws.is_favorite || ws.in_collection ? <Badge tone="success">Sauvegardé</Badge> : null}
      {ws.is_hidden ? <Badge>Masqué</Badge> : null}
    </>
  );
}

function Facts({ product }: { product: ProductCard }) {
  const team = teamLabel(product.employee_min, product.employee_max);
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <div>
        <dt className="sr-only">Clientèle</dt>
        <dd>
          {product.customer_type === "unknown" ? (
            <Unknown label="Clientèle inconnue" />
          ) : (
            CUSTOMER_TYPE[product.customer_type]
          )}
        </dd>
      </div>
      <div>
        <dt className="sr-only">Pays</dt>
        <dd>{countryName(product.country_code) ?? <Unknown label="Pays inconnu" />}</dd>
      </div>
      <div>
        <dt className="sr-only">Effectif</dt>
        <dd>{team ?? <Unknown label="Effectif inconnu" />}</dd>
      </div>
      <div>
        <dt className="sr-only">Année</dt>
        <dd>{product.start_year ?? <Unknown label="Année inconnue" />}</dd>
      </div>
      <div>
        <dt className="sr-only">Tarification</dt>
        <dd>
          {product.pricing_status === "unknown" ? (
            <Unknown label="Tarification inconnue" />
          ) : (
            PRICING_STATUS[product.pricing_status]
          )}
        </dd>
      </div>
    </dl>
  );
}

/** Visible, keyboard-reachable access to the official site from the preview. */
function OfficialSiteLink({ product, className }: { product: ProductCard; className?: string }) {
  if (!product.website_url) return null;
  return (
    <a
      href={product.website_url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      aria-label={`Ouvrir le site officiel de ${product.name}`}
      className={cn("inline-flex items-center gap-1 text-xs", className)}
    >
      Ouvrir le site officiel <ExternalLink size={12} aria-hidden />
    </a>
  );
}

export function ProductCardView({
  product,
  compact,
  ...actions
}: ActionProps & { product: ProductCard; compact: boolean }) {
  const href = `/w/${actions.workspaceId}/saas/${product.slug}`;
  const asset = product.visual_asset;
  return (
    <article
      aria-label={product.name}
      className={cn(
        "flex h-full flex-col gap-2 rounded-lg border border-border bg-surface",
        compact ? "p-3" : "p-4",
      )}
    >
      <div
        role="group"
        aria-label={
          asset ? `Aperçu authentique de ${product.name}` : `Identité catalogue de ${product.name}`
        }
        data-testid="product-visual-preview"
        className={cn(
          "relative overflow-hidden rounded-md border border-border bg-gradient-to-br from-surface-2 via-surface to-surface-2",
          asset ? "aspect-[16/7]" : "flex items-center gap-3",
          compact ? "min-h-24 p-3" : "min-h-32 p-4",
        )}
      >
        {asset ? (
          <>
            {/* Only authorized, evidence-linked catalog assets reach this DTO. */}
            {product.website_url ? (
              // The preview opens the official site (PRD §24.4); the visible
              // link below is the keyboard path, this one is pointer-only.
              <a
                href={product.website_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                tabIndex={-1}
                aria-hidden
                className="absolute inset-0"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- source-approved external product asset */}
                <img
                  src={asset.url}
                  alt=""
                  width={asset.width ?? undefined}
                  height={asset.height ?? undefined}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              </a>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- source-approved external product asset
              <img
                src={asset.url}
                alt={asset.alt_text}
                width={asset.width ?? undefined}
                height={asset.height ?? undefined}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8 text-white">
              <span className="text-xs font-medium" data-testid="visual-asset-type">
                {VISUAL_ASSET_TYPE[asset.asset_type]}
              </span>
              <span className="flex items-center gap-3">
                <OfficialSiteLink product={product} className="text-white underline" />
                <a
                  href={asset.source_url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1 text-xs underline"
                >
                  Source du visuel <ExternalLink size={12} />
                </a>
              </span>
            </div>
          </>
        ) : (
          <>
            <ProductLogo name={product.name} logoUrl={product.logo_url} size={compact ? 48 : 60} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">
                Aperçu du catalogue
              </p>
              <p className="mt-1 truncate text-sm font-medium">
                {product.categories.find((category) => category.is_primary)?.name ??
                  "Catégorie inconnue"}
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                <ImageOff size={12} aria-hidden /> Aperçu authentique non disponible · Capture
                d’interface non disponible
              </p>
              <OfficialSiteLink product={product} className="mt-1 text-accent hover:underline" />
            </div>
          </>
        )}
      </div>
      <div className="flex items-start gap-3">
        <ProductLogo name={product.name} logoUrl={product.logo_url} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">
            <Link href={href} className="hover:underline">
              {product.name}
            </Link>
          </h2>
          <p className="line-clamp-2 text-sm text-muted">
            {product.tagline ?? product.short_description ?? (
              <Unknown label="Description non renseignée" />
            )}
          </p>
        </div>
        <ProductActions product={product} {...actions} />
      </div>
      <div className="flex flex-wrap gap-1">
        {product.categories.map((c) => (
          <Badge key={c.slug}>{c.name}</Badge>
        ))}
        <StatusBadges product={product} />
      </div>
      {product.acquisition_channels.length ? (
        <div
          className="flex flex-wrap items-center gap-1.5"
          aria-label="Acquisition Channels documentés"
        >
          <span className="text-[11px] font-medium text-muted">Acquisition</span>
          {product.acquisition_channels.slice(0, 3).map((channel) => (
            <a
              key={`${channel.channel_key}:${channel.evidence_id}`}
              href={channel.source_url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              title={channelTitle(channel)}
              data-testid="acquisition-channel"
              className="inline-flex min-w-28 flex-col items-start rounded border border-border px-1.5 py-1 text-[11px] hover:bg-surface-2"
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
                {sourceHost(channel.source_url)} ·{" "}
                {new Date(channel.observed_at).toLocaleDateString("fr-FR")} ·{" "}
                {confidenceLabel(channel.confidence)}
              </span>
            </a>
          ))}
          {product.acquisition_channels.length > 3 ? (
            <span className="text-[11px] text-muted">
              +{product.acquisition_channels.length - 3} sur la fiche
            </span>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted">Acquisition Channels : inconnus / non documentés</p>
      )}
      <div className="mt-auto flex items-end justify-between gap-2">
        <Facts product={product} />
        {product.website_url ? (
          <a
            href={product.website_url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            Site <ExternalLink size={12} />
          </a>
        ) : null}
      </div>
    </article>
  );
}

export function ProductListRow({ product, ...actions }: ActionProps & { product: ProductCard }) {
  const team = teamLabel(product.employee_min, product.employee_max);
  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <ProductLogo name={product.name} logoUrl={product.logo_url} size={24} />
          <Link
            href={`/w/${actions.workspaceId}/saas/${product.slug}`}
            className="font-medium hover:underline"
          >
            {product.name}
          </Link>
          <StatusBadges product={product} />
        </div>
      </td>
      <td className="px-3 py-2">
        {product.categories.find((c) => c.is_primary)?.name ?? <Unknown />}
      </td>
      <td className="px-3 py-2">
        {product.customer_type === "unknown" ? <Unknown /> : CUSTOMER_TYPE[product.customer_type]}
      </td>
      <td className="px-3 py-2">{countryName(product.country_code) ?? <Unknown />}</td>
      <td className="px-3 py-2">{team ?? <Unknown />}</td>
      <td className="px-3 py-2">{product.start_year ?? <Unknown />}</td>
      <td className="px-3 py-2">
        {product.pricing_status === "unknown" ? (
          <Unknown />
        ) : (
          PRICING_STATUS[product.pricing_status]
        )}
      </td>
      <td className="min-w-52 px-3 py-2">
        {product.acquisition_channels.length ? (
          <ul className="space-y-1">
            {product.acquisition_channels.map((channel) => (
              <li key={`${channel.channel_key}:${channel.evidence_id}`}>
                <a
                  href={channel.source_url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  title={channelTitle(channel)}
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  {channel.role === "primary" ? "★ " : ""}
                  {ACQUISITION_CHANNEL[channel.channel_key] ?? channel.channel_key}
                  <Badge tone={CHANNEL_STATUS_TONE[channel.status]}>
                    {ACQUISITION_CHANNEL_STATUS[channel.status] ?? channel.status}
                  </Badge>
                </a>
                <span className="block text-[10px] text-muted">
                  {sourceHost(channel.source_url)} ·{" "}
                  {new Date(channel.observed_at).toLocaleDateString("fr-FR")} ·{" "}
                  {confidenceLabel(channel.confidence)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-muted">Inconnus / non documentés</span>
        )}
      </td>
      <td className="px-3 py-2">
        <ProductActions product={product} {...actions} />
      </td>
    </tr>
  );
}
