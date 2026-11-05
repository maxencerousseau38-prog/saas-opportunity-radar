"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import { ANALYSIS_STAGE, RUN_STATUS, RUN_TERMINAL } from "@/lib/labels";

interface Progress {
  status: string;
  steps_completed: number;
  steps_failed: number;
  last_completed_stage: string | null;
}

/** Progress of an analysis (polled while it runs) and its actions: cancel, retry, delete. */
export function AnalysisStatus({
  workspaceId,
  analysisId,
  initialStatus,
  canEdit,
  canAdmin,
}: {
  workspaceId: string;
  analysisId: string;
  initialStatus: string;
  canEdit: boolean;
  canAdmin: boolean;
}) {
  const router = useRouter();
  const base = `/workspaces/${workspaceId}/analyses/${analysisId}`;
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
        if (!window.confirm("Supprimer cette analyse, son rapport et ses exports ?")) return;
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
        : status === "partial" || status === "needs_review"
          ? "warning"
          : "neutral";
  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>{RUN_STATUS[status] ?? status}</Badge>
        {progress && !RUN_TERMINAL.has(status) ? (
          <span className="text-sm text-muted">
            {progress.steps_completed} étape(s) terminée(s)
            {progress.last_completed_stage
              ? ` — dernière : ${ANALYSIS_STAGE[progress.last_completed_stage] ?? progress.last_completed_stage}`
              : ""}
          </span>
        ) : null}
        {canEdit && !RUN_TERMINAL.has(status) ? (
          <Button size="sm" onClick={() => act("cancel")} disabled={busy}>
            Annuler
          </Button>
        ) : null}
        {canEdit && ["failed", "partial", "cancelled", "needs_review"].includes(status) ? (
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
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </div>
  );
}
