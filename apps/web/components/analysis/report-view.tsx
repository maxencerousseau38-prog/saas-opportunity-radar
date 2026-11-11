// Report of an opportunity analysis (PRD §9; Implementation Blueprint §9.7):
// score, band, WTP, confidence, coverage and verdict are visually separate;
// every statement links to its evidence or is labelled a hypothesis; the
// evidence index lists every cited source.
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Unknown } from "@/components/ui/states";
import {
  CONFIDENCE_LEVEL,
  COUNT_STATUS,
  DECISION_BAND,
  DIMENSION,
  FACT_STATUS,
  FINDING_TYPE,
  RELATIONSHIP,
  SEVERITY,
  VERDICT,
  VERDICT_REASON,
  confidenceLevelOf,
  formatDate,
} from "@/lib/labels";

type Ref = { evidence_id: string; support_type?: string };
export interface Stmt {
  text: string;
  is_hypothesis: boolean;
  evidence?: Ref[];
}

export function EvidenceLinks({ refs }: { refs: Ref[] | undefined }) {
  const supports = (refs ?? []).filter((r) => (r.support_type ?? "supports") === "supports");
  if (supports.length === 0) return null;
  return (
    <span className="ml-1 text-xs">
      {supports.map((r, i) => (
        <a
          key={`${r.evidence_id}-${i}`}
          href={`#ev-${r.evidence_id}`}
          className="mr-1 text-accent underline"
        >
          [preuve {r.evidence_id.slice(0, 6)}]
        </a>
      ))}
    </span>
  );
}

export function Statement({ s }: { s: Stmt }) {
  return (
    <>
      {s.text}
      {s.is_hypothesis ? (
        <Badge className="ml-1" tone="warning">
          hypothèse
        </Badge>
      ) : (
        <EvidenceLinks refs={s.evidence} />
      )}
    </>
  );
}

export function StatementList({
  title,
  items,
}: {
  title: string;
  items: Stmt[] | undefined | null;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {items.map((s, i) => (
          <li key={i}>
            <Statement s={s} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3 rounded-lg border border-border p-4">
      <h2 id={id} className="font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Tile({ label, children, testId }: { label: string; children: ReactNode; testId: string }) {
  return (
    <div className="rounded-lg border border-border p-3" data-testid={testId}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold">{children}</p>
    </div>
  );
}

/** §9.7: the score elements, each in its own tile; unknown is never zero. */
export function ScoreTiles(props: {
  scoreTotal: number | null;
  provisionalPoints: number | null;
  coverage: number | null;
  wtp: number | null;
  confidence: number | null;
  band: string | null;
  verdict: string | null;
}) {
  const verdictTone =
    props.verdict === "build_candidate"
      ? "success"
      : props.verdict === "reject"
        ? "danger"
        : "warning";
  return (
    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <Tile label="Score" testId="score">
        {props.scoreTotal !== null ? (
          `${Number(props.scoreTotal)} / 100`
        ) : props.provisionalPoints !== null ? (
          <span className="text-base">
            Provisoire : {Number(props.provisionalPoints)} points sur {Number(props.coverage)} % de
            couverture
          </span>
        ) : (
          <Unknown label="Non calculé" />
        )}
      </Tile>
      <Tile label="Bande de décision" testId="band">
        {props.band ? DECISION_BAND[props.band] : <Unknown label="Score incomplet" />}
      </Tile>
      <Tile label="Volonté de payer" testId="wtp">
        {props.wtp !== null ? `${Number(props.wtp)} / 15` : <Unknown label="Non évaluée" />}
      </Tile>
      <Tile label="Confiance" testId="confidence">
        {props.confidence !== null ? (
          `${Number(props.confidence)} (${CONFIDENCE_LEVEL[confidenceLevelOf(Number(props.confidence))]})`
        ) : (
          <Unknown />
        )}
      </Tile>
      <Tile label="Couverture du score" testId="coverage">
        {props.coverage !== null ? `${Number(props.coverage)} %` : <Unknown />}
      </Tile>
      <Tile label="Verdict" testId="verdict">
        {props.verdict ? <Badge tone={verdictTone}>{VERDICT[props.verdict]}</Badge> : <Unknown />}
      </Tile>
    </div>
  );
}

export function VerdictReasons({
  reasons,
}: {
  reasons: Array<{ rule: number; code: string; result: string }>;
}) {
  if (reasons.length === 0) return null;
  return (
    <ul className="space-y-1 text-sm" aria-label="Règles du verdict">
      {reasons.map((r, i) => (
        <li key={`${r.code}-${i}`} className="flex items-center gap-2">
          <Badge
            tone={r.result === "failed" ? "warning" : r.result === "passed" ? "success" : "neutral"}
          >
            {r.result === "failed" ? "non rempli" : r.result === "passed" ? "rempli" : "appliqué"}
          </Badge>
          {VERDICT_REASON[r.code] ?? r.code}
        </li>
      ))}
    </ul>
  );
}

export interface DimensionRow {
  dimension_key: string;
  weight: number;
  assessment_status: string;
  rating: number | null;
  weighted_points: number | null;
  explanation: string;
  missing_information: unknown;
  dimension_score_evidence: Array<{ evidence_item_id: string; support_type: string }>;
}

export function DimensionTable({ rows }: { rows: DimensionRow[] }) {
  const order = Object.keys(DIMENSION);
  const sorted = [...rows].sort(
    (a, b) => order.indexOf(a.dimension_key) - order.indexOf(b.dimension_key),
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="py-1 pr-2">Dimension</th>
            <th className="py-1 pr-2">Poids</th>
            <th className="py-1 pr-2">Note (0–5)</th>
            <th className="py-1 pr-2">Points</th>
            <th className="py-1">Justification et preuves</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((d) => (
            <tr key={d.dimension_key} className="border-t border-border align-top">
              <td className="py-2 pr-2">{DIMENSION[d.dimension_key] ?? d.dimension_key}</td>
              <td className="py-2 pr-2">{d.weight}</td>
              <td className="py-2 pr-2">
                {d.assessment_status === "assessed" ? (
                  d.rating
                ) : (
                  <Unknown label="Preuves insuffisantes" />
                )}
              </td>
              <td className="py-2 pr-2">
                {d.weighted_points !== null ? Number(d.weighted_points) : "—"}
              </td>
              <td className="py-2">
                {d.explanation}
                <EvidenceLinks
                  refs={d.dimension_score_evidence.map((e) => ({
                    evidence_id: e.evidence_item_id,
                    support_type: e.support_type,
                  }))}
                />
                {Array.isArray(d.missing_information) && d.missing_information.length > 0 ? (
                  <p className="text-xs text-muted">
                    Manque : {(d.missing_information as string[]).join(" ; ")}
                  </p>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface FindingRow {
  id: string;
  finding_type: string;
  title: string;
  description: string;
  is_hypothesis: boolean;
  severity: string | null;
  is_substantiated: boolean | null;
  finding_evidence: Array<{ evidence_item_id: string; support_type: string }>;
}

export function Findings({ rows }: { rows: FindingRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted">Aucun constat.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((f) => (
        <li key={f.id} className="rounded border border-border p-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={f.finding_type === "kill_criterion" ? "danger" : "neutral"}>
              {FINDING_TYPE[f.finding_type] ?? f.finding_type}
            </Badge>
            {f.severity ? (
              <Badge tone="warning">
                {SEVERITY[f.severity]} · {f.is_substantiated ? "étayé" : "non étayé"}
              </Badge>
            ) : null}
            {f.is_hypothesis ? <Badge tone="warning">hypothèse</Badge> : null}
            <span className="font-medium">{f.title}</span>
          </div>
          {f.description !== f.title ? <p className="mt-1">{f.description}</p> : null}
          <EvidenceLinks
            refs={f.finding_evidence.map((e) => ({
              evidence_id: e.evidence_item_id,
              support_type: e.support_type,
            }))}
          />
        </li>
      ))}
    </ul>
  );
}

export interface EvidenceEntry {
  evidence_id: string;
  claim_type: string;
  claim_text: string;
  fact_status: string;
  reliability_level: number;
  verification_status: string;
  monetization_signal: string | null;
  in_open_conflict: boolean;
  published_at: string | null;
  observed_at: string;
  source_url: string | null;
  source_name: string | null;
}

export function EvidenceIndex({ items }: { items: EvidenceEntry[] }) {
  if (items.length === 0) return <p className="text-sm text-muted">Aucune preuve indexée.</p>;
  return (
    <ol className="space-y-2 text-sm">
      {items.map((e) => (
        <li
          key={e.evidence_id}
          id={`ev-${e.evidence_id}`}
          className="scroll-mt-20 rounded border border-border p-2"
        >
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <code>{e.evidence_id.slice(0, 6)}</code>
            <span>{e.claim_type}</span>
            <span>fiabilité {e.reliability_level}</span>
            <span>{e.verification_status === "verified" ? "vérifiée" : "non vérifiée"}</span>
            <span>{FACT_STATUS[e.fact_status] ?? e.fact_status}</span>
            {e.monetization_signal ? <span>signal : {e.monetization_signal}</span> : null}
            {e.in_open_conflict ? <Badge tone="warning">contradiction ouverte</Badge> : null}
            <span>{formatDate(e.published_at ?? e.observed_at)}</span>
          </div>
          <p className="mt-1">
            {e.claim_text.length > 400 ? `${e.claim_text.slice(0, 400)}…` : e.claim_text}
          </p>
          {e.source_url ? (
            <a
              className="text-xs text-accent underline"
              href={e.source_url}
              target="_blank"
              rel="noreferrer noopener"
            >
              Source{e.source_name ? ` : ${e.source_name}` : ""}
            </a>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export interface VoiceClusterView {
  cluster_id: string;
  name: string;
  feedback_count: number;
  affected_product_count: number;
  distinct_author_count: number | null;
  distinct_author_count_status: string;
  distinct_company_count: number | null;
  distinct_company_count_status: string;
}

export function VoiceTable({
  clusters,
  href,
}: {
  clusters: VoiceClusterView[];
  href: (id: string) => string;
}) {
  if (clusters.length === 0)
    return <p className="text-sm text-muted">Aucun problème récurrent dans l’échantillon.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="py-1 pr-2">Cluster</th>
            <th className="py-1 pr-2">Retours</th>
            <th className="py-1 pr-2">SaaS concernés</th>
            <th className="py-1 pr-2">Auteurs distincts</th>
            <th className="py-1">Entreprises distinctes</th>
          </tr>
        </thead>
        <tbody>
          {clusters.map((c) => (
            <tr key={c.cluster_id} className="border-t border-border">
              <td className="py-1 pr-2">
                <a className="text-accent underline" href={href(c.cluster_id)}>
                  {c.name}
                </a>
              </td>
              <td className="py-1 pr-2">{c.feedback_count}</td>
              <td className="py-1 pr-2">{c.affected_product_count}</td>
              <td className="py-1 pr-2">
                {c.distinct_author_count ?? "inconnu"} (
                {COUNT_STATUS[c.distinct_author_count_status]})
              </td>
              <td className="py-1">
                {c.distinct_company_count ?? "inconnu"} (
                {COUNT_STATUS[c.distinct_company_count_status]})
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface CompetitorView {
  product_id: string | null;
  name: string;
  relationship_type: string;
  positioning: Stmt | null;
  confidence: number;
  evidence?: Ref[];
}

export function CompetitorMatrix({ rows, omitted }: { rows: CompetitorView[]; omitted: number }) {
  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Aucun concurrent analysé.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 pr-2">Concurrent</th>
                <th className="py-1 pr-2">Relation</th>
                <th className="py-1 pr-2">Positionnement</th>
                <th className="py-1">Confiance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={`${c.name}-${i}`} className="border-t border-border align-top">
                  <td className="py-1 pr-2">
                    {c.name}
                    <EvidenceLinks refs={c.evidence} />
                  </td>
                  <td className="py-1 pr-2">
                    {RELATIONSHIP[c.relationship_type] ?? c.relationship_type}
                  </td>
                  <td className="py-1 pr-2">
                    {c.positioning ? <Statement s={c.positioning} /> : <Unknown />}
                  </td>
                  <td className="py-1">{c.confidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {omitted > 0 ? (
        <p className="text-xs text-muted">
          {omitted} produit(s) exclu(s) ou non visible(s) omis de l’analyse concurrentielle.
        </p>
      ) : null}
    </div>
  );
}
