"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/states";
import { api } from "@/lib/client-api";

/** Accept or reject one candidate (POST …/candidates/{id}/review). */
export function CandidateReview({
  workspaceId,
  runId,
  candidateId,
  canAccept,
  name,
}: {
  workspaceId: string;
  runId: string;
  candidateId: string;
  canAccept: boolean;
  name: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function review(decision: "accept" | "reject") {
    setBusy(true);
    setError(null);
    try {
      await api(
        `/workspaces/${workspaceId}/discovery-runs/${runId}/candidates/${candidateId}/review`,
        { method: "POST", body: { decision, reason: null } },
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canAccept ? (
        <Button
          size="sm"
          variant="primary"
          onClick={() => review("accept")}
          disabled={busy}
          aria-label={`Ajouter ${name} au catalogue`}
        >
          Ajouter à Discover
        </Button>
      ) : null}
      <Button
        size="sm"
        onClick={() => review("reject")}
        disabled={busy}
        aria-label={`Écarter ${name}`}
      >
        Écarter
      </Button>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </div>
  );
}
