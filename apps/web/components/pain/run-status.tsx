"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import { RUN_STATUS, RUN_TERMINAL } from "@/lib/labels";

interface Progress {
  status: string;
  steps_completed: number;
  steps_failed: number;
  last_completed_agent: string | null;
  error_summary: string | null;
}

const AGENT: Record<string, string> = {
  P3_problem_extractor: "extraction des problèmes",
  P4_embedder: "représentation des problèmes",
  P6_cluster_verifier: "vérification des regroupements",
  P7_statistics: "statistiques",
  P8_gap_identifier: "lacunes du marché",
  P9_opportunity_generator: "hypothèses d’opportunités",
  P9_persist: "enregistrement",
};

/** Progress of a run (polled while it runs) and its actions: cancel, retry, delete. */
export function RunStatus({
  workspaceId,
  runId,
  initialStatus,
  canEdit,
  canAdmin,
}: {
  workspaceId: string;
  runId: string;
  initialStatus: string;
  canEdit: boolean;
  canAdmin: boolean;
}) {
  const router = useRouter();
  const base = `/workspaces/${workspaceId}/pain-point-runs/${runId}`;
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const status = progress?.status ?? initialStatus;

  const load = useCallback(async () => {
    try {
      const res = await api<{ data: Progress }>(`${base}/progress`);
      setProgress(res.data);
      return res.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      return null;
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (RUN_TERMINAL.has(status)) return;
    const t = setInterval(async () => {
      const next = await load();
      if (next && RUN_TERMINAL.has(next.status)) {
        clearInterval(t);
        router.refresh();
      }
    }, 2000);
    return () => clearInterval(t);
  }, [status, load, router]);

  async function act(action: "cancel" | "retry" | "delete") {
    setBusy(true);
    setError(null);
    try {
      if (action === "delete") {
        if (!window.confirm("Supprimer cette analyse et ses clusters ?")) return;
        await api(base, { method: "DELETE" });
        router.push(`/w/${workspaceId}/opportunities`);
        return;
      }
      await api(`${base}/${action}`, {
        method: "POST",
        ...(action === "retry" ? { idempotencyKey: crypto.randomUUID() } : {}),
      });
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  const tone =
    status === "completed"
      ? "success"
      : status === "failed"
        ? "danger"
        : status === "partial"
          ? "warning"
          : "neutral";
  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>{RUN_STATUS[status] ?? status}</Badge>
        {progress && !RUN_TERMINAL.has(status) ? (
          <span className="text-sm text-muted">
            {progress.steps_completed} étape(s) terminée(s)
            {progress.last_completed_agent
              ? ` — dernière : ${AGENT[progress.last_completed_agent] ?? progress.last_completed_agent}`
              : ""}
          </span>
        ) : null}
        {canEdit && !RUN_TERMINAL.has(status) ? (
          <Button size="sm" onClick={() => act("cancel")} disabled={busy}>
            Annuler
          </Button>
        ) : null}
        {canEdit && ["failed", "partial", "cancelled"].includes(status) ? (
          <Button size="sm" onClick={() => act("retry")} disabled={busy}>
            Relancer
          </Button>
        ) : null}
        {canAdmin && RUN_TERMINAL.has(status) ? (
          <Button size="sm" variant="danger" onClick={() => act("delete")} disabled={busy}>
            Supprimer
          </Button>
        ) : null}
      </div>
      {progress?.error_summary ? <ErrorNote>{progress.error_summary}</ErrorNote> : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </div>
  );
}
