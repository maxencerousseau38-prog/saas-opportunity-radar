import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { ClusterList, type ClusterRow } from "@/components/pain/cluster-summary";
import { RunStatus } from "@/components/pain/run-status";
import { ApiError } from "@/lib/api/http";
import { GAP_TYPE, RUN_LIMITATION, formatDate } from "@/lib/labels";
import { getRun, listClusters, listGaps } from "@/lib/services/pain-points";
import { canAdmin, canEdit, requireWorkspace } from "@/lib/workspace";

export const metadata = { title: "Analyse de problèmes — SaaS Opportunity Radar" };

export default async function RunPage(
  props: PageProps<"/w/[workspaceId]/opportunities/runs/[runId]">,
) {
  const { workspaceId, runId } = await props.params;
  const { client, membership } = await requireWorkspace(workspaceId);
  const run = await getRun(client, workspaceId, runId).catch((err: unknown) => {
    if (err instanceof ApiError && err.code === "NOT_FOUND") notFound();
    throw err;
  });
  const [clusters, gaps] = await Promise.all([
    listClusters(client, workspaceId, run.id),
    listGaps(client, workspaceId, run.id),
  ]);
  const limitations = (run.limitations as Array<{ code: string; count?: number }>) ?? [];
  return (
    <div className="space-y-6">
      <nav className="text-sm">
        <Link className="text-accent underline" href={`/w/${workspaceId}/opportunities`}>
          ← Opportunities
        </Link>
      </nav>
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{run.title}</h1>
        <RunStatus
          workspaceId={workspaceId}
          runId={run.id}
          initialStatus={run.status}
          canEdit={canEdit(membership.role)}
          canAdmin={canAdmin(membership.role)}
        />
        <p className="text-sm text-muted">
          {run.feedback_considered} avis considérés · {run.problems_extracted} problèmes ·{" "}
          {run.clusters_created} cluster(s) · {run.opportunities_generated} hypothèse(s) · créée le{" "}
          {formatDate(run.created_at)}
        </p>
        <p className="text-sm">
          Périmètre :{" "}
          {run.products.map((p, i) => (
            <span key={p.product_id}>
              {i > 0 ? ", " : ""}
              {p.slug ? (
                <Link className="text-accent underline" href={`/w/${workspaceId}/saas/${p.slug}`}>
                  {p.name}
                </Link>
              ) : (
                "SaaS non visible"
              )}
            </span>
          ))}
        </p>
      </header>
      {limitations.length > 0 ? (
        <section
          aria-labelledby="limits-title"
          className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
        >
          <h2 id="limits-title" className="font-medium">
            Limites de cette analyse
          </h2>
          <ul className="list-disc pl-5">
            {limitations.map((l) => (
              <li key={l.code}>
                {RUN_LIMITATION[l.code] ?? l.code}
                {l.count ? ` (${l.count})` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="space-y-2" aria-labelledby="run-clusters">
        <h2 id="run-clusters" className="text-lg font-semibold">
          Clusters
        </h2>
        {clusters.length === 0 ? (
          <EmptyState title="Aucun cluster">
            Pas de problème récurrent trouvé (ou analyse en cours). Les plaintes isolées ne forment
            pas de cluster.
          </EmptyState>
        ) : (
          <ClusterList workspaceId={workspaceId} clusters={clusters as ClusterRow[]} />
        )}
      </section>
      <section className="space-y-2" aria-labelledby="run-gaps">
        <h2 id="run-gaps" className="text-lg font-semibold">
          Lacunes du marché
        </h2>
        <p className="text-xs text-muted">
          Ne pas observer de solution ne prouve pas l’absence de concurrence.
        </p>
        {gaps.length === 0 ? (
          <EmptyState title="Aucune lacune identifiée" />
        ) : (
          <ul className="space-y-2">
            {gaps.map((g) => (
              <li key={g.id} className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium">
                  {g.title} <Badge>{GAP_TYPE[g.gap_type] ?? g.gap_type}</Badge>{" "}
                  <span className="text-xs text-muted">
                    Confiance {Math.round(Number(g.confidence))}/100
                  </span>
                </p>
                <p className="text-muted">{g.description}</p>
                <p className="text-xs text-muted">{g.evidence.length} preuve(s) citée(s)</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
