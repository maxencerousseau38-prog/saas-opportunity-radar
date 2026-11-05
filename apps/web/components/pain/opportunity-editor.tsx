"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import { OPPORTUNITY_STATUS } from "@/lib/labels";

/** Status, favourite and notes of a generated opportunity (PATCH W/generated-opportunities/{id}). */
export function OpportunityEditor({
  workspaceId,
  id,
  status,
  isFavorite,
  notes,
  canEdit,
}: {
  workspaceId: string;
  id: string;
  status: string;
  isFavorite: boolean;
  notes: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await api(`/workspaces/${workspaceId}/generated-opportunities/${id}`, {
        method: "PATCH",
        body,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Statut" htmlFor={`status-${id}`}>
          <Select
            id={`status-${id}`}
            className="w-48"
            value={status}
            disabled={!canEdit || busy}
            onChange={(e) => patch({ status: e.target.value })}
          >
            {Object.entries(OPPORTUNITY_STATUS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          size="sm"
          aria-pressed={isFavorite}
          disabled={!canEdit || busy}
          onClick={() => patch({ is_favorite: !isFavorite })}
        >
          <Star className={isFavorite ? "h-4 w-4 fill-current" : "h-4 w-4"} aria-hidden />
          {isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        </Button>
      </div>
      {canEdit ? (
        <div className="space-y-2">
          <Field label="Notes" htmlFor={`notes-${id}`}>
            <Textarea
              id={`notes-${id}`}
              value={draft}
              maxLength={10000}
              onChange={(e) => setDraft(e.target.value)}
            />
          </Field>
          <Button
            size="sm"
            disabled={busy || draft === (notes ?? "")}
            onClick={() => patch({ notes: draft || null })}
          >
            Enregistrer les notes
          </Button>
        </div>
      ) : notes ? (
        <p className="text-sm whitespace-pre-wrap">{notes}</p>
      ) : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </div>
  );
}
