"use client";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { ProductCard } from "@sor/contracts";
import { Badge } from "@/components/ui/badge";
import { Unknown } from "@/components/ui/states";
import { CUSTOMER_TYPE, PRICING_STATUS, countryName, isDemoUrl, teamLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { ProductActions, type ActionProps } from "./product-actions";

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

export function ProductCardView({
  product,
  compact,
  ...actions
}: ActionProps & { product: ProductCard; compact: boolean }) {
  const href = `/w/${actions.workspaceId}/saas/${product.slug}`;
  return (
    <article
      aria-label={product.name}
      className={cn(
        "flex h-full flex-col gap-2 rounded-lg border border-border bg-surface",
        compact ? "p-3" : "p-4",
      )}
    >
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
      <td className="px-3 py-2">
        <ProductActions product={product} {...actions} />
      </td>
    </tr>
  );
}
