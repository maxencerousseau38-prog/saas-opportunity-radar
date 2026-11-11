import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { COUNT_STATUS, CLUSTER_REVIEW, FREQUENCY_LABEL, PROBLEM_CATEGORY } from "@/lib/labels";

export interface ClusterRow {
  id: string;
  name: string;
  problem_category: string;
  frequency_label: string;
  feedback_count: number;
  distinct_author_count: number | null;
  distinct_author_count_status: string;
  distinct_company_count: number | null;
  distinct_company_count_status: string;
  affected_product_count: number;
  confidence_score: number;
  review_status: string;
}

/** Raw volume, distinct authors and distinct companies are always shown separately (PRD §7.3.C). */
export function CountsLine({ c }: { c: ClusterRow }) {
  const distinct = (n: number | null, status: string) =>
    n === null ? `inconnu` : `${n} (${COUNT_STATUS[status] ?? status})`;
  return (
    <span className="text-xs text-muted">
      {c.feedback_count} retour(s) · auteurs distincts :{" "}
      {distinct(c.distinct_author_count, c.distinct_author_count_status)} · entreprises distinctes :{" "}
      {distinct(c.distinct_company_count, c.distinct_company_count_status)} ·{" "}
      {c.affected_product_count} SaaS concerné(s)
    </span>
  );
}

export function ClusterList({
  workspaceId,
  clusters,
}: {
  workspaceId: string;
  clusters: ClusterRow[];
}) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {clusters.map((c) => (
        <li key={c.id} className="space-y-1 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="font-medium text-accent underline"
              href={`/w/${workspaceId}/opportunities/clusters/${c.id}`}
            >
              {c.name}
            </Link>
            <Badge>{PROBLEM_CATEGORY[c.problem_category] ?? c.problem_category}</Badge>
            <Badge tone={c.frequency_label === "widespread" ? "accent" : "neutral"}>
              {FREQUENCY_LABEL[c.frequency_label] ?? c.frequency_label}
            </Badge>
            <Badge
              tone={
                c.review_status === "rejected"
                  ? "danger"
                  : c.review_status === "user_confirmed"
                    ? "success"
                    : "neutral"
              }
            >
              {CLUSTER_REVIEW[c.review_status] ?? c.review_status}
            </Badge>
            <span className="text-xs text-muted">
              Confiance {Math.round(c.confidence_score)}/100
            </span>
          </div>
          <CountsLine c={c} />
        </li>
      ))}
    </ul>
  );
}
