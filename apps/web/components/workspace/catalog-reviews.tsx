"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { EmptyState, ErrorNote } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import { CATALOG_REVIEW_REASON, formatDate } from "@/lib/labels";

export interface CatalogReviewRow {
  id: string;
  source_name: string | null;
  external_id: string;
  name: string;
  description: string | null;
  website_url: string | null;
  source_url: string | null;
  reason: string;
  candidates: Array<{ id: string; name: string; website_url: string | null }>;
  first_seen_at: string;
}

/**
 * Collected catalog listings sent to review by the ingestion rules (S8.2):
 * the operator creates the product, attaches the listing to an existing
 * product, or rejects it. Every decision is audited server-side.
 */
export function CatalogReviews({ total, reviews }: { total: number; reviews: CatalogReviewRow[] }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  async function resolve(id: string, body: Record<string, unknown>) {
    setError(null);
    try {
      await api(`/operator/catalog-reviews/${id}/resolution`, { method: "POST", body });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }
  const noteOf = (id: string) => notes[id]?.trim() || undefined;
  return (
    <section
      className="space-y-2 rounded-2xl border border-border bg-surface p-4"
      aria-labelledby="catalog-reviews-title"
    >
      <h2 id="catalog-reviews-title" className="font-semibold">
        Annonces de catalogue à revoir ({total})
      </h2>
      <p className="text-sm text-muted">
        Annonces collectées que les règles d’identité n’ont pas importées seules. Elles ne sont
        jamais visibles dans Discover tant qu’elles ne sont pas créées ou rattachées.
        {total > reviews.length ? ` Les ${reviews.length} plus anciennes sont affichées.` : ""}
      </p>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {reviews.length === 0 ? <EmptyState title="Aucune annonce en attente de revue" /> : null}
      {reviews.map((r) => (
        <div
          key={r.id}
          className="space-y-2 rounded border border-border p-3"
          data-testid="catalog-review"
        >
          <p className="font-medium">
            {r.name}{" "}
            <span className="text-sm text-muted">
              {r.source_name ?? "Source"} · {r.external_id} · {formatDate(r.first_seen_at)}
            </span>
          </p>
          <p className="text-sm">
            <span className="font-medium">Motif :</span>{" "}
            {CATALOG_REVIEW_REASON[r.reason] ?? r.reason}
          </p>
          {r.description ? <p className="text-sm text-muted">{r.description}</p> : null}
          <p className="flex flex-wrap gap-3 text-sm">
            {r.website_url ? (
              <a
                className="text-accent underline"
                href={r.website_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                Site annoncé
              </a>
            ) : null}
            {r.source_url ? (
              <a
                className="text-accent underline"
                href={r.source_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                Annonce source
              </a>
            ) : null}
          </p>
          {r.candidates.length ? (
            <p className="text-xs text-muted">
              Produits candidats :{" "}
              {r.candidates
                .map((c) => `${c.name} (${c.website_url ?? "site inconnu"})`)
                .join(" ; ")}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label={`Note pour ${r.name}`}
              placeholder="Note (obligatoire pour rejeter)"
              value={notes[r.id] ?? ""}
              maxLength={1000}
              onChange={(e) => setNotes((x) => ({ ...x, [r.id]: e.target.value }))}
              className="max-w-md"
            />
            <Button
              size="sm"
              disabled={r.reason === "shared_host_website"}
              title={
                r.reason === "shared_host_website"
                  ? "Un hébergeur partagé n’est pas un site officiel"
                  : undefined
              }
              onClick={() => void resolve(r.id, { action: "create", note: noteOf(r.id) })}
            >
              Créer le produit
            </Button>
            {r.candidates.map((c) => (
              <Button
                key={c.id}
                size="sm"
                onClick={() =>
                  void resolve(r.id, { action: "attach", product_id: c.id, note: noteOf(r.id) })
                }
              >
                Rattacher à {c.name}
              </Button>
            ))}
            <Button
              size="sm"
              variant="danger"
              disabled={!noteOf(r.id)}
              onClick={() => void resolve(r.id, { action: "reject", note: noteOf(r.id) })}
            >
              Rejeter
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}
