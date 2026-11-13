import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { ClusterList, type ClusterRow } from "@/components/pain/cluster-summary";
import { NewRunForm } from "@/components/pain/new-run-form";
import { EXCLUSION_STATUS, OPPORTUNITY_STATUS, RUN_STATUS, formatDate } from "@/lib/labels";
import { listClusters, listOpportunities, listRuns } from "@/lib/services/pain-points";
import { canEdit, requireWorkspace } from "@/lib/workspace";
import { NewAnalysisForm } from "@/components/analysis/analyze-form";
import { AnalysisList, type AnalysisListRow } from "@/components/analysis/analysis-list";
import { analysisDefaults, listAnalyses } from "@/lib/services/analyses";
import { workspaceRepo } from "@sor/database";

export const metadata = { title: "Opportunities — SaaS Opportunity Radar" };

export default async function OpportunitiesPage(
  props: PageProps<"/w/[workspaceId]/opportunities">,
) {
  const { workspaceId } = await props.params;
  const { client, membership } = await requireWorkspace(workspaceId);
  const editor = canEdit(membership.role);
  const [runs, clusters, opportunities, products, categories, tags, analyses, defaults] =
    await Promise.all([
      listRuns(client, workspaceId, null),
      listClusters(client, workspaceId, null),
      listOpportunities(client, workspaceId),
      editor
        ? client.from("saas_products").select("id, name").order("name").limit(500)
        : Promise.resolve({ data: [] }),
      editor
        ? client.from("categories").select("slug, name").eq("is_user_visible", true).order("name")
        : Promise.resolve({ data: [] }),
      workspaceRepo.listTags(client, workspaceId),
      listAnalyses(client, workspaceId, { limit: 30 }),
      analysisDefaults(client, workspaceId),
    ]);
  const tagsOf = (id: string) =>
    tags.filter((t) => t.tag_assignments.some((a) => a.generated_opportunity_id === id));
  const visibleClusters = clusters.filter((c) => c.review_status !== "rejected").slice(0, 30);
  return (
    <div className="space-y-8">
      <section className="space-y-3" aria-labelledby="pain-title">
        <h1 id="pain-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Problèmes clients récurrents
        </h1>
        <p className="text-sm text-muted">
          Regroupe les plaintes de plusieurs SaaS concurrents en problèmes reliés à leurs preuves.
          Une analyse d’opportunité (ci-dessous) peut ensuite évaluer un cluster ou une hypothèse.
        </p>
        {editor ? (
          <NewRunForm
            workspaceId={workspaceId}
            products={products.data ?? []}
            categories={categories.data ?? []}
          />
        ) : null}
        {runs.data.length === 0 ? (
          <EmptyState title="Aucune analyse pour l’instant">
            Importez des avis (Settings → Imports), puis lancez une analyse sur un ou plusieurs
            SaaS.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {runs.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <Link
                  className="font-medium text-accent underline"
                  href={`/w/${workspaceId}/opportunities/runs/${r.id}`}
                >
                  {r.title}
                </Link>
                <Badge>{RUN_STATUS[r.status] ?? r.status}</Badge>
                <span className="text-xs text-muted">
                  {r.feedback_considered} avis · {r.clusters_created} cluster(s) ·{" "}
                  {r.opportunities_generated} hypothèse(s) · {formatDate(r.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="analyses-title">
        <h2 id="analyses-title" className="text-lg font-semibold">
          Analyses d’opportunité
        </h2>
        <p className="text-sm text-muted">
          Évalue un SaaS (depuis sa fiche), un ensemble de concurrents, une catégorie, un cluster ou
          une hypothèse : score sur 100, volonté de payer, confiance, couverture et verdict,
          calculés par le serveur à partir des preuves.
        </p>
        {editor ? (
          <NewAnalysisForm
            workspaceId={workspaceId}
            products={products.data ?? []}
            categories={categories.data ?? []}
            defaults={defaults}
          />
        ) : null}
        {analyses.data.length === 0 ? (
          <EmptyState title="Aucune analyse d’opportunité">
            Lancez « Analyze Opportunity » depuis la fiche d’un SaaS, ou analysez un ensemble de
            concurrents ou une catégorie ci-dessus.
          </EmptyState>
        ) : (
          <AnalysisList workspaceId={workspaceId} rows={analyses.data as AnalysisListRow[]} />
        )}
      </section>

      <section className="space-y-3" aria-labelledby="clusters-title">
        <h2 id="clusters-title" className="text-lg font-semibold">
          Pain Point Clusters
        </h2>
        {visibleClusters.length === 0 ? (
          <EmptyState title="Aucun cluster">
            Les clusters apparaissent à la fin d’une analyse.
          </EmptyState>
        ) : (
          <ClusterList workspaceId={workspaceId} clusters={visibleClusters as ClusterRow[]} />
        )}
      </section>

      <section className="space-y-3" aria-labelledby="generated-title">
        <h2 id="generated-title" className="text-lg font-semibold">
          Opportunités générées (hypothèses)
        </h2>
        {opportunities.length === 0 ? (
          <EmptyState title="Aucune hypothèse">
            Une analyse peut aussi conclure qu’un problème réel n’est pas une opportunité
            attractive.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {opportunities.map((o) => (
              <li key={o.id} className="space-y-1 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    className="font-medium text-accent underline"
                    href={`/w/${workspaceId}/opportunities/generated/${o.id}`}
                  >
                    {o.name}
                  </Link>
                  <Badge>Hypothèse non notée</Badge>
                  <Badge>{OPPORTUNITY_STATUS[o.status] ?? o.status}</Badge>
                  {o.exclusion_status !== "eligible" ? (
                    <Badge tone="warning">
                      {EXCLUSION_STATUS[o.exclusion_status] ?? o.exclusion_status}
                    </Badge>
                  ) : null}
                  {o.is_favorite ? <Badge tone="accent">Favori</Badge> : null}
                  {tagsOf(o.id).map((t) => (
                    <Badge key={t.id}>#{t.name}</Badge>
                  ))}
                </div>
                <p className="text-muted">{o.problem_statement}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
