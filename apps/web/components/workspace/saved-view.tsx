"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorNote } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import { REPORT_TYPE, formatDate } from "@/lib/labels";
import { ProductLogo } from "@/components/discover/product-card";

interface ProductRef {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
}

interface Props {
  workspaceId: string;
  userId: string;
  canEdit: boolean;
  canAdmin: boolean;
  collections: Array<{
    id: string;
    name: string;
    description: string | null;
    items: Array<{ id: string; notes: string | null; product: ProductRef }>;
  }>;
  favorites: ProductRef[];
  hidden: ProductRef[];
  searches: Array<{
    id: string;
    name: string;
    kind: string;
    is_pinned: boolean;
    created_by: string;
    invalid: boolean;
  }>;
  tags: Array<{ id: string; name: string; color: string | null; count: number }>;
  reports: Array<{
    id: string;
    product: string;
    type: string;
    message: string;
    status: string;
    note: string | null;
    created_at: string;
  }>;
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export function SavedView(p: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [newCollection, setNewCollection] = useState("");
  const [newTag, setNewTag] = useState("");
  const [compare, setCompare] = useState<string[]>([]);
  const base = `/workspaces/${p.workspaceId}`;
  const link = (prod: ProductRef) => (
    <Link className="font-medium hover:underline" href={`/w/${p.workspaceId}/saas/${prod.slug}`}>
      {prod.name}
    </Link>
  );

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }
  const toggleCompare = (id: string) =>
    setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id].slice(0, 10)));
  const compareBox = (prod: ProductRef) => (
    <input
      type="checkbox"
      aria-label={`Comparer ${prod.name}`}
      className="accent-accent"
      checked={compare.includes(prod.id)}
      onChange={() => toggleCompare(prod.id)}
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Saved</h1>
        <Link
          href={`/w/${p.workspaceId}/compare?ids=${compare.join(",")}`}
          aria-disabled={compare.length < 2}
          className={`ml-auto rounded-full border border-border px-3.5 py-1.5 text-sm transition-colors hover:bg-surface-2 ${compare.length < 2 ? "pointer-events-none opacity-50" : ""}`}
        >
          Comparer la sélection ({compare.length})
        </Link>
      </div>
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <Block title="Favoris">
        {p.favorites.length ? (
          <ul className="-mx-1 divide-y divide-border">
            {p.favorites.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-1 py-2.5">
                {compareBox(f)}
                <ProductLogo name={f.name} logoUrl={null} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{link(f)}</span>
                  {f.tagline ? (
                    <span className="block truncate text-[13px] text-muted">{f.tagline}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Aucun favori">
            Ajoutez des SaaS aux favoris depuis Discover ou leur fiche.
          </EmptyState>
        )}
      </Block>

      <Block title="Collections">
        {p.canEdit ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() =>
                api(`${base}/collections`, { method: "POST", body: { name: newCollection } }),
              ).then(() => setNewCollection(""));
            }}
          >
            <Input
              aria-label="Nom de la collection"
              placeholder="Nouvelle collection"
              value={newCollection}
              onChange={(e) => setNewCollection(e.target.value)}
              maxLength={120}
            />
            <Button type="submit" variant="primary" disabled={!newCollection.trim()}>
              Créer
            </Button>
          </form>
        ) : null}
        {p.collections.length === 0 ? <EmptyState title="Aucune collection" /> : null}
        {p.collections.map((c) => (
          <div key={c.id} className="rounded-xl border border-border p-3" data-testid="collection">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">{c.name}</h3>
              <Badge>{c.items.length} SaaS</Badge>
              {p.canEdit ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const name = window.prompt("Nouveau nom", c.name);
                    if (name?.trim())
                      void run(() =>
                        api(`${base}/collections/${c.id}`, { method: "PATCH", body: { name } }),
                      );
                  }}
                >
                  Renommer
                </Button>
              ) : null}
              {p.canAdmin ? (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    if (window.confirm(`Supprimer la collection « ${c.name} » ?`))
                      void run(() => api(`${base}/collections/${c.id}`, { method: "DELETE" }));
                  }}
                >
                  Supprimer
                </Button>
              ) : null}
            </div>
            <ul className="mt-2 space-y-2">
              {c.items.map((i) => (
                <CollectionItem
                  key={i.id}
                  item={i}
                  canEdit={p.canEdit}
                  link={link}
                  compareBox={compareBox}
                  onSave={(notes) =>
                    run(() =>
                      api(`${base}/collections/${c.id}/items/${i.id}`, {
                        method: "PATCH",
                        body: { notes },
                      }),
                    )
                  }
                  onRemove={() =>
                    run(() =>
                      api(`${base}/collections/${c.id}/items/${i.id}`, { method: "DELETE" }),
                    )
                  }
                />
              ))}
            </ul>
          </div>
        ))}
      </Block>

      <Block title="Recherches sauvegardées">
        {p.searches.length ? (
          <ul className="space-y-1">
            {p.searches.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-2"
                data-testid="saved-search"
              >
                {s.is_pinned ? <Badge tone="accent">Épinglée</Badge> : null}
                <Link
                  className="font-medium hover:underline"
                  href={`/w/${p.workspaceId}/discover?search=${s.id}`}
                >
                  {s.name}
                </Link>
                {s.invalid ? <Badge tone="warning">Filtres invalides ignorés</Badge> : null}
                {p.canEdit ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void run(() =>
                          api(`${base}/saved-searches/${s.id}/duplicate`, { method: "POST" }),
                        )
                      }
                    >
                      Dupliquer
                    </Button>
                    {s.created_by === p.userId || p.canAdmin ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void run(() =>
                              api(`${base}/saved-searches/${s.id}`, {
                                method: "PATCH",
                                body: { is_pinned: !s.is_pinned },
                              }),
                            )
                          }
                        >
                          {s.is_pinned ? "Désépingler" : "Épingler"}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            if (window.confirm(`Supprimer « ${s.name} » ?`))
                              void run(() =>
                                api(`${base}/saved-searches/${s.id}`, { method: "DELETE" }),
                              );
                          }}
                        >
                          Supprimer
                        </Button>
                      </>
                    ) : null}
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Aucune recherche sauvegardée">
            Enregistrez une combinaison de filtres depuis Discover.
          </EmptyState>
        )}
      </Block>

      <Block title="Tags">
        {p.canEdit ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => api(`${base}/tags`, { method: "POST", body: { name: newTag } })).then(
                () => setNewTag(""),
              );
            }}
          >
            <Input
              aria-label="Nom du tag"
              placeholder="Nouveau tag"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              maxLength={60}
            />
            <Button type="submit" disabled={!newTag.trim()}>
              Créer
            </Button>
          </form>
        ) : null}
        <ul className="flex flex-wrap gap-2">
          {p.tags.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-sm"
            >
              {t.name} <span className="text-xs text-muted">({t.count})</span>
              {p.canEdit ? (
                <button
                  type="button"
                  aria-label={`Supprimer le tag ${t.name}`}
                  className="text-muted hover:text-danger"
                  onClick={() => void run(() => api(`${base}/tags/${t.id}`, { method: "DELETE" }))}
                >
                  ×
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </Block>

      <Block title="SaaS masqués">
        {p.hidden.length ? (
          <ul className="space-y-1">
            {p.hidden.map((h) => (
              <li key={h.id} className="flex items-center gap-2">
                {link(h)}
                {p.canEdit ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void run(() =>
                        api(`${base}/products/${h.id}/state`, {
                          method: "PATCH",
                          body: { is_hidden: false },
                        }),
                      )
                    }
                  >
                    Ne plus masquer
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Aucun SaaS masqué.</p>
        )}
      </Block>

      <Block title="Signalements envoyés">
        {p.reports.length ? (
          <ul className="space-y-1 text-sm">
            {p.reports.map((r) => (
              <li key={r.id}>
                <span className="font-medium">{r.product}</span> — {REPORT_TYPE[r.type] ?? r.type} —{" "}
                {r.message}{" "}
                <Badge
                  tone={
                    r.status === "open"
                      ? "warning"
                      : r.status === "accepted"
                        ? "success"
                        : "neutral"
                  }
                >
                  {r.status === "open" ? "Ouvert" : r.status === "accepted" ? "Accepté" : "Rejeté"}
                </Badge>{" "}
                <span className="text-xs text-muted">
                  {formatDate(r.created_at)}
                  {r.note ? ` · ${r.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Aucun signalement.</p>
        )}
      </Block>
    </div>
  );
}

function CollectionItem({
  item,
  canEdit,
  link,
  compareBox,
  onSave,
  onRemove,
}: {
  item: { id: string; notes: string | null; product: ProductRef };
  canEdit: boolean;
  link: (p: ProductRef) => ReactNode;
  compareBox: (p: ProductRef) => ReactNode;
  onSave: (notes: string | null) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
}) {
  const [notes, setNotes] = useState(item.notes ?? "");
  return (
    <li className="space-y-1">
      <div className="flex items-center gap-2">
        {compareBox(item.product)}
        {link(item.product)}
        {canEdit ? (
          <Button size="sm" variant="ghost" onClick={() => void onRemove()}>
            Retirer
          </Button>
        ) : null}
      </div>
      {canEdit ? (
        <div className="flex gap-2">
          <Textarea
            aria-label={`Note sur ${item.product.name}`}
            className="min-h-9"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={5000}
          />
          <Button
            size="sm"
            disabled={notes === (item.notes ?? "")}
            onClick={() => void onSave(notes || null)}
          >
            Enregistrer
          </Button>
        </div>
      ) : item.notes ? (
        <p className="text-sm text-muted">{item.notes}</p>
      ) : null}
    </li>
  );
}
