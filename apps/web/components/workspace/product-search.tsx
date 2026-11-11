"use client";
import { useState } from "react";
import type { CatalogPage } from "@sor/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { api } from "@/lib/client-api";
import type { ProductChoice } from "@/lib/product-choices";

/**
 * Catalog search for the product pickers (same read-only search as Discover and
 * Ask AI): lets the user reach any visible product, not only the preloaded ones.
 */
export function ProductSearch({
  workspaceId,
  id,
  onResults,
}: {
  workspaceId: string;
  id: string;
  onResults: (rows: ProductChoice[]) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function search() {
    const q = text.trim();
    if (!q) return;
    setBusy(true);
    setMessage(null);
    try {
      const page = await api<CatalogPage>(`/workspaces/${workspaceId}/products/search`, {
        method: "POST",
        body: { filters: { text: q }, sort: "relevance", limit: 20 },
      });
      onResults(page.data.map((p) => ({ id: p.id, name: p.name })));
      setMessage(page.data.length === 0 ? "Aucun SaaS trouvé." : null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "La recherche du catalogue a échoué.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Input
          id={id}
          aria-label="Rechercher un SaaS du catalogue"
          placeholder="Rechercher un SaaS du catalogue"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter searches instead of submitting the surrounding form.
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
        />
        <Button type="button" onClick={() => void search()} disabled={busy || !text.trim()}>
          {busy ? "Recherche…" : "Rechercher"}
        </Button>
      </div>
      {message ? (
        <p className="text-xs text-muted" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
