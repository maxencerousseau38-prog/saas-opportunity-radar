"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutGrid, List, Rows3, Search, SlidersHorizontal, X } from "lucide-react";
import type { CatalogFilters, CatalogPage, CatalogSort, ProductCard } from "@sor/contracts";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { EmptyState, ErrorNote } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import { SORTS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { activeChips, filtersFromPreferences } from "./filter-model";
import { FilterPanel } from "./filter-panel";
import { ManualAddDialog } from "./manual-add-dialog";
import { ProductCardView, ProductListRow } from "./product-card";
import { SaveSearchDialog } from "./save-search-dialog";
import type { DiscoverProps, ViewMode } from "./types";

const PAGE_SIZE = 24;

export function DiscoverView(props: DiscoverProps) {
  const { workspaceId } = props;
  const router = useRouter();
  const [filters, setFilters] = useState<CatalogFilters>(props.initialFilters);
  const [text, setText] = useState(props.initialFilters.text ?? "");
  const [sort, setSort] = useState<CatalogSort>(props.initialSort);
  const [view, setView] = useState<ViewMode>("feed");
  const [items, setItems] = useState<ProductCard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [collections, setCollections] = useState(props.collections);
  const requestSeq = useRef(0);
  const seed = useRef<number>(Math.floor(Math.random() * 2_000_000_000));

  useEffect(() => {
    const stored = window.localStorage.getItem("sor.discover.view");
    if (stored === "feed" || stored === "grid" || stored === "list") setView(stored);
  }, []);
  const changeView = (v: ViewMode) => {
    setView(v);
    window.localStorage.setItem("sor.discover.view", v);
  };

  // Debounced free-text search.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) =>
        f.text === (text.trim() || undefined) ? f : { ...f, text: text.trim() || undefined },
      );
    }, 300);
    return () => clearTimeout(t);
  }, [text]);

  const body = useMemo(
    () => ({
      filters,
      sort,
      limit: PAGE_SIZE,
      random_seed: sort === "random" ? seed.current : undefined,
    }),
    [filters, sort],
  );

  const load = useCallback(
    async (after: string | null) => {
      const seq = ++requestSeq.current;
      setLoading(true);
      setError(null);
      try {
        const [page, total] = await Promise.all([
          api<CatalogPage>(`/workspaces/${workspaceId}/products/search`, {
            method: "POST",
            body: { ...body, ...(after ? { cursor: after } : {}) },
          }),
          after
            ? Promise.resolve(null)
            : api<{ data: { count: number } }>(`/workspaces/${workspaceId}/products/search/count`, {
                method: "POST",
                body: { filters },
              }),
        ]);
        if (seq !== requestSeq.current) return;
        setItems((prev) => (after ? [...prev, ...page.data] : page.data));
        setCursor(page.next_cursor);
        if (total) setCount(total.data.count);
      } catch (err) {
        if (seq === requestSeq.current)
          setError(err instanceof Error ? err.message : "Erreur inattendue");
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [workspaceId, body, filters],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  // Infinite scroll: load the next page when the sentinel becomes visible.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !loading) void load(cursor);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [cursor, loading, load]);

  const categoryName = useCallback(
    (slug: string) => props.categories.find((c) => c.slug === slug)?.name ?? slug,
    [props.categories],
  );
  const chips = activeChips(filters, categoryName);

  const updateCard = (id: string, patch: Partial<ProductCard["workspace"]>) =>
    setItems((prev) =>
      prev
        .map((p) => (p.id === id ? { ...p, workspace: { ...p.workspace, ...patch } } : p))
        .filter((p) => filters.include_hidden || !p.workspace.is_hidden),
    );

  const cardProps = {
    workspaceId,
    canEdit: props.canEdit,
    collections,
    onCollectionCreated: (c: { id: string; name: string }) =>
      setCollections((prev) => [...prev, c]),
    onChange: updateCard,
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-xl font-semibold">Discover</h1>
        <div className="relative min-w-60 flex-1">
          <Search size={16} className="pointer-events-none absolute top-2.5 left-2.5 text-muted" />
          <Input
            aria-label="Rechercher un SaaS"
            placeholder="Nom, fonctionnalité, problème, catégorie…"
            className="pl-8"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <Button onClick={() => setPanelOpen(true)} aria-expanded={panelOpen}>
          <SlidersHorizontal size={16} /> Filtres{chips.length ? ` (${chips.length})` : ""}
        </Button>
        <Select
          aria-label="Trier"
          value={sort}
          onChange={(e) => setSort(e.target.value as CatalogSort)}
          className="w-auto"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value} disabled={Boolean(s.disabled)} title={s.disabled}>
              {s.label}
              {s.disabled ? " — bientôt" : ""}
            </option>
          ))}
        </Select>
        <div
          role="group"
          aria-label="Mode d’affichage"
          className="flex rounded-md border border-border"
        >
          {(
            [
              ["feed", Rows3, "Feed"],
              ["grid", LayoutGrid, "Grille"],
              ["list", List, "Liste"],
            ] as const
          ).map(([mode, Icon, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={view === mode}
              aria-label={label}
              title={label}
              onClick={() => changeView(mode)}
              className={cn("p-2", view === mode ? "bg-surface-2 text-fg" : "text-muted")}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted" aria-live="polite" data-testid="result-count">
          {count === null ? "…" : `${count} SaaS`}
        </span>
        {chips.map((chip) => (
          <span
            key={chip.key}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5"
          >
            {chip.label}
            <button
              type="button"
              aria-label={`Retirer ${chip.label}`}
              onClick={() => setFilters(chip.remove(filters))}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {chips.length ? (
          <button
            type="button"
            className="text-muted underline"
            onClick={() => {
              setFilters({ configurable_exclusions: [], include_hidden: false });
              setText("");
            }}
          >
            Tout effacer
          </button>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-2">
          {props.savedSearches.length ? (
            <Select
              aria-label="Recherches sauvegardées"
              value=""
              onChange={(e) => {
                if (e.target.value)
                  router.push(`/w/${workspaceId}/discover?search=${e.target.value}`);
              }}
              className="h-8 w-auto"
            >
              <option value="">Recherches sauvegardées…</option>
              {props.savedSearches.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          ) : null}
          <Button
            size="sm"
            onClick={() => setFilters(filtersFromPreferences(props.preferences, filters))}
          >
            Mes préférences
          </Button>
          {props.canEdit ? (
            <SaveSearchDialog workspaceId={workspaceId} filters={filters} sort={sort} />
          ) : null}
          {props.canEdit ? (
            <ManualAddDialog workspaceId={workspaceId} categories={props.categories} />
          ) : null}
        </div>
      </div>
      {props.initialSearchName ? (
        <p className="text-sm text-muted">Recherche sauvegardée : {props.initialSearchName}</p>
      ) : null}
      <p className="text-xs text-muted">
        Les SaaS d’affiliation et de partenariat sont exclus en permanence ; ce filtre ne peut pas
        être retiré.
      </p>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {!loading && !error && items.length === 0 ? (
        <EmptyState title="Aucun SaaS ne correspond">
          Retirez un filtre, incluez les valeurs inconnues ou{" "}
          {props.canEdit
            ? "ajoutez un SaaS manuellement."
            : "demandez à un membre d’ajouter un SaaS."}
        </EmptyState>
      ) : null}

      {view === "list" ? (
        items.length ? (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-xs text-muted">
                <tr>
                  <th className="px-3 py-2">SaaS</th>
                  <th className="px-3 py-2">Catégorie</th>
                  <th className="px-3 py-2">Clientèle</th>
                  <th className="px-3 py-2">Pays</th>
                  <th className="px-3 py-2">Équipe</th>
                  <th className="px-3 py-2">Année</th>
                  <th className="px-3 py-2">Tarification</th>
                  <th className="px-3 py-2">Acquisition documentée</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <ProductListRow key={p.id} product={p} {...cardProps} />
                ))}
              </tbody>
            </table>
          </div>
        ) : null
      ) : (
        <ul
          className={cn(
            "gap-3",
            view === "grid"
              ? "grid sm:grid-cols-2 lg:grid-cols-3"
              : "mx-auto flex max-w-3xl flex-col",
          )}
        >
          {items.map((p) => (
            <li key={p.id}>
              <ProductCardView product={p} compact={view === "feed"} {...cardProps} />
            </li>
          ))}
        </ul>
      )}

      <div ref={sentinel} className="flex justify-center py-4">
        {loading ? (
          <span role="status" className="text-sm text-muted">
            Chargement…
          </span>
        ) : cursor ? (
          <Button onClick={() => void load(cursor)}>Charger plus</Button>
        ) : items.length ? (
          <span className="text-sm text-muted">Fin des résultats</span>
        ) : null}
      </div>

      <FilterPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        workspaceId={workspaceId}
        categories={props.categories}
        value={filters}
        onApply={(f) => setFilters({ ...f, text: filters.text })}
      />
      <p className="text-xs text-muted">
        <Link className="underline" href={`/w/${workspaceId}/saved`}>
          Gérer les recherches sauvegardées et les collections
        </Link>
      </p>
    </section>
  );
}
