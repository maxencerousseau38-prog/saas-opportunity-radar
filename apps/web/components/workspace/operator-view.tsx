"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { EmptyState, ErrorNote } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import { REPORT_TYPE, formatDate } from "@/lib/labels";

export function OperatorView({
  reviews,
  reports,
}: {
  reviews: Array<{
    id: string;
    name: string;
    website_url: string | null;
    tagline: string | null;
    assessments: Array<{ status: string; rules: unknown; version: string; created_at: string }>;
  }>;
  reports: Array<{
    id: string;
    product: string;
    type: string;
    field_key: string | null;
    message: string;
    created_at: string;
  }>;
}) {
  const router = useRouter();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }
  return (
    <div className="space-y-4">
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <section className="space-y-2 rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-semibold">Revues d’exclusion ({reviews.length})</h2>
        {reviews.length === 0 ? <EmptyState title="Aucun SaaS en attente de revue" /> : null}
        {reviews.map((r) => (
          <div
            key={r.id}
            className="space-y-2 rounded border border-border p-3"
            data-testid="exclusion-review"
          >
            <p className="font-medium">
              {r.name} <span className="text-sm text-muted">{r.website_url}</span>
            </p>
            <p className="text-sm">{r.tagline}</p>
            <p className="text-xs text-muted">
              Règles :{" "}
              {r.assessments
                .map((a) => `${a.version} ${JSON.stringify(a.rules)} (${formatDate(a.created_at)})`)
                .join(" ; ")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                aria-label={`Motif pour ${r.name}`}
                placeholder="Motif (obligatoire)"
                value={reasons[r.id] ?? ""}
                onChange={(e) => setReasons((x) => ({ ...x, [r.id]: e.target.value }))}
                className="max-w-md"
              />
              <Button
                disabled={!reasons[r.id]?.trim()}
                onClick={() =>
                  void run(() =>
                    api(`/operator/products/${r.id}/exclusion-decision`, {
                      method: "POST",
                      body: { decision: "eligible", reason: reasons[r.id] },
                    }),
                  )
                }
              >
                Rendre éligible
              </Button>
              <Button
                variant="danger"
                disabled={!reasons[r.id]?.trim()}
                onClick={() =>
                  void run(() =>
                    api(`/operator/products/${r.id}/exclusion-decision`, {
                      method: "POST",
                      body: { decision: "excluded", reason: reasons[r.id] },
                    }),
                  )
                }
              >
                Exclure
              </Button>
            </div>
          </div>
        ))}
      </section>
      <section className="space-y-2 rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-semibold">Signalements ouverts ({reports.length})</h2>
        {reports.length === 0 ? <EmptyState title="Aucun signalement ouvert" /> : null}
        {reports.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center gap-2 border-t border-border pt-2 text-sm"
            data-testid="correction-report"
          >
            <span className="font-medium">{r.product}</span>
            <span>
              {REPORT_TYPE[r.type] ?? r.type}
              {r.field_key ? ` (${r.field_key})` : ""}
            </span>
            <span className="text-muted">{r.message}</span>
            <span className="text-xs text-muted">{formatDate(r.created_at)}</span>
            <span className="ml-auto flex gap-2">
              <Button
                size="sm"
                onClick={() =>
                  void run(() =>
                    api(`/operator/correction-reports/${r.id}/resolution`, {
                      method: "POST",
                      body: { status: "accepted" },
                    }),
                  )
                }
              >
                Accepter
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() =>
                  void run(() =>
                    api(`/operator/correction-reports/${r.id}/resolution`, {
                      method: "POST",
                      body: { status: "rejected" },
                    }),
                  )
                }
              >
                Rejeter
              </Button>
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
