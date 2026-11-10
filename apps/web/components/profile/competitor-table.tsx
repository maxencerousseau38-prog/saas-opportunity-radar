"use client";
import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, Unknown } from "@/components/ui/states";
import { PRICING_STATUS, RELATIONSHIP, countryName, formatMoney } from "@/lib/labels";
import type { CompetitorView } from "@/lib/services/catalog-types";

const FACETS: Array<[keyof CompetitorView["facets"] | "direct" | "indirect", string]> = [
  ["direct", "Concurrents directs"],
  ["indirect", "Concurrents indirects"],
  ["cheaper", "Moins chers"],
  ["more_advanced", "Plus avancés"],
  ["free", "Gratuits"],
  ["french", "Français"],
  ["us", "Américains"],
];

export function CompetitorTable({
  workspaceId,
  subjectId,
  competitors,
}: {
  workspaceId: string;
  subjectId: string;
  competitors: CompetitorView[];
}) {
  const [facet, setFacet] = useState<string>("all");
  const [selected, setSelected] = useState<string[]>([]);
  if (competitors.length === 0) {
    return (
      <EmptyState title="Aucun concurrent recensé">
        La recherche de concurrents arrive avec l’enrichissement (Sprint 3).
      </EmptyState>
    );
  }
  const shown = competitors.filter((c) =>
    facet === "all"
      ? true
      : facet === "direct" || facet === "indirect"
        ? c.relationship_type === facet
        : c.facets[facet as keyof CompetitorView["facets"]],
  );
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(0, 9)));
  return (
    <div className="space-y-3">
      <div role="group" aria-label="Segments" className="flex flex-wrap gap-1">
        {[["all", "Tous"] as const, ...FACETS].map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={facet === key}
            onClick={() => setFacet(key)}
            className={`rounded-full border px-2 py-0.5 text-xs ${facet === key ? "border-accent text-accent" : "border-border text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">
        « Moins cher » compare les prix d’entrée convertis ; « plus avancé » compare le nombre de
        fonctionnalités observées. Ce sont des indicateurs, pas des preuves.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1 pr-2">
                <span className="sr-only">Comparer</span>
              </th>
              <th className="py-1 pr-3">Nom</th>
              <th className="py-1 pr-3">Relation</th>
              <th className="py-1 pr-3">Catégorie</th>
              <th className="py-1 pr-3">Prix d’entrée</th>
              <th className="py-1 pr-3">Pays</th>
              <th className="py-1 pr-3">Fonctionnalités principales</th>
              <th className="py-1">Différence</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.link_id} className="border-t border-border align-top">
                <td className="py-1.5 pr-2">
                  <input
                    type="checkbox"
                    aria-label={`Comparer ${c.product.name}`}
                    className="accent-accent"
                    checked={selected.includes(c.product.id)}
                    onChange={() => toggle(c.product.id)}
                  />
                </td>
                <td className="py-1.5 pr-3">
                  <Link
                    className="font-medium hover:underline"
                    href={`/w/${workspaceId}/saas/${c.product.slug}`}
                  >
                    {c.product.name}
                  </Link>
                  <p className="text-xs text-muted">{c.product.tagline}</p>
                </td>
                <td className="py-1.5 pr-3">{RELATIONSHIP[c.relationship_type]}</td>
                <td className="py-1.5 pr-3">
                  {c.product.categories.find((x) => x.is_primary)?.name ?? <Unknown />}
                </td>
                <td className="py-1.5 pr-3">
                  {c.product.entry_monthly_eur !== null
                    ? `${formatMoney(c.product.entry_monthly_eur, "EUR")}/mois`
                    : PRICING_STATUS[c.product.pricing_status]}
                </td>
                <td className="py-1.5 pr-3">
                  {countryName(c.product.country_code) ?? <Unknown />}
                </td>
                <td className="py-1.5 pr-3 text-xs">
                  {c.product.available_features.slice(0, 4).join(", ") || <Unknown />}
                </td>
                <td className="py-1.5 text-xs">
                  {c.explanation ?? <Unknown label="Non renseignée" />}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.facets.cheaper ? <Badge>Moins cher</Badge> : null}
                    {c.facets.more_advanced ? <Badge>Plus avancé</Badge> : null}
                    {c.facets.free ? <Badge>Gratuit</Badge> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          aria-disabled={selected.length === 0}
          className={buttonVariants({
            size: "sm",
            className: selected.length === 0 ? "pointer-events-none opacity-50" : "",
          })}
          href={`/w/${workspaceId}/compare?ids=${[subjectId, ...selected].join(",")}`}
        >
          Comparer la sélection ({selected.length + 1})
        </Link>
        <span className="text-xs text-muted">
          La comparaison assistée par l’IA n’est pas disponible dans cette version.
        </span>
      </div>
    </div>
  );
}
