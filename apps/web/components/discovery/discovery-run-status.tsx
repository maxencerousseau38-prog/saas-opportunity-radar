"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import { DISCOVERY_STAGE, RUN_STATUS, RUN_TERMINAL } from "@/lib/labels";

interface Progress {
  status: string;
  stage: string | null;
  stage_index: number | null;
  stage_count: number;
}

/** Progress of a discovery run (polled while it runs) and its actions (PRD §6.4). */
export function DiscoveryRunStatus({
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
  const base = `/workspaces/${workspaceId}/discovery-runs/${runId}`;
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
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

  async function act(action: "cancel" | "retry" | "delete" | "save") {
    setBusy(true);
    setError(null);
    try {
      if (action === "delete") {
        if (!window.confirm("Supprimer cette recherche ? Les SaaS ajoutés au catalogue restent.")) {
          return;
        }
        await api(base, { method: "DELETE" });
        router.push(`/w/${workspaceId}/ai-discovery`);
        return;
      }
      if (action === "save") {
        const name = window.prompt("Nom de la recherche enregistrée");
        if (!name) return;
        await api(`${base}/save`, { method: "POST", body: { name } });
        setSaved(name);
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
        {progress?.stage && !RUN_TERMINAL.has(status) ? (
          <span className="text-sm text-muted">
            Étape {progress.stage_index}/{progress.stage_count} :{" "}
            {DISCOVERY_STAGE[progress.stage] ?? progress.stage}
          </span>
        ) : null}
        {canEdit && !RUN_TERMINAL.has(status) ? (
          <Button size="sm" onClick={() => act("cancel")} disabled={busy}>
            Annuler
          </Button>
        ) : null}
        {canEdit && ["failed", "partial", "cancelled"].includes(status) ? (
          <Button size="sm" onClick={() => act("retry")} disabled={busy}>
            Reprendre
          </Button>
        ) : null}
        {canEdit && RUN_TERMINAL.has(status) ? (
          <>
            <Link
              className="rounded-md border border-border px-2 py-1 text-sm hover:bg-surface-2"
              href={`/w/${workspaceId}/ai-discovery?from=${runId}`}
            >
              Relancer ou modifier
            </Link>
            <Button size="sm" onClick={() => act("save")} disabled={busy}>
              Enregistrer la recherche
            </Button>
          </>
        ) : null}
        {canAdmin && RUN_TERMINAL.has(status) ? (
          <Button size="sm" variant="danger" onClick={() => act("delete")} disabled={busy}>
            Supprimer
          </Button>
        ) : null}
      </div>
      {saved ? <p className="text-sm text-success">Recherche enregistrée : {saved}</p> : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </div>
  );
}
