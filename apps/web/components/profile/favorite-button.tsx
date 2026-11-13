"use client";
import { useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";

/** One-tap favourite on the profile hero (optimistic, reverted on error). */
export function FavoriteButton({
  workspaceId,
  productId,
  productName,
  initial,
  canEdit,
}: {
  workspaceId: string;
  productId: string;
  productName: string;
  initial: boolean;
  canEdit: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    const next = !on;
    setOn(next);
    setBusy(true);
    try {
      await api(`/workspaces/${workspaceId}/products/${productId}/state`, {
        method: "PATCH",
        body: { is_favorite: next },
      });
    } catch {
      setOn(!next);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button
      variant="secondary"
      size="icon"
      className="size-10"
      aria-pressed={on}
      aria-label={on ? `Retirer ${productName} des favoris` : `Ajouter ${productName} aux favoris`}
      title={on ? "Retirer des favoris" : "Ajouter aux favoris"}
      disabled={!canEdit || busy}
      onClick={() => void toggle()}
    >
      <Star size={18} className={cn(on && "fill-warning text-warning")} />
    </Button>
  );
}
