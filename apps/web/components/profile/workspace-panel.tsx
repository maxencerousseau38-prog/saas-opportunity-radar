"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/states";
import { CollectionDialog, ReportDialog } from "@/components/discover/product-actions";
import { EnrichmentStatus } from "./enrichment-status";
import { api } from "@/lib/client-api";
import { OPPORTUNITY_STATUS } from "@/lib/labels";

interface State {
  status: string;
  is_favorite: boolean;
  is_hidden: boolean;
  personal_notes: string | null;
}

export function WorkspacePanel(props: {
  workspaceId: string;
  productId: string;
  productName: string;
  canEdit: boolean;
  state: State | null;
  tags: Array<{ id: string; name: string }>;
  productTagIds: string[];
  collections: Array<{ id: string; name: string }>;
  productCollectionIds: string[];
}) {
  const router = useRouter();
  const [state, setState] = useState<State>(
    props.state ?? {
      status: "discovered",
      is_favorite: false,
      is_hidden: false,
      personal_notes: null,
    },
  );
  const [notes, setNotes] = useState(state.personal_notes ?? "");
  const [tagIds, setTagIds] = useState(props.productTagIds);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [collections, setCollections] = useState(props.collections);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/workspaces/${props.workspaceId}`;

  async function patch(p: Partial<State>) {
    setError(null);
    try {
      await api(`${base}/products/${props.productId}/state`, { method: "PATCH", body: p });
      setState((s) => ({ ...s, ...p }));
      setMessage("Enregistré.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }

  async function toggleTag(tagId: string, on: boolean) {
    try {
      await api(`${base}/tags/${tagId}/assignments`, {
        method: on ? "POST" : "DELETE",
        body: { product_id: props.productId },
      });
      setTagIds((ids) => (on ? [...ids, tagId] : ids.filter((x) => x !== tagId)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }

  const disabled = !props.canEdit;
  return (
    <aside
      aria-label="Mon espace de travail"
      className="w-full space-y-4 rounded-2xl border border-border bg-surface p-4 text-sm"
    >
      <h2 className="text-[15px] font-semibold tracking-tight">Mon suivi</h2>
      <Field label="Statut" htmlFor="ws-status">
        <Select
          id="ws-status"
          disabled={disabled}
          value={state.status}
          onChange={(e) => void patch({ status: e.target.value })}
        >
          {Object.entries(OPPORTUNITY_STATUS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notes" htmlFor="ws-notes">
        <Textarea
          id="ws-notes"
          disabled={disabled}
          value={notes}
          maxLength={10000}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      <Button
        size="sm"
        disabled={disabled || notes === (state.personal_notes ?? "")}
        onClick={() => void patch({ personal_notes: notes || null })}
      >
        Enregistrer la note
      </Button>
      {props.tags.length ? (
        <fieldset>
          <legend className="text-sm font-medium">Tags</legend>
          <div className="mt-1 flex flex-wrap gap-x-3">
            {props.tags.map((t) => (
              <label key={t.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  className="accent-accent"
                  disabled={disabled}
                  checked={tagIds.includes(t.id)}
                  onChange={(e) => void toggleTag(t.id, e.target.checked)}
                />
                {t.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={disabled} onClick={() => setCollectionOpen(true)}>
          Ajouter à une collection
        </Button>
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => void patch({ is_hidden: !state.is_hidden })}
        >
          {state.is_hidden ? "Ne plus masquer" : "Masquer"}
        </Button>
        <Button size="sm" disabled={disabled} onClick={() => setReportOpen(true)}>
          Signaler
        </Button>
      </div>
      {props.productCollectionIds.length ? (
        <p className="text-xs text-muted">
          Dans {props.productCollectionIds.length} collection(s).
        </p>
      ) : null}
      <EnrichmentStatus
        workspaceId={props.workspaceId}
        productId={props.productId}
        canEdit={props.canEdit}
      />
      {disabled ? (
        <p className="text-xs text-muted">Rôle lecteur : consultation uniquement.</p>
      ) : null}
      {message ? (
        <p role="status" className="text-xs text-muted">
          {message}
        </p>
      ) : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <CollectionDialog
        open={collectionOpen}
        onOpenChange={setCollectionOpen}
        productName={props.productName}
        workspaceId={props.workspaceId}
        collections={collections}
        onCreated={(c) => setCollections((x) => [...x, c])}
        onPick={async (id) => {
          setCollectionOpen(false);
          try {
            await api(`${base}/collections/${id}/items`, {
              method: "POST",
              body: { product_id: props.productId },
            });
            setMessage("Ajouté à la collection.");
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Erreur");
          }
        }}
      />
      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        workspaceId={props.workspaceId}
        productId={props.productId}
        productName={props.productName}
      />
    </aside>
  );
}
