"use client";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/states";

export default function WorkspaceError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="space-y-3">
      <ErrorNote>
        Une erreur inattendue est survenue. Aucune donnée n’a été modifiée par cet affichage.
      </ErrorNote>
      <Button onClick={reset}>Réessayer</Button>
    </div>
  );
}
