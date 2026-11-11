import Link from "next/link";
import { z } from "zod";
import { UUIDSchema } from "@sor/contracts";
import { EmptyState, Unknown } from "@/components/ui/states";
import {
  BILLING_MODEL,
  CUSTOMER_TYPE,
  PRICING_STATUS,
  countryName,
  formatMoney,
  teamLabel,
} from "@/lib/labels";
import { compareProducts } from "@/lib/services/catalog";
import { canEdit, requireWorkspace } from "@/lib/workspace";

export const metadata = { title: "Comparer — SaaS Opportunity Radar" };

export default async function ComparePage(props: PageProps<"/w/[workspaceId]/compare">) {
  const { workspaceId } = await props.params;
  const { ids } = await props.searchParams;
  const { client, membership } = await requireWorkspace(workspaceId);
  const parsed = z
    .array(UUIDSchema)
    .min(2)
    .max(10)
    .safeParse(typeof ids === "string" ? ids.split(",").filter(Boolean) : []);
  if (!parsed.success) {
    return (
      <EmptyState title="Sélectionnez entre 2 et 10 SaaS">
        Cochez des SaaS dans Saved ou dans la table des concurrents d’une fiche, puis lancez la
        comparaison.
      </EmptyState>
    );
  }
  const { data, omitted_count } = await compareProducts(client, parsed.data);
  const rows: Array<[string, (p: (typeof data)[number]) => React.ReactNode]> = [
    ["Catégorie", (p) => p.categories.find((c) => c.is_primary)?.name ?? <Unknown />],
    [
      "Clientèle",
      (p) => (p.customer_type === "unknown" ? <Unknown /> : CUSTOMER_TYPE[p.customer_type]),
    ],
    ["Pays", (p) => countryName(p.country_code) ?? <Unknown />],
    ["Création", (p) => p.founded_year ?? <Unknown />],
    ["Effectif", (p) => teamLabel(p.employee_min, p.employee_max) ?? <Unknown />],
    ["Tarification", (p) => PRICING_STATUS[p.pricing_status]],
    [
      "Modèle",
      (p) =>
        p.billing_models.length ? (
          p.billing_models.map((b) => BILLING_MODEL[b]).join(", ")
        ) : (
          <Unknown />
        ),
    ],
    [
      "Prix d’entrée (indicatif)",
      (p) =>
        p.entry_monthly_eur !== null ? (
          `${formatMoney(p.entry_monthly_eur, "EUR")}/mois`
        ) : (
          <Unknown />
        ),
    ],
    [
      "Essai / version gratuite",
      (p) => `${p.has_free_trial ? "essai" : "—"} / ${p.has_free_plan ? "gratuite" : "—"}`,
    ],
    [
      "Fonctionnalités observées",
      (p) => (p.features.length ? p.features.join(", ") : <Unknown label="Aucune recensée" />),
    ],
    [
      "Intégrations observées",
      (p) =>
        p.integrations.length ? p.integrations.join(", ") : <Unknown label="Aucune recensée" />,
    ],
  ];
  return (
    <section className="space-y-3">
      <h1 className="text-xl font-semibold">Comparaison</h1>
      <p className="text-sm text-muted">
        Tableau déterministe des données du catalogue. « Aucune recensée » ne prouve pas l’absence.
      </p>
      {data.length > 0 && canEdit(membership.role) ? (
        <Link
          className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
          href={`/w/${workspaceId}/ask-ai?products=${data
            .slice(0, 5)
            .map((product) => product.id)
            .join(",")}`}
        >
          Étudier {data.length > 5 ? "les cinq premiers produits" : "la sélection"} avec Ask AI
        </Link>
      ) : null}
      {omitted_count > 0 ? (
        <p className="text-sm text-warning">{omitted_count} SaaS non visible(s) omis.</p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2">
            <tr>
              <th className="px-3 py-2">
                <span className="sr-only">Critère</span>
              </th>
              {data.map((p) => (
                <th key={p.id} className="px-3 py-2">
                  <Link href={`/w/${workspaceId}/saas/${p.slug}`} className="hover:underline">
                    {p.name}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, cell]) => (
              <tr key={label} className="border-t border-border align-top">
                <th scope="row" className="px-3 py-2 font-normal text-muted">
                  {label}
                </th>
                {data.map((p) => (
                  <td key={p.id} className="px-3 py-2">
                    {cell(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
