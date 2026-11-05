import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Unknown } from "@/components/ui/states";
import { ClusterReview } from "@/components/pain/cluster-review";
import { CountsLine, type ClusterRow } from "@/components/pain/cluster-summary";
import { ApiError } from "@/lib/api/http";
import {
  CLUSTER_REVIEW,
  FREQUENCY_LABEL,
  PROBLEM_CATEGORY,
  RESOLUTION,
  SAMPLE_LIMITATION,
  formatDate,
} from "@/lib/labels";
import {
  clusterEvidence,
  clusterHistory,
  getCluster,
  listClusters,
} from "@/lib/services/pain-points";
import { canEdit, requireWorkspace } from "@/lib/workspace";
import { AnalyzeButton } from "@/components/analysis/analyze-form";
import { AnalysisList, type AnalysisListRow } from "@/components/analysis/analysis-list";
import { analysisDefaults, listAnalyses } from "@/lib/services/analyses";

export const metadata = { title: "Pain Point Cluster — SaaS Opportunity Radar" };

export default async function ClusterPage(
  props: PageProps<"/w/[workspaceId]/opportunities/clusters/[clusterId]">,
) {
  const { workspaceId, clusterId } = await props.params;
  const { client, membership } = await requireWorkspace(workspaceId);
  const cluster = await getCluster(client, workspaceId, clusterId).catch((err: unknown) => {
    if (err instanceof ApiError && err.code === "NOT_FOUND") notFound();
    throw err;
  });
  const [evidence, history, siblings, analyses, defaults] = await Promise.all([
    clusterEvidence(client, workspaceId, cluster.id),
    clusterHistory(client, workspaceId, cluster.id),
    listClusters(client, workspaceId, cluster.run_id),
    listAnalyses(client, workspaceId, { limit: 10, cluster_id: cluster.id }),
    analysisDefaults(client, workspaceId),
  ]);
  const names = new Map(cluster.products.map((p) => [p.product_id, p.name]));
  const resolution = cluster.resolution_breakdown as {
    resolved?: number;
    unresolved?: number;
    unknown?: number;
  };
  return (
    <div className="space-y-6">
      <nav className="text-sm">
        <Link
          className="text-accent underline"
          href={`/w/${workspaceId}/opportunities/runs/${cluster.run_id}`}
        >
          ← Analyse
        </Link>
      </nav>
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">{cluster.name}</h1>
        <div className="flex flex-wrap gap-2">
          <Badge>{PROBLEM_CATEGORY[cluster.problem_category] ?? cluster.problem_category}</Badge>
          <Badge>{FREQUENCY_LABEL[cluster.frequency_label] ?? cluster.frequency_label}</Badge>
          <Badge>{CLUSTER_REVIEW[cluster.review_status] ?? cluster.review_status}</Badge>
        </div>
        <p className="text-sm">{cluster.description}</p>
        <CountsLine c={cluster as ClusterRow} />
        {canEdit(membership.role) && cluster.review_status !== "rejected" ? (
          <AnalyzeButton
            workspaceId={workspaceId}
            subject={{ type: "pain_point_cluster", cluster_id: cluster.id }}
            defaults={defaults}
            label="Analyser l’opportunité de ce problème"
          />
        ) : null}
        {analyses.data.length > 0 ? (
          <AnalysisList workspaceId={workspaceId} rows={analyses.data as AnalysisListRow[]} />
        ) : null}
      </header>

      <section className="grid gap-4 sm:grid-cols-2" aria-label="Indicateurs du cluster">
        <div className="rounded-lg border border-border p-3 text-sm">
          <h2 className="font-medium">SaaS concernés</h2>
          <ul className="mt-1 space-y-1">
            {cluster.products.map((p) => (
              <li key={p.product_id}>
                {p.slug ? (
                  <Link className="text-accent underline" href={`/w/${workspaceId}/saas/${p.slug}`}>
                    {p.name}
                  </Link>
                ) : (
                  <Unknown label="SaaS non visible" />
                )}{" "}
                — {p.count} retour(s)
                {p.relative_frequency !== null
                  ? `, ${(p.relative_frequency * 100).toFixed(1)} % des avis connus`
                  : " (volume total d’avis inconnu)"}
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-1 rounded-lg border border-border p-3 text-sm">
          <h2 className="font-medium">Gravité, résolution et confiance</h2>
          <p>Gravité moyenne : {cluster.severity_score ?? <Unknown />}</p>
          <p>
            {RESOLUTION.resolved} : {resolution.resolved ?? 0} · {RESOLUTION.unresolved} :{" "}
            {resolution.unresolved ?? 0} · {RESOLUTION.unknown} : {resolution.unknown ?? 0}
          </p>
          <p>Confiance : {Math.round(Number(cluster.confidence_score))}/100</p>
          <p>
            Première détection : {formatDate(cluster.first_detected_at)} · dernière observation :{" "}
            {formatDate(cluster.last_observed_at) ?? <Unknown />}
          </p>
          {cluster.target_persona ? <p>Profil concerné : {cluster.target_persona}</p> : null}
        </div>
      </section>

      <section className="space-y-2 text-sm" aria-labelledby="time-title">
        <h2 id="time-title" className="font-medium">
          Évolution dans le temps
        </h2>
        {cluster.monthly_counts.length === 0 ? (
          <p className="text-muted">Dates de publication inconnues.</p>
        ) : (
          <table className="text-left">
            <thead>
              <tr>
                <th className="pr-6 font-medium">Mois</th>
                <th className="font-medium">Retours</th>
              </tr>
            </thead>
            <tbody>
              {cluster.monthly_counts.map((m) => (
                <tr key={m.month}>
                  <td className="pr-6">{m.month}</td>
                  <td>{m.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {history.length > 1 ? (
          <p className="text-xs text-muted">
            Historique :{" "}
            {history.map((h) => `${formatDate(h.observed_at)} → ${h.feedback_count}`).join(" · ")}
          </p>
        ) : null}
      </section>

      <section
        className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
        aria-label="Limites de l’échantillon"
      >
        <ul className="list-disc pl-5">
          {cluster.sample_limitations.map((l) => (
            <li key={l}>{SAMPLE_LIMITATION[l] ?? l}</li>
          ))}
        </ul>
      </section>

      <ClusterReview
        workspaceId={workspaceId}
        clusterId={cluster.id}
        name={cluster.name}
        description={cluster.description}
        canEdit={canEdit(membership.role)}
        otherClusters={siblings
          .filter((c) => c.id !== cluster.id)
          .map((c) => ({ id: c.id, name: c.name }))}
        evidence={evidence.map((e) => ({
          ...e,
          product_name: e.product_id ? (names.get(e.product_id) ?? null) : null,
        }))}
      />
    </div>
  );
}
