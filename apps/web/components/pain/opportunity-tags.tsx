"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorNote } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";

/** Workspace tags on a generated opportunity (tag_assignments.generated_opportunity_id, M6). */
export function OpportunityTags({
  workspaceId,
  opportunityId,
  tags,
  canEdit,
}: {
  workspaceId: string;
  opportunityId: string;
  tags: Array<{ id: string; name: string; assigned: boolean }>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(tagId: string, assigned: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api(`/workspaces/${workspaceId}/tags/${tagId}/assignments`, {
        method: assigned ? "DELETE" : "POST",
        body: { generated_opportunity_id: opportunityId },
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  if (tags.length === 0)
    return <p className="text-sm text-muted">Aucun tag dans cet espace (créez-en dans Saved).</p>;
  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-2" aria-label="Tags">
        {tags.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              aria-pressed={t.assigned}
              disabled={!canEdit || busy}
              onClick={() => void toggle(t.id, t.assigned)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs",
                t.assigned ? "border-accent bg-accent/15 text-accent" : "border-border text-muted",
              )}
            >
              {t.name}
            </button>
          </li>
        ))}
      </ul>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </div>
  );
}
