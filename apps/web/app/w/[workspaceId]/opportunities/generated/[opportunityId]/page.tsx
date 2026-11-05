import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Unknown } from "@/components/ui/states";
import { OpportunityEditor } from "@/components/pain/opportunity-editor";
import { OpportunityTags } from "@/components/pain/opportunity-tags";
import { workspaceRepo } from "@sor/database";
import { ApiError } from "@/lib/api/http";
import { EXCLUSION_STATUS } from "@/lib/labels";
import { getOpportunity } from "@/lib/services/pain-points";
import { canEdit, requireWorkspace } from "@/lib/workspace";

export const metadata = { title: "Opportunité générée — SaaS Opportunity Radar" };

export default async function GeneratedOpportunityPage(
  props: PageProps<"/w/[workspaceId]/opportunities/generated/[opportunityId]">,
) {
  const { workspaceId, opportunityId } = await props.params;
  const { client, membership } = await requireWorkspace(workspaceId);
  const o = await getOpportunity(client, workspaceId, opportunityId).catch((err: unknown) => {
    if (err instanceof ApiError && err.code === "NOT_FOUND") notFound();
    throw err;
  });
  const tags = await workspaceRepo.listTags(client, workspaceId);
  const row = (label: string, value: string | null) => (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="text-sm">{value ?? <Unknown label="Non précisé" />}</dd>
    </div>
  );
  return (
    <div className="space-y-6">
      <nav className="text-sm">
        <Link className="text-accent underline" href={`/w/${workspaceId}/opportunities`}>
          ← Opportunities
        </Link>
      </nav>
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">{o.name}</h1>
        <div className="flex flex-wrap gap-2">
          <Badge>Hypothèse non notée</Badge>
          {o.exclusion_status !== "eligible" ? (
            <Badge tone="warning">
              {EXCLUSION_STATUS[o.exclusion_status] ?? o.exclusion_status}
            </Badge>
          ) : null}
        </div>
        <p className="text-sm">{o.description}</p>
      </header>
      <OpportunityEditor
        workspaceId={workspaceId}
        id={o.id}
        status={o.status}
        isFavorite={o.is_favorite}
        notes={o.notes}
        canEdit={canEdit(membership.role)}
      />
      <section className="space-y-1" aria-labelledby="tags-title">
        <h2 id="tags-title" className="text-sm font-medium">
          Tags
        </h2>
        <OpportunityTags
          workspaceId={workspaceId}
          opportunityId={o.id}
          canEdit={canEdit(membership.role)}
          tags={tags.map((t) => ({
            id: t.id,
            name: t.name,
            assigned: t.tag_assignments.some((a) => a.generated_opportunity_id === o.id),
          }))}
        />
      </section>
      <dl className="grid gap-3 sm:grid-cols-2">
        {row("Problème à résoudre", o.problem_statement)}
        {row("ICP", o.target_persona)}
        {row("Proposition de valeur", o.value_proposition)}
        {row("Solution envisageable", o.proposed_solution)}
        {row("Différenciation", o.differentiation)}
        {row("Modèle économique (hypothèse)", o.business_model_hypothesis)}
        {row("Pricing (hypothèse)", o.pricing_hypothesis)}
        {row("Faisabilité technique", o.technical_feasibility_notes)}
        {row("Distribution", o.distribution_hypothesis)}
        {row("À valider", o.validation_needed)}
      </dl>
      <section className="space-y-1 text-sm" aria-labelledby="sources-title">
        <h2 id="sources-title" className="font-medium">
          Preuves et concurrents
        </h2>
        <ul className="list-disc pl-5">
          {o.clusters.map((c) => (
            <li key={c.cluster_id}>
              Cluster :{" "}
              <Link
                className="text-accent underline"
                href={`/w/${workspaceId}/opportunities/clusters/${c.cluster_id}`}
              >
                {c.name ?? "cluster"}
              </Link>
            </li>
          ))}
          {o.products.map((p) => (
            <li key={`${p.product_id}-${p.role}`}>
              {p.role === "existing_competitor" ? "Concurrent existant" : "SaaS source des preuves"}{" "}
              :{" "}
              {p.slug ? (
                <Link className="text-accent underline" href={`/w/${workspaceId}/saas/${p.slug}`}>
                  {p.name}
                </Link>
              ) : (
                <Unknown label="SaaS non visible" />
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
