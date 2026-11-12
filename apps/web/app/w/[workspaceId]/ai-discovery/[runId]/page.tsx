import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Unknown } from "@/components/ui/states";
import { CandidateReview } from "@/components/discovery/candidate-review";
import { DiscoveryRunStatus } from "@/components/discovery/discovery-run-status";
import { ApiError } from "@/lib/api/http";
import {
  CANDIDATE_REVIEW,
  DISCOVERY_CHANNEL,
  DISCOVERY_LIMITATION,
  EXCLUSION_STATUS,
  IDENTITY_DECISION,
  RELIABILITY,
  SOURCE_REPORT_STATUS,
  formatDate,
  rejectionLabel,
} from "@/lib/labels";
import { getRun, runResults } from "@/lib/services/discovery";
import { canAdmin, canEdit, requireWorkspace } from "@/lib/workspace";

export const metadata = { title: "Recherche AI Discovery — SaaS Opportunity Radar" };

interface ReportEntry {
  source_key: string;
  channel: string;
  status: string;
  requests: number;
  leads: number;
  limits_reached: string[];
  errors: string[];
}

function FilterList({ filters }: { filters: unknown }) {
  const entries = Object.entries((filters ?? {}) as Record<string, unknown>).filter(
    ([k, v]) =>
      !["include_hidden"].includes(k) && v !== undefined && !(Array.isArray(v) && v.length === 0),
  );
  if (entries.length === 0) return <span className="text-muted">aucun</span>;
  return (
    <ul className="list-disc pl-5">
      {entries.map(([k, v]) => (
        <li key={k}>
          <code>{k}</code> : {JSON.stringify(v)}
        </li>
      ))}
    </ul>
  );
}

export default async function DiscoveryRunPage(
  props: PageProps<"/w/[workspaceId]/ai-discovery/[runId]">,
) {
  const { workspaceId, runId } = await props.params;
  const { client, membership } = await requireWorkspace(workspaceId);
  const run = await getRun(client, workspaceId, runId).catch((err: unknown) => {
    if (err instanceof ApiError && (err.code === "NOT_FOUND" || err.code === "VALIDATION_ERROR")) {
      notFound();
    }
    throw err;
  });
  const results = await runResults(client, workspaceId, run.id);
  const report = (run.sources_report ?? []) as unknown as ReportEntry[];
  const limitations = (run.limitations ?? []) as unknown as Array<{ code: string; detail: string }>;
  const editable = canEdit(membership.role);
  const finished = ["completed", "partial", "needs_review"].includes(run.status);

  return (
    <div className="space-y-6">
      <nav className="text-sm">
        <Link className="text-accent underline" href={`/w/${workspaceId}/ai-discovery`}>
          ← AI Discovery
        </Link>
      </nav>
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{run.title}</h1>
        <DiscoveryRunStatus
          workspaceId={workspaceId}
          runId={run.id}
          initialStatus={run.status}
          canEdit={editable}
          canAdmin={canAdmin(membership.role)}
        />
        <p className="text-sm" data-testid="run-prompt">
          <span className="text-muted">Demande : </span>
          {run.prompt}
        </p>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3" data-testid="run-counts">
          <div>
            <dt className="text-muted">Candidats trouvés</dt>
            <dd>{run.candidates_found}</dd>
          </div>
          <div>
            <dt className="text-muted">Doublons éliminés</dt>
            <dd>{run.duplicates_removed}</dd>
          </div>
          <div>
            <dt className="text-muted">Candidats retenus</dt>
            <dd>{run.candidates_retained}</dd>
          </div>
          <div>
            <dt className="text-muted">Écartés / à vérifier</dt>
            <dd>
              {run.candidates_rejected} / {run.candidates_needs_review}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Date</dt>
            <dd>{formatDate(run.created_at)}</dd>
          </div>
          <div>
            <dt className="text-muted">Durée</dt>
            <dd>
              {run.duration_seconds === null ? <Unknown label="—" /> : `${run.duration_seconds} s`}
            </dd>
          </div>
        </dl>
      </header>

      <section aria-labelledby="filters-title" className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <h2 id="filters-title" className="font-medium">
            Filtres explicites
          </h2>
          <FilterList filters={run.explicit_filters} />
        </div>
        <div>
          <h2 className="font-medium">Filtres interprétés</h2>
          {run.interpreted_filters ? (
            <FilterList filters={run.interpreted_filters} />
          ) : (
            <span className="text-muted">pas encore disponibles</span>
          )}
        </div>
      </section>

      <section aria-labelledby="sources-title" className="space-y-2">
        <h2 id="sources-title" className="text-lg font-medium">
          Sources explorées
        </h2>
        {report.length === 0 ? (
          <p className="text-sm text-muted">Pas encore de rapport de sources.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1">Source</th>
                  <th className="py-1">Canal</th>
                  <th className="py-1">Statut</th>
                  <th className="py-1">Requêtes</th>
                  <th className="py-1">Pistes</th>
                  <th className="py-1">Limites / erreurs</th>
                </tr>
              </thead>
              <tbody>
                {report.map((r) => (
                  <tr key={`${r.source_key}-${r.channel}`} className="border-t border-border">
                    <td className="py-1.5">{r.source_key}</td>
                    <td className="py-1.5">{DISCOVERY_CHANNEL[r.channel] ?? r.channel}</td>
                    <td className="py-1.5">
                      <Badge tone={r.status === "consulted" ? "success" : "warning"}>
                        {SOURCE_REPORT_STATUS[r.status] ?? r.status}
                      </Badge>
                    </td>
                    <td className="py-1.5">{r.requests}</td>
                    <td className="py-1.5">{r.leads}</td>
                    <td className="py-1.5 text-muted">
                      {[...r.limits_reached, ...r.errors].join(" ; ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {limitations.length > 0 ? (
        <section
          aria-labelledby="limits-title"
          className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
        >
          <h2 id="limits-title" className="font-medium">
            Limites de cette recherche
          </h2>
          <ul className="list-disc pl-5">
            {limitations.map((l) => (
              <li key={`${l.code}-${l.detail}`}>
                {DISCOVERY_LIMITATION[l.code] ?? l.code}
                {l.detail ? ` (${l.detail})` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="candidates-title" className="space-y-3">
        <h2 id="candidates-title" className="text-lg font-medium">
          Résultats détaillés
        </h2>
        {results.data.length === 0 ? (
          <EmptyState title="Aucun candidat">
            {finished
              ? "La recherche n’a trouvé aucun SaaS vérifiable. Aucun résultat n’est inventé quand une source ne répond pas."
              : "Les candidats apparaîtront à la fin de la recherche."}
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {results.data.map((c) => {
              const name = c.product?.name ?? "SaaS";
              return (
                <li
                  key={c.id}
                  className="space-y-2 rounded-lg border border-border p-3"
                  data-testid="discovery-candidate"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {c.product?.profile_slug ? (
                      <Link
                        className="font-medium text-accent underline"
                        href={`/w/${workspaceId}/saas/${c.product.profile_slug}`}
                      >
                        {name}
                      </Link>
                    ) : (
                      <span className="font-medium">{name}</span>
                    )}
                    {c.product?.website_url ? (
                      <a
                        className="text-sm text-accent underline"
                        href={c.product.website_url}
                        rel="noopener noreferrer nofollow"
                        target="_blank"
                      >
                        Site officiel
                      </a>
                    ) : (
                      <Unknown label="Site officiel inconnu" />
                    )}
                    <Badge>{IDENTITY_DECISION[c.identity_decision] ?? c.identity_decision}</Badge>
                    <Badge
                      tone={
                        c.review_status === "accepted"
                          ? "success"
                          : c.review_status === "rejected"
                            ? "danger"
                            : c.review_status === "needs_review"
                              ? "warning"
                              : "neutral"
                      }
                    >
                      {CANDIDATE_REVIEW[c.review_status] ?? c.review_status}
                    </Badge>
                    {c.exclusion_status_at_run !== "eligible" ? (
                      <Badge tone="danger">
                        {EXCLUSION_STATUS[c.exclusion_status_at_run] ?? "Exclu en permanence"}
                      </Badge>
                    ) : null}
                  </div>
                  {c.product?.tagline ? <p className="text-sm">{c.product.tagline}</p> : null}
                  <dl className="grid gap-x-6 text-sm sm:grid-cols-3">
                    <div data-testid="fit-score">
                      <dt className="text-muted">Correspondance aux filtres</dt>
                      <dd>
                        {c.fit_score === null ? (
                          <Unknown label="Non calculable" />
                        ) : (
                          `${c.fit_score} / 100`
                        )}
                      </dd>
                    </div>
                    <div data-testid="fit-coverage">
                      <dt className="text-muted">Couverture des critères</dt>
                      <dd>
                        {c.fit_coverage === null ? <Unknown label="—" /> : `${c.fit_coverage} %`}
                      </dd>
                    </div>
                    <div data-testid="evidence-confidence">
                      <dt className="text-muted">Confiance des preuves</dt>
                      <dd>
                        {c.confidence_score === null ? (
                          <Unknown label="—" />
                        ) : (
                          `${c.confidence_score} / 100`
                        )}
                      </dd>
                    </div>
                  </dl>
                  {c.recommendation_reason ? (
                    <p className="text-sm text-muted">{c.recommendation_reason}</p>
                  ) : null}
                  {c.rejection_reason ? (
                    <p className="text-sm">Motif : {rejectionLabel(c.rejection_reason)}</p>
                  ) : null}
                  {c.evidence.length > 0 ? (
                    <ul className="text-sm">
                      {c.evidence.map((e) => (
                        <li key={e.id}>
                          Preuve : {e.claim_text} —{" "}
                          {e.source_url ? (
                            <a
                              className="text-accent underline"
                              href={e.source_url}
                              rel="noopener noreferrer nofollow"
                              target="_blank"
                            >
                              Source : {e.source_name ?? "source"}
                            </a>
                          ) : (
                            "source inconnue"
                          )}{" "}
                          · {RELIABILITY[e.reliability_level] ?? `niveau ${e.reliability_level}`} ·
                          relevée le {formatDate(e.retrieved_at)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {editable && finished && ["pending", "needs_review"].includes(c.review_status) ? (
                    <CandidateReview
                      workspaceId={workspaceId}
                      runId={run.id}
                      candidateId={c.id}
                      name={name}
                      canAccept={
                        c.review_status === "pending" &&
                        c.exclusion_status_at_run === "eligible" &&
                        c.identity_decision !== "needs_review"
                      }
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
