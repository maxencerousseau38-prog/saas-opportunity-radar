"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import type { JobStatus } from "@sor/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import { JOB_STATE, TERMINAL_STATES, formatDate } from "@/lib/labels";

interface Summary {
  pages_fetched?: number;
  pages_failed?: Array<{ url: string; reason: string }>;
  verified?: number;
  needs_review?: number;
  rejected?: number;
  fields_updated?: string[];
  unknown_fields?: string[];
  conflicts?: number;
  provider?: string | null;
  warnings?: string[];
}

/** Enrichment from the official website (job product_enrichment, Sprint 3). */
export function EnrichmentStatus({
  workspaceId,
  productId,
  canEdit,
}: {
  workspaceId: string;
  productId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/workspaces/${workspaceId}/products/${productId}/enrichment`;

  const load = useCallback(async () => {
    try {
      const res = await api<{ data: JobStatus | null }>(base);
      setJob(res.data);
      return res.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      return null;
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while the job runs; refresh the profile once it ends.
  useEffect(() => {
    if (!job || TERMINAL_STATES.has(job.state)) return;
    const t = setInterval(async () => {
      const next = await load();
      if (next && TERMINAL_STATES.has(next.state)) router.refresh();
    }, 3000);
    return () => clearInterval(t);
  }, [job, load, router]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await api(base, {
        method: "POST",
        idempotencyKey: `enrich-${productId}-${crypto.randomUUID()}`,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  const s = (job?.result ?? {}) as Summary;
  const running = job !== null && !TERMINAL_STATES.has(job.state);
  return (
    <div className="space-y-1 border-t border-border pt-2" data-testid="enrichment-status">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Site officiel</span>
        {job ? (
          <Badge tone={job.state === "completed" ? "success" : running ? "accent" : "warning"}>
            {JOB_STATE[job.state]}
          </Badge>
        ) : null}
      </div>
      {job ? (
        <p className="text-xs text-muted">
          {formatDate(job.completed_at ?? job.created_at)}
          {TERMINAL_STATES.has(job.state)
            ? ` · ${s.pages_fetched ?? 0} page(s) lue(s), ${s.verified ?? 0} preuve(s) vérifiée(s), ${s.needs_review ?? 0} à revoir, ${s.rejected ?? 0} rejetée(s)`
            : ""}
          {s.pages_failed?.length ? ` · ${s.pages_failed.length} page(s) inaccessible(s)` : ""}
          {s.conflicts ? ` · ${s.conflicts} contradiction(s)` : ""}
        </p>
      ) : (
        <p className="text-xs text-muted">Jamais enrichi depuis le site officiel.</p>
      )}
      {s.provider === "fake" ? (
        <p className="text-xs text-warning">
          Extraction par le fournisseur de test (heuristiques, pas un modèle d’IA) : le choix du
          fournisseur réel est la décision PD-24.
        </p>
      ) : null}
      {canEdit ? (
        <Button size="sm" disabled={busy || running} onClick={() => void start()}>
          <RefreshCw size={14} />{" "}
          {running ? "Enrichissement en cours…" : "Enrichir depuis le site officiel"}
        </Button>
      ) : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </div>
  );
}
