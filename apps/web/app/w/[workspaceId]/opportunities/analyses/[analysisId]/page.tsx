import Link from "next/link";
import { notFound } from "next/navigation";
import { AnalysisStatus } from "@/components/analysis/analysis-status";
import { ExportPanel } from "@/components/analysis/export-panel";
import {
  CompetitorMatrix,
  DimensionTable,
  EvidenceIndex,
  Findings,
  ScoreTiles,
  Section,
  Statement,
  StatementList,
  VerdictReasons,
  VoiceTable,
  type CompetitorView,
  type DimensionRow,
  type FindingRow,
  type Stmt,
  type VoiceClusterView,
} from "@/components/analysis/report-view";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { ApiError } from "@/lib/api/http";
import { ANALYSIS_LIMITATION, ANALYSIS_SUBJECT, RUN_TERMINAL, formatDate } from "@/lib/labels";
import { analysisEvidence, analysisReport } from "@/lib/services/analyses";
import { canAdmin, canEdit, requireWorkspace } from "@/lib/workspace";

export const metadata = { title: "Analyse d’opportunité — SaaS Opportunity Radar" };

interface Narrative {
  executive_summary: { description: Stmt; main_reasons: Stmt[] };
  market_analysis: Record<"market" | "target" | "demand" | "trends" | "competition", Stmt[]>;
  customer_pain: { narrative: Stmt[] };
  cross_competitor_pain: { narrative: Stmt[] };
  market_gaps: Record<
    | "common_problems"
    | "unmet_needs"
    | "missing_features"
    | "insufficient_solutions"
    | "independent_opportunities"
    | "failure_reasons",
    Stmt[]
  >;
  competitor_analysis: { narrative: Stmt[] };
  opportunity_map: Array<{
    priority: number;
    problem: string;
    customer_segment: string;
    proposed_solution: string;
    competitive_advantage: string;
    development_difficulty: string;
    commercial_potential: string;
    is_hypothesis: boolean;
  }>;
  recommended_product: null | {
    name: string;
    value_proposition: string;
    initial_target: string;
    positioning: string;
    mvp_features: string[];
    secondary_features: string[];
    pricing_hypothesis: string;
    main_advantage: string;
  };
  go_to_market: Record<string, Stmt | null>;
  validation_plan: Array<{
    type: string;
    description: string;
    success_threshold: string;
    abandon_threshold: string;
    estimated_effort: string;
  }>;
  risks: Record<
    "reasons_not_to_build" | "technical" | "commercial" | "competitive" | "regulatory",
    Stmt[]
  > & {
    unverified_information: string[];
  };
  final_verdict_explanation: Stmt[];
}

interface ReportDoc {
  simulated?: boolean;
  narrative: Narrative | null;
  recommended_product_status?: string;
  reliability?: {
    sources_used: number;
    evidence_items: number;
    reliability_levels: Record<string, number>;
    information_age: { oldest: string | null; median: string | null };
    fact_status: Record<string, number>;
    verified_evidence: number;
    missing_information: Array<{ dimension_key: string; items: string[] }>;
    open_disagreements: number;
  };
  customer_voice: null | { clusters: VoiceClusterView[]; sample_limitations: string[] };
  competitor_analysis: null | { competitors: CompetitorView[]; omitted_excluded_count: number };
  market_analysis: null | { market_size: { status: string; reason?: string } };
}

const GTM: Record<string, string> = {
  acquisition_channel: "Canal d’acquisition prioritaire",
  first_audience: "Première audience",
  prospecting_method: "Méthode de prospection",
  launch_strategy: "Stratégie de lancement",
  validation_effort: "Effort de validation",
};

export default async function AnalysisPage(
  props: PageProps<"/w/[workspaceId]/opportunities/analyses/[analysisId]">,
) {
  const { workspaceId, analysisId } = await props.params;
  const { client, membership } = await requireWorkspace(workspaceId);
  const data = await analysisReport(client, workspaceId, analysisId).catch((err: unknown) => {
    if (err instanceof ApiError && err.code === "NOT_FOUND") notFound();
    throw err;
  });
  const a = data.analysis;
  const finished = RUN_TERMINAL.has(a.status);
  const evidence = finished ? await analysisEvidence(client, workspaceId, a.id) : [];
  const report = data.report as ReportDoc | null;
  const n = report?.narrative ?? null;
  const limitations = (a.limitations as Array<{ code: string; count?: number }>) ?? [];
  const reasons =
    (a.verdict_reasons as Array<{ rule: number; code: string; result: string }>) ?? [];
  const clusterHref = (id: string) => `/w/${workspaceId}/opportunities/clusters/${id}`;

  return (
    <div className="space-y-6">
      <nav className="text-sm">
        <Link className="text-accent underline" href={`/w/${workspaceId}/opportunities`}>
          ← Opportunities
        </Link>
      </nav>
      <header className="space-y-2">
        <p className="text-xs text-muted">
          Analyse d’opportunité · {ANALYSIS_SUBJECT[a.subject_type] ?? a.subject_type} · marché{" "}
          {a.target_market} · créée le {formatDate(a.created_at)}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{a.subject_label}</h1>
        <AnalysisStatus
          workspaceId={workspaceId}
          analysisId={a.id}
          initialStatus={a.status}
          canEdit={canEdit(membership.role)}
          canAdmin={canAdmin(membership.role)}
        />
        <p className="text-sm">
          Périmètre :{" "}
          {a.scope.map((p, i) => (
            <span key={`${p.product_id}-${p.role}`}>
              {i > 0 ? ", " : ""}
              {p.slug ? (
                <Link className="text-accent underline" href={`/w/${workspaceId}/saas/${p.slug}`}>
                  {p.name}
                </Link>
              ) : (
                "SaaS non visible"
              )}
              {p.role === "competitor" ? " (concurrent)" : ""}
            </span>
          ))}
        </p>
      </header>

      {report?.simulated ? (
        <p
          role="note"
          className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
          data-testid="simulated-banner"
        >
          <strong>Données simulées.</strong> Ce rapport a été produit par un fournisseur IA fictif
          (tests et démonstration) : ce n’est pas un résultat réel. Les scores et le verdict
          appliquent néanmoins les vraies règles du serveur aux preuves disponibles.
        </p>
      ) : null}

      {!finished ? (
        <EmptyState title="Analyse en cours">
          Les résultats s’affichent à la fin de l’analyse. Aucun score n’est montré avant.
        </EmptyState>
      ) : a.status === "needs_review" ? (
        <EmptyState title="Vérification manuelle requise">
          L’évaluation des dimensions a été rejetée deux fois par les contrôles du serveur. Aucun
          score n’est calculé ; relancez l’analyse ou complétez les preuves.
        </EmptyState>
      ) : a.verdict ? (
        <>
          <Section id="summary" title="Executive Summary">
            <ScoreTiles
              scoreTotal={a.score_total}
              provisionalPoints={a.provisional_points}
              coverage={a.score_coverage}
              wtp={a.willingness_to_pay_score}
              confidence={a.confidence_score}
              band={a.decision_band}
              verdict={a.verdict}
            />
            {n ? (
              <>
                <p className="text-sm">
                  <Statement s={n.executive_summary.description} />
                </p>
                <StatementList
                  title="Raisons principales"
                  items={n.executive_summary.main_reasons}
                />
              </>
            ) : null}
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Règles du verdict (calculées par le serveur)</h3>
              <VerdictReasons reasons={reasons} />
            </div>
          </Section>

          <Section id="dimensions" title="Score par dimension">
            <DimensionTable rows={data.dimensions as unknown as DimensionRow[]} />
          </Section>

          {report?.reliability ? (
            <Section id="reliability" title="Fiabilité du score">
              <ul className="grid gap-1 text-sm sm:grid-cols-2">
                <li>Sources utilisées : {report.reliability.sources_used}</li>
                <li>Preuves indexées : {report.reliability.evidence_items}</li>
                <li>
                  Fiabilité (niveaux 1/2/3/4) : {report.reliability.reliability_levels.level_1 ?? 0}{" "}
                  / {report.reliability.reliability_levels.level_2 ?? 0} /{" "}
                  {report.reliability.reliability_levels.level_3 ?? 0} /{" "}
                  {report.reliability.reliability_levels.level_4 ?? 0}
                </li>
                <li>Preuves vérifiées : {report.reliability.verified_evidence}</li>
                <li>
                  Ancienneté : plus ancienne{" "}
                  {report.reliability.information_age.oldest ?? "inconnue"}, médiane{" "}
                  {report.reliability.information_age.median ?? "inconnue"}
                </li>
                <li>
                  Confirmées / estimées / déclarées / inconnues :{" "}
                  {report.reliability.fact_status.confirmed ?? 0} /{" "}
                  {report.reliability.fact_status.estimated ?? 0} /{" "}
                  {report.reliability.fact_status.declared ?? 0} /{" "}
                  {report.reliability.fact_status.unknown ?? 0}
                </li>
                <li>Contradictions ouvertes : {report.reliability.open_disagreements}</li>
              </ul>
            </Section>
          ) : null}

          {n ? (
            <Section id="market" title="Market Analysis">
              <StatementList title="Marché" items={n.market_analysis.market} />
              <StatementList title="Cible" items={n.market_analysis.target} />
              <StatementList title="Demande" items={n.market_analysis.demand} />
              <StatementList title="Tendances" items={n.market_analysis.trends} />
              <StatementList title="Concurrence" items={n.market_analysis.competition} />
              {report?.market_analysis?.market_size.status === "insufficient_data" ? (
                <p className="text-sm text-muted">
                  Taille de marché : données insuffisantes (aucune estimation sans méthodologie
                  sourcée).
                </p>
              ) : null}
            </Section>
          ) : null}

          <Section id="pain" title="Customer Pain Analysis">
            {n ? <StatementList title="Synthèse" items={n.customer_pain.narrative} /> : null}
            {report?.customer_voice ? (
              <>
                <VoiceTable clusters={report.customer_voice.clusters} href={clusterHref} />
                <ul className="list-disc pl-5 text-xs text-muted">
                  {report.customer_voice.sample_limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                  <li>
                    Des plaintes ne prouvent pas que des clients paieraient pour une solution.
                  </li>
                </ul>
              </>
            ) : (
              <p className="text-sm text-muted">Avis clients non analysés.</p>
            )}
          </Section>

          {n ? (
            <Section id="gaps" title="Market Gap Analysis">
              <StatementList title="Problèmes communs" items={n.market_gaps.common_problems} />
              <StatementList title="Besoins mal satisfaits" items={n.market_gaps.unmet_needs} />
              <StatementList
                title="Fonctionnalités manquantes"
                items={n.market_gaps.missing_features}
              />
              <StatementList
                title="Solutions insuffisantes"
                items={n.market_gaps.insufficient_solutions}
              />
              <StatementList
                title="Opportunités indépendantes"
                items={n.market_gaps.independent_opportunities}
              />
              <StatementList
                title="Raisons pour lesquelles ces opportunités pourraient échouer"
                items={n.market_gaps.failure_reasons}
              />
            </Section>
          ) : null}

          <Section id="competitors" title="Competitor Analysis">
            {report?.competitor_analysis ? (
              <CompetitorMatrix
                rows={report.competitor_analysis.competitors}
                omitted={report.competitor_analysis.omitted_excluded_count}
              />
            ) : (
              <p className="text-sm text-muted">Concurrence non analysée.</p>
            )}
          </Section>

          {n ? (
            <>
              <Section id="map" title="Opportunity Map">
                {n.opportunity_map.length === 0 ? (
                  <p className="text-sm text-muted">Aucune opportunité défendable identifiée.</p>
                ) : (
                  <ol className="space-y-2 text-sm">
                    {n.opportunity_map.map((o) => (
                      <li key={o.priority}>
                        <strong>{o.problem}</strong> — {o.proposed_solution} ({o.customer_segment})
                        {o.is_hypothesis ? (
                          <Badge className="ml-1" tone="warning">
                            hypothèse
                          </Badge>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
              </Section>
              <Section id="recommended" title="Recommended Product">
                {n.recommended_product ? (
                  <div className="space-y-1 text-sm">
                    <p>
                      <strong>{n.recommended_product.name}</strong>{" "}
                      <Badge tone="warning">hypothèse</Badge>
                    </p>
                    <p>{n.recommended_product.value_proposition}</p>
                    <p>Cible initiale : {n.recommended_product.initial_target}</p>
                    <p>Positionnement : {n.recommended_product.positioning}</p>
                    <p>MVP : {n.recommended_product.mvp_features.join(" ; ")}</p>
                    <p>Pricing hypothétique : {n.recommended_product.pricing_hypothesis}</p>
                    <p>Avantage principal : {n.recommended_product.main_advantage}</p>
                  </div>
                ) : report?.recommended_product_status === "excluded" ||
                  report?.recommended_product_status === "needs_review" ? (
                  <p className="text-sm">
                    Le produit recommandé relevait de l’exclusion permanente (affiliation ou
                    partenariat) : la section est retirée et le verdict ne peut pas être BUILD
                    CANDIDATE.
                  </p>
                ) : (
                  <p className="text-sm text-muted">Aucun produit recommandé.</p>
                )}
              </Section>
              <Section id="gtm" title="Go-to-Market">
                <ul className="space-y-1 text-sm">
                  {Object.entries(GTM).map(([k, label]) => {
                    const s = n.go_to_market[k];
                    return s ? (
                      <li key={k}>
                        {label} : <Statement s={s} />
                      </li>
                    ) : null;
                  })}
                </ul>
              </Section>
              <Section id="validation" title="Validation Plan">
                {n.validation_plan.length === 0 ? (
                  <p className="text-sm text-muted">Aucun plan de validation demandé.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {n.validation_plan.map((v, i) => (
                      <li key={i}>
                        <strong>{v.description}</strong> — réussite : {v.success_threshold} ;
                        abandon : {v.abandon_threshold} ; effort : {v.estimated_effort}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </>
          ) : null}

          <Section id="risks" title="Risks & Kill Criteria">
            {n ? (
              <>
                <StatementList
                  title="Raisons de ne pas construire"
                  items={n.risks.reasons_not_to_build}
                />
                <StatementList title="Risques techniques" items={n.risks.technical} />
                <StatementList title="Risques commerciaux" items={n.risks.commercial} />
                <StatementList title="Risques concurrentiels" items={n.risks.competitive} />
                <StatementList title="Risques réglementaires" items={n.risks.regulatory} />
              </>
            ) : null}
            <Findings rows={data.findings as unknown as FindingRow[]} />
          </Section>

          {n ? (
            <Section id="final" title="Final Verdict">
              <StatementList title="Explication" items={n.final_verdict_explanation} />
            </Section>
          ) : null}

          <Section id="evidence" title="Evidence Index">
            <EvidenceIndex items={evidence} />
          </Section>

          <Section id="exports" title="Exports">
            <ExportPanel
              workspaceId={workspaceId}
              analysisId={a.id}
              canEdit={canEdit(membership.role)}
            />
          </Section>
        </>
      ) : (
        <EmptyState title="Aucun résultat">L’analyse s’est terminée sans résultat.</EmptyState>
      )}

      {limitations.length > 0 ? (
        <section
          aria-labelledby="limits-title"
          className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
        >
          <h2 id="limits-title" className="font-medium">
            Limites de cette analyse
          </h2>
          <ul className="list-disc pl-5">
            {[...new Map(limitations.map((l) => [l.code, l])).values()].map((l) => (
              <li key={l.code}>
                {ANALYSIS_LIMITATION[l.code] ?? l.code}
                {l.count ? ` (${l.count})` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
