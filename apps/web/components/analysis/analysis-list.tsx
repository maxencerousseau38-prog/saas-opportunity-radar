import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ANALYSIS_SUBJECT, DECISION_BAND, RUN_STATUS, VERDICT, formatDate } from "@/lib/labels";

export interface AnalysisListRow {
  id: string;
  subject_type: string;
  subject_label: string;
  status: string;
  score_total: number | null;
  provisional_points: number | null;
  score_coverage: number | null;
  willingness_to_pay_score: number | null;
  confidence_score: number | null;
  decision_band: string | null;
  verdict: string | null;
  created_at: string;
}

/** Analyses with their score elements kept separate (§9.7). */
export function AnalysisList({
  workspaceId,
  rows,
}: {
  workspaceId: string;
  rows: AnalysisListRow[];
}) {
  return (
    <ul
      className="divide-y divide-border rounded-lg border border-border"
      aria-label="Analyses d’opportunité"
    >
      {rows.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
          <Link
            className="font-medium text-accent underline"
            href={`/w/${workspaceId}/opportunities/analyses/${a.id}`}
          >
            {a.subject_label}
          </Link>
          <Badge>{ANALYSIS_SUBJECT[a.subject_type] ?? a.subject_type}</Badge>
          <Badge>{RUN_STATUS[a.status] ?? a.status}</Badge>
          {a.verdict ? (
            <Badge
              tone={
                a.verdict === "build_candidate"
                  ? "success"
                  : a.verdict === "reject"
                    ? "danger"
                    : "warning"
              }
            >
              {VERDICT[a.verdict]}
            </Badge>
          ) : null}
          <span className="text-xs text-muted">
            {a.score_total !== null
              ? `${Number(a.score_total)} / 100${a.decision_band ? ` · ${DECISION_BAND[a.decision_band]}` : ""}`
              : a.provisional_points !== null
                ? `Provisoire : ${Number(a.provisional_points)} pts sur ${Number(a.score_coverage)} %`
                : "Score non calculé"}
            {a.willingness_to_pay_score !== null
              ? ` · WTP ${Number(a.willingness_to_pay_score)} / 15`
              : ""}
            {a.confidence_score !== null ? ` · confiance ${Number(a.confidence_score)}` : ""} ·{" "}
            {formatDate(a.created_at)}
          </span>
        </li>
      ))}
    </ul>
  );
}
