"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  ArrowUpDown,
  LayoutGrid,
  List,
  RefreshCw,
  Rows3,
  Search,
  SearchX,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { CatalogFilters, CatalogPage, CatalogSort, ProductCard } from "@sor/contracts";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { EmptyState, ErrorNote, Skeleton } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import { SORTS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { activeChips, filtersFromPreferences } from "./filter-model";
import { FilterPanel } from "./filter-panel";
import { masonry } from "./masonry";
import { ManualAddDialog } from "./manual-add-dialog";
import { ProductCardView, ProductListRow } from "./product-card";
import { SaveSearchDialog } from "./save-search-dialog";
import type { DiscoverProps, ViewMode } from "./types";

const PAGE_SIZE = 24;
const EMPTY_FILTERS: CatalogFilters = { configurable_exclusions: [], include_hidden: false };

/** Grid columns by viewport width (Pinterest-like masonry). */
function useColumns(): number {
  const [cols, setCols] = useState(2);
  useEffect(() => {
    const queries = [
      [window.matchMedia("(min-width: 1280px)"), 4],
      [window.matchMedia("(min-width: 900px)"), 3],
    ] as const;
    const update = () => setCols(queries.find(([q]) => q.matches)?.[1] ?? 2);
    update();
    for (const [q] of queries) q.addEventListener("change", update);
    return () => {
      for (const [q] of queries) q.removeEventListener("change", update);
    };
  }, []);
  return cols;
}

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
  const [showTop, setShowTop] = useState(false);
  const requestSeq = useRef(0);
  const seed = useRef<number>(Math.floor(Math.random() * 2_000_000_000));
  const cols = useColumns();

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("sor.discover.view");
      if (stored === "feed" || stored === "grid" || stored === "list") setView(stored);
    } catch {
      // Storage unavailable (private mode): keep the default view.
    }
  }, []);
  const changeView = (v: ViewMode) => {
    setView(v);
    try {
      window.localStorage.setItem("sor.discover.view", v);
    } catch {
      // Not persisted; the choice still applies to this visit.
    }
  };

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 1600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
        setItems((prev) => {
          if (!after) return page.data;
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...page.data.filter((p) => !seen.has(p.id))];
        });
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

  // Infinite scroll: prefetch the next page well before the end of the feed.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !loading) void load(cursor);
      },
      { rootMargin: "1200px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [cursor, loading, load, error]);

  const categoryName = useCallback(
    (slug: string) => props.categories.find((c) => c.slug === slug)?.name ?? slug,
    [props.categories],
  );
  const allChips = activeChips(filters, categoryName);
  const topCategories = useMemo(
    () => props.categories.filter((c) => c.parent_id === null && !c.slug.startsWith("excluded-")),
    [props.categories],
  );
  const selectedCategory =
    filters.categories?.slugs.length === 1 ? filters.categories.slugs[0] : undefined;
  // The category picked in the chip bar is shown there, not repeated as a filter chip.
  const chips = allChips.filter(
    (c) =>
      !(
        selectedCategory &&
        topCategories.some((t) => t.slug === selectedCategory) &&
        c.key === `cat:${selectedCategory}`
      ),
  );
  const pickCategory = (slug: string | null) => {
    setFilters((f) => ({ ...f, categories: slug ? { slugs: [slug] } : undefined }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

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

  const columns = useMemo(() => masonry(items, cols), [items, cols]);
  const initialLoading = loading && items.length === 0;

  return (
    <section className="relative">
      <h1 className="sr-only">Discover</h1>

      {/* Sticky search: always within reach while scrolling the feed. */}
      <div className="pt-safe sticky top-0 z-30 -mx-4 bg-bg/85 px-4 pt-2 pb-2 backdrop-blur-xl backdrop-saturate-150 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10 lg:pt-4">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Rechercher un SaaS</span>
            <Search
              size={17}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              enterKeyHint="search"
              aria-label="Rechercher un SaaS"
              placeholder="Rechercher un SaaS, un besoin…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="h-11 w-full rounded-full border border-border bg-surface pr-10 pl-10 text-base text-fg placeholder:text-muted/80 focus-visible:border-ring focus-visible:outline-none sm:text-sm [&::-webkit-search-cancel-button]:hidden"
            />
            {text ? (
              <button
                type="button"
                aria-label="Effacer la recherche"
                onClick={() => setText("")}
                className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-surface-2"
              >
                <X size={15} />
              </button>
            ) : null}
          </label>
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            aria-expanded={panelOpen}
            aria-label={`Filtres${chips.length ? ` (${chips.length})` : ""}`}
            className={cn(
              "relative grid size-11 shrink-0 place-items-center rounded-full border transition-colors",
              chips.length
                ? "border-accent bg-accent text-accent-fg"
                : "border-border bg-surface text-fg hover:bg-surface-2",
            )}
          >
            <SlidersHorizontal size={18} aria-hidden />
            {chips.length ? (
              <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-bg bg-fg text-[10px] font-semibold text-bg">
                {chips.length}
              </span>
            ) : null}
          </button>
        </div>

        {/* Categories: one tap to change the feed. */}
        <div className="scrollbar-none -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-auto lg:max-w-3xl lg:px-0 lg:[mask-image:linear-gradient(to_right,black_92%,transparent)]">
          <CategoryChip
            active={!filters.categories?.slugs.length}
            onClick={() => pickCategory(null)}
          >
            Tout
          </CategoryChip>
          {topCategories.map((c) => (
            <CategoryChip
              key={c.id}
              active={selectedCategory === c.slug}
              onClick={() => pickCategory(selectedCategory === c.slug ? null : c.slug)}
            >
              {c.name}
            </CategoryChip>
          ))}
        </div>
      </div>

      {/* Toolbar: count, sort, view. */}
      <div
        className="mx-auto mt-3 flex max-w-3xl items-center gap-2 data-[wide=true]:max-w-none"
        data-wide={view === "grid"}
      >
        <span
          className="text-[13px] text-muted tabular-nums"
          aria-live="polite"
          data-testid="result-count"
        >
          {count === null ? "…" : `${count.toLocaleString("fr-FR").replace(/\s/g, " ")} SaaS`}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="relative grid size-8 place-items-center rounded-full border border-border text-muted sm:size-auto sm:border-0">
            <ArrowUpDown size={15} aria-hidden className="sm:hidden" />
            <Select
              aria-label="Trier"
              value={sort}
              onChange={(e) => setSort(e.target.value as CatalogSort)}
              className="absolute inset-0 h-8 w-full cursor-pointer opacity-0 sm:static sm:w-44 sm:rounded-full sm:border-border sm:bg-transparent sm:pr-7 sm:pl-3 sm:text-[13px] sm:opacity-100"
            >
              {SORTS.map((s) => (
                <option
                  key={s.value}
                  value={s.value}
                  disabled={Boolean(s.disabled)}
                  title={s.disabled}
                >
                  {s.label}
                  {s.disabled ? " — indisponible" : ""}
                </option>
              ))}
            </Select>
          </div>
          <div
            role="group"
            aria-label="Mode d’affichage"
            className="flex rounded-full border border-border p-0.5"
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
                className={cn(
                  "grid size-7 place-items-center rounded-full transition-colors",
                  view === mode ? "bg-surface-3 text-fg" : "text-muted hover:text-fg",
                )}
              >
                <Icon size={15} />
              </button>
            ))}
          </div>
          {props.canEdit ? (
            <SaveSearchDialog workspaceId={workspaceId} filters={filters} sort={sort} />
          ) : null}
          {props.canEdit ? (
            <ManualAddDialog workspaceId={workspaceId} categories={props.categories} />
          ) : null}
        </div>
      </div>

      {chips.length || props.initialSearchName ? (
        <div className="mx-auto mt-2 flex max-w-3xl flex-wrap items-center gap-1.5 text-[13px]">
          {props.initialSearchName ? (
            <span className="mr-1 text-muted">
              Recherche sauvegardée : {props.initialSearchName}
            </span>
          ) : null}
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pr-1 pl-2.5"
            >
              {chip.label}
              <button
                type="button"
                aria-label={`Retirer ${chip.label}`}
                onClick={() => setFilters(chip.remove(filters))}
                className="grid size-5 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-fg"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          {chips.length ? (
            <button
              type="button"
              className="px-1 text-muted underline-offset-4 hover:underline"
              onClick={() => {
                setFilters(EMPTY_FILTERS);
                setText("");
              }}
            >
              Tout effacer
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4">
        {error ? (
          <div className="mx-auto mb-4 flex max-w-3xl flex-wrap items-center gap-2">
            <ErrorNote>{error}</ErrorNote>
            <Button size="sm" onClick={() => void load(items.length ? cursor : null)}>
              <RefreshCw size={14} /> Réessayer
            </Button>
          </div>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <div className="mx-auto max-w-3xl">
            <EmptyState title="Aucun SaaS ne correspond" icon={<SearchX size={20} />}>
              Essayez un autre mot, retirez un filtre ou incluez les valeurs inconnues.
            </EmptyState>
          </div>
        ) : null}

        {initialLoading ? (
          <FeedSkeleton view={view} cols={cols} />
        ) : view === "list" ? (
          items.length ? (
            <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-surface px-3">
              {items.map((p) => (
                <ProductListRow key={p.id} product={p} {...cardProps} />
              ))}
            </div>
          ) : null
        ) : view === "grid" ? (
          <div className="flex items-start gap-3">
            {columns.map((column, i) => (
              <ul key={i} className="flex min-w-0 flex-1 flex-col gap-3">
                {column.map((p) => (
                  <li key={p.id}>
                    <ProductCardView product={p} variant="grid" {...cardProps} />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        ) : (
          <ul className="mx-auto flex max-w-xl flex-col gap-4">
            {items.map((p) => (
              <li key={p.id}>
                <ProductCardView product={p} variant="feed" {...cardProps} />
              </li>
            ))}
          </ul>
        )}

        <div ref={sentinel} className="flex justify-center py-8">
          {loading && items.length ? (
            <span role="status" className="flex items-center gap-2 text-sm text-muted">
              <span className="size-4 animate-spin rounded-full border-2 border-muted/40 border-t-fg" />
              Chargement…
            </span>
          ) : cursor && !error ? (
            <Button variant="outline" onClick={() => void load(cursor)}>
              Charger plus
            </Button>
          ) : items.length ? (
            <span className="text-sm text-muted">Vous avez tout vu · {items.length} SaaS</span>
          ) : null}
        </div>
      </div>

      <p className="mx-auto max-w-3xl border-t border-border pt-4 text-xs text-muted">
        Catalogue issu de sources réelles et datées. Les SaaS d’affiliation et de partenariat sont
        exclus en permanence.{" "}
        <Link className="underline underline-offset-4" href={`/w/${workspaceId}/saved`}>
          Collections et recherches
        </Link>
      </p>

      {showTop ? (
        <button
          type="button"
          aria-label="Revenir en haut"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 grid size-11 animate-pop place-items-center rounded-full border border-border bg-surface-2/90 text-fg shadow-xl backdrop-blur lg:right-8 lg:bottom-8"
        >
          <ArrowUp size={18} />
        </button>
      ) : null}

      <FilterPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        workspaceId={workspaceId}
        categories={props.categories}
        value={filters}
        onApply={(f) => setFilters({ ...f, text: filters.text })}
        onPreferences={(draft) => filtersFromPreferences(props.preferences, draft)}
        savedSearches={props.savedSearches}
        onOpenSavedSearch={(id) => {
          setPanelOpen(false);
          router.push(`/w/${workspaceId}/discover?search=${id}`);
        }}
      />
    </section>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-8 shrink-0 rounded-full border px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors",
        active
          ? "border-accent bg-accent text-accent-fg"
          : "border-border bg-surface text-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function FeedSkeleton({ view, cols }: { view: ViewMode; cols: number }) {
  if (view === "list")
    return (
      <div
        data-testid="discover-skeleton"
        className="mx-auto max-w-3xl space-y-4 rounded-2xl border border-border bg-surface p-4"
      >
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-11 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  const card = (i: number) => (
    <div key={i} className="overflow-hidden rounded-2xl border border-border bg-surface">
      <Skeleton className="aspect-[1.91/1] rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-1/4" />
        <Skeleton className="h-3 w-5/6" />
      </div>
    </div>
  );
  return (
    <div data-testid="discover-skeleton" aria-hidden>
      {view === "grid" ? (
        <div className="flex gap-3">
          {Array.from({ length: cols }, (_, c) => (
            <div key={c} className="flex flex-1 flex-col gap-3">
              {[0, 1].map((i) => card(c * 2 + i))}
            </div>
          ))}
        </div>
      ) : (
        <div className="mx-auto flex max-w-xl flex-col gap-4">{[0, 1, 2].map(card)}</div>
      )}
    </div>
  );
}
