"use client";
import { useState } from "react";
import { BookmarkPlus } from "lucide-react";
import type { CatalogFilters, CatalogSort } from "@sor/contracts";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/states";
import { api } from "@/lib/client-api";

export function SaveSearchDialog({
  workspaceId,
  filters,
  sort,
}: {
  workspaceId: string;
  filters: CatalogFilters;
  sort: CatalogSort;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pinned, setPinned] = useState(false);
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  async function save() {
    try {
      await api(`/workspaces/${workspaceId}/saved-searches`, {
        method: "POST",
        body: {
          name,
          filters,
          sort_key: sort,
          search_text: filters.text ?? null,
          is_pinned: pinned,
        },
      });
      setState("saved");
    } catch {
      setState("error");
    }
  }
  return (
    <>
      <button
        type="button"
        aria-label="Sauvegarder la recherche"
        title="Sauvegarder la recherche"
        onClick={() => {
          setOpen(true);
          setState("idle");
        }}
        className="grid size-8 place-items-center rounded-full border border-border text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <BookmarkPlus size={15} aria-hidden />
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Sauvegarder la recherche"
        description="Les filtres, le texte et le tri actuels sont enregistrés dans l’espace de travail."
      >
        {state === "saved" ? (
          <p role="status" className="text-sm">
            Recherche « {name} » sauvegardée.
          </p>
        ) : (
          <div className="space-y-3">
            <Field label="Nom" htmlFor="search-name">
              <Input
                id="search-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
                className="accent-accent"
              />{" "}
              Épingler
            </label>
            {state === "error" ? (
              <ErrorNote>La recherche n’a pas pu être sauvegardée.</ErrorNote>
            ) : null}
            <Button variant="primary" disabled={!name.trim()} onClick={() => void save()}>
              Sauvegarder
            </Button>
          </div>
        )}
      </Dialog>
    </>
  );
}
