"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Copy, ExternalLink, Plus, Search, Trash2 } from "lucide-react";
import type {
  CatalogPage,
  ExternalAiDestination,
  ExternalResearchSection,
  ExternalResearchStrategy,
  ProductCard,
} from "@sor/contracts";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState, ErrorNote } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import {
  EXTERNAL_AI_DESTINATIONS,
  RESEARCH_STRATEGIES,
  coverageLines,
  fitExternalResearchPrompt,
  selectExternalResearchContext,
} from "@/lib/ask-ai/prompt";
import type {
  ExternalResearchContext,
  ExternalResearchSessionDetails,
  ExternalResearchSessionSummary,
} from "@/lib/ask-ai/types";

const OPTIONAL_SECTIONS: Array<[ExternalResearchSection, string]> = [
  ["features", "Fonctionnalités et intégrations"],
  ["pricing", "Tarifs recensés"],
  ["feedback", "Avis clients disponibles"],
  ["competitors", "Concurrents recensés"],
];
const DESTINATIONS = Object.keys(EXTERNAL_AI_DESTINATIONS) as ExternalAiDestination[];
const STRATEGIES = Object.keys(RESEARCH_STRATEGIES) as ExternalResearchStrategy[];

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Inconnu / non renseigné";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "Aucune valeur recensée";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function subjectLabel(session: ExternalResearchSessionSummary) {
  const snapshot = session.subject_snapshot;
  return snapshot &&
    typeof snapshot === "object" &&
    !Array.isArray(snapshot) &&
    typeof snapshot.label === "string"
    ? snapshot.label
    : "Recherche SaaS";
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

export function AskAiWorkspace({
  workspaceId,
  userId,
  canEdit,
  canAdmin,
  initialContext,
  initialSession,
  initialSessions,
  categories,
}: {
  workspaceId: string;
  userId: string;
  canEdit: boolean;
  canAdmin: boolean;
  categories: Array<{ slug: string; name: string }>;
  initialContext: ExternalResearchContext | null;
  initialSession: ExternalResearchSessionDetails | null;
  initialSessions: ExternalResearchSessionSummary[];
}) {
  const router = useRouter();
  const [session, setSession] = useState(initialSession);
  const [sessions, setSessions] = useState(initialSessions);
  const [editingSelection, setEditingSelection] = useState(false);
  const [destination, setDestination] = useState<ExternalAiDestination>(
    initialSession?.destination ?? "claude",
  );
  const [strategy, setStrategy] = useState<ExternalResearchStrategy>(
    initialSession?.strategy ?? "better_alternative",
  );
  const [includedSections, setIncludedSections] = useState<ExternalResearchSection[]>(
    initialSession?.included_sections ??
      (Object.keys(initialContext?.sections ?? {}) as ExternalResearchSection[]),
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initialSession?.context_json.subject.product_ids ?? initialContext?.subject.product_ids ?? [],
  );
  const [searchText, setSearchText] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [results, setResults] = useState<ProductCard[]>([]);
  const [answer, setAnswer] = useState(initialSession?.answer_text ?? "");
  const [notes, setNotes] = useState(initialSession?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const currentContext = session?.context_json ?? initialContext;
  const promptContext = useMemo(
    () => (currentContext ? selectExternalResearchContext(currentContext, includedSections) : null),
    [currentContext, includedSections],
  );
  const prompt = useMemo(
    () =>
      promptContext
        ? (fitExternalResearchPrompt({
            destination,
            strategy,
            subjectLabel: promptContext.subject.label,
            context: promptContext,
          })?.prompt ?? "")
        : "",
    [destination, promptContext, strategy],
  );

  function startNew() {
    setSession(null);
    setEditingSelection(false);
    setAnswer("");
    setNotes("");
    setNotice(null);
    setError(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("session");
    router.push(url.pathname + (url.search ? url.search : ""));
  }

  function loadSelectedProducts(ids: string[]) {
    const params = new URLSearchParams();
    if (ids.length) params.set("products", ids.join(","));
    const query = params.toString();
    router.push(`/w/${workspaceId}/ask-ai${query ? `?${query}` : ""}`);
  }

  async function searchProducts() {
    setBusy(true);
    setError(null);
    try {
      const page = await api<CatalogPage>(`/workspaces/${workspaceId}/products/search`, {
        method: "POST",
        body: { filters: { text: searchText.trim() || undefined }, sort: "relevance", limit: 10 },
      });
      setResults(page.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "La recherche du catalogue a échoué.");
    } finally {
      setBusy(false);
    }
  }

  async function createPrompt() {
    if (!currentContext) return;
    const subject = currentContext.subject;
    const subjectBody: Record<string, unknown> =
      subject.type === "category" && subject.category_slug
        ? { category_slug: subject.category_slug }
        : subject.type === "pain_point_cluster" && subject.cluster_id
          ? { cluster_id: subject.cluster_id }
          : { product_ids: selectedIds };
    if (Array.isArray(subjectBody.product_ids) && subjectBody.product_ids.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api<{ data: ExternalResearchSessionDetails }>(
        `/workspaces/${workspaceId}/ai-research`,
        {
          method: "POST",
          body: {
            ...subjectBody,
            destination,
            strategy,
            included_sections: includedSections,
          },
        },
      );
      setSession(response.data);
      setAnswer("");
      setNotes("");
      setSessions((current) => [
        response.data,
        ...current.filter((row) => row.id !== response.data.id),
      ]);
      setNotice("Le dossier et le prompt ont été enregistrés dans cet espace de travail.");
      router.replace(`/w/${workspaceId}/ask-ai?session=${response.data.id}`, { scroll: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Le dossier n’a pas pu être enregistré.");
    } finally {
      setBusy(false);
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(session?.prompt_text ?? prompt);
      setNotice("Prompt copié. Collez-le dans l’assistant externe après l’avoir ouvert.");
      setError(null);
    } catch {
      setError("Le presse-papiers n’est pas accessible dans ce navigateur.");
    }
  }

  async function importAnswer() {
    if (!session) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api<{ data: ExternalResearchSessionDetails }>(
        `/workspaces/${workspaceId}/ai-research/${session.id}`,
        { method: "PATCH", body: { answer_text: answer, notes: notes || null } },
      );
      setSession(response.data);
      setSessions((current) =>
        current.map((row) => (row.id === response.data.id ? response.data : row)),
      );
      setNotice("Réponse enregistrée comme note externe non vérifiée.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "La réponse n’a pas pu être enregistrée.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSession(target: ExternalResearchSessionSummary) {
    if (!window.confirm(`Supprimer la recherche « ${subjectLabel(target)} » ?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/workspaces/${workspaceId}/ai-research/${target.id}`, { method: "DELETE" });
      setSessions((current) => current.filter((row) => row.id !== target.id));
      if (session?.id === target.id) startNew();
      setNotice("Recherche supprimée.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "La recherche n’a pas pu être supprimée.");
    } finally {
      setBusy(false);
    }
  }

  const currentSubject = currentContext?.subject;
  const previewPrompt = session?.prompt_text ?? prompt;
  const canSavePrompt =
    canEdit &&
    currentContext !== null &&
    (currentContext.subject.type === "category" ||
      currentContext.subject.type === "pain_point_cluster" ||
      selectedIds.length > 0);

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Ask AI</h1>
          <p className="max-w-3xl text-sm text-muted">
            Préparez un dossier d’analyse à partir du catalogue, copiez le prompt vers un assistant
            externe, puis importez sa réponse. Aucun modèle n’est exécuté dans l’application.
          </p>
        </div>
        {session ? <Button onClick={startNew}>Nouvelle recherche</Button> : null}
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-5">
          {!currentContext || editingSelection ? (
            <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
              <h2 className="font-semibold">Choisir les SaaS à étudier</h2>
              <p className="text-sm text-muted">
                Sélectionnez jusqu’à cinq produits. Le contexte disponible sera chargé depuis le
                catalogue visible dans cet espace de travail.
              </p>
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void searchProducts();
                }}
              >
                <Input
                  aria-label="Rechercher un SaaS pour Ask AI"
                  placeholder="Nom ou mot-clé du catalogue"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                />
                <Button type="submit" disabled={busy}>
                  <Search size={16} /> Rechercher
                </Button>
              </form>
              {results.length ? (
                <ul className="divide-y divide-border rounded border border-border">
                  {results.map((product) => (
                    <li
                      key={product.id}
                      className="flex flex-wrap items-center justify-between gap-2 p-3"
                    >
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-xs text-muted">
                          {product.tagline ?? product.short_description ?? "Description inconnue"}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        disabled={selectedIds.includes(product.id) || selectedIds.length >= 5}
                        onClick={() => setSelectedIds((current) => [...current, product.id])}
                      >
                        <Plus size={14} /> Ajouter
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <form
                className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (categorySlug)
                    router.push(`/w/${workspaceId}/ask-ai?category=${categorySlug}`);
                }}
              >
                <Field
                  label="Ou étudier une catégorie"
                  htmlFor="ask-ai-category"
                  hint="Échantillon borné des SaaS les plus récemment ajoutés, avec le total de la catégorie."
                >
                  <Select
                    id="ask-ai-category"
                    value={categorySlug}
                    onChange={(event) => setCategorySlug(event.target.value)}
                  >
                    <option value="">Choisir une catégorie…</option>
                    {categories.map((category) => (
                      <option key={category.slug} value={category.slug}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button type="submit" disabled={!categorySlug}>
                  Charger la catégorie
                </Button>
              </form>
              <p className="text-xs text-muted">
                Pour un Pain Point Cluster, ouvrez-le depuis{" "}
                <Link className="underline" href={`/w/${workspaceId}/opportunities`}>
                  Opportunités
                </Link>{" "}
                puis choisissez « Ask AI ».
              </p>
              {selectedIds.length ? (
                <div className="space-y-2">
                  <p className="text-sm">Sélection : {selectedIds.length} / 5</p>
                  <ul className="flex flex-wrap gap-1">
                    {selectedIds.map((id) => {
                      const selectedProduct = currentContext?.subject.products.find(
                        (product) => product.id === id,
                      );
                      const resultProduct = results.find((product) => product.id === id);
                      return (
                        <li
                          key={id}
                          className="rounded-full border border-border px-2 py-1 text-xs"
                        >
                          {selectedProduct?.name ?? resultProduct?.name ?? id.slice(0, 8)}
                          <button
                            type="button"
                            aria-label={`Retirer ${selectedProduct?.name ?? resultProduct?.name ?? "ce SaaS"}`}
                            className="ml-2 text-muted underline"
                            onClick={() =>
                              setSelectedIds((current) => current.filter((item) => item !== id))
                            }
                          >
                            Retirer
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <Button variant="primary" onClick={() => loadSelectedProducts(selectedIds)}>
                    Charger le contexte catalogue
                  </Button>
                </div>
              ) : null}
            </section>
          ) : currentContext ? (
            <>
              <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">Sujet et contexte</h2>
                    <p className="text-sm text-muted">
                      {currentSubject?.label} · {currentSubject?.product_ids.length} SaaS
                    </p>
                  </div>
                  {!session && currentSubject?.type !== "pain_point_cluster" ? (
                    <Button size="sm" onClick={() => setEditingSelection(true)}>
                      Modifier la sélection
                    </Button>
                  ) : null}
                </div>
                {promptContext ? (
                  <div
                    className="rounded border border-border bg-surface-2 p-3 text-sm"
                    data-testid="ask-ai-coverage"
                  >
                    <p className="font-medium">Couverture du dossier</p>
                    <ul className="mt-1 list-disc pl-5 text-xs">
                      {coverageLines(promptContext).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {currentContext.cluster ? (
                  <div
                    className="rounded border border-warning/40 p-3 text-sm"
                    data-testid="ask-ai-cluster"
                  >
                    <p className="font-medium">{currentContext.cluster.name}</p>
                    <p className="text-xs text-muted">{currentContext.cluster.description}</p>
                    <p className="mt-1 text-xs">{currentContext.cluster.provenance_warning}</p>
                  </div>
                ) : null}
                <ul className="grid gap-2 sm:grid-cols-2">
                  {currentContext.overview.map((product) => (
                    <li key={product.id} className="rounded border border-border bg-surface-2 p-3">
                      <p className="font-medium">{display(product.name.value)}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-muted">
                        {display(
                          product.tagline.value !== null
                            ? product.tagline.value
                            : product.short_description.value,
                        )}
                      </p>
                      <dl className="mt-2 grid grid-cols-2 gap-1 text-xs">
                        <div>
                          <dt className="text-muted">Clientèle</dt>
                          <dd>{display(product.customer_type.value)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">Tarification</dt>
                          <dd>{display(product.pricing_status.value)}</dd>
                        </div>
                      </dl>
                      {safeExternalUrl(product.official_website.value) ? (
                        <a
                          className="mt-2 inline-flex items-center gap-1 text-xs text-accent underline"
                          href={safeExternalUrl(product.official_website.value) ?? undefined}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                        >
                          Site officiel <ExternalLink size={12} />
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Sections optionnelles à partager</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {OPTIONAL_SECTIONS.map(([key, label]) => (
                      <label
                        key={key}
                        className="flex items-start gap-2 rounded border border-border p-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={includedSections.includes(key)}
                          disabled={Boolean(session)}
                          onChange={(event) =>
                            setIncludedSections((current) =>
                              event.target.checked
                                ? [...current, key]
                                : current.filter((item) => item !== key),
                            )
                          }
                          className="mt-0.5 accent-accent"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted">
                    L’aperçu général et l’index des sources correspondant aux éléments retenus
                    restent inclus pour conserver la traçabilité.
                  </p>
                </fieldset>
                {promptContext ? (
                  <details className="rounded border border-border p-3">
                    <summary className="cursor-pointer text-sm font-medium">
                      Prévisualiser les données et les sources transmises
                    </summary>
                    <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">
                      {JSON.stringify(promptContext, null, 2)}
                    </pre>
                    <ul className="mt-3 space-y-1 text-xs">
                      {promptContext.evidence_index.map((source) => (
                        <li key={source.evidence_id}>
                          <code>{source.evidence_id}</code> · {source.fact_status} /{" "}
                          {source.verification_status} ·{" "}
                          {safeExternalUrl(source.source.url) ? (
                            <a
                              href={safeExternalUrl(source.source.url) ?? undefined}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="underline"
                            >
                              {source.source.name ?? safeExternalUrl(source.source.url)}
                            </a>
                          ) : (
                            "URL source non disponible"
                          )}
                          {source.published_at
                            ? ` · ${source.published_at}`
                            : " · date de publication inconnue"}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {promptContext?.information_gaps.length ? (
                  <details>
                    <summary className="cursor-pointer text-xs text-muted">
                      Informations manquantes
                    </summary>
                    <ul className="mt-2 list-disc pl-5 text-xs text-muted">
                      {promptContext.information_gaps.map((gap) => (
                        <li key={gap}>{gap}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </section>

              <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
                <h2 className="font-semibold">Construire le prompt</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Assistant externe"
                    htmlFor="ask-ai-destination"
                    hint="Le modèle est choisi dans l’assistant externe."
                  >
                    <Select
                      id="ask-ai-destination"
                      value={destination}
                      disabled={Boolean(session)}
                      onChange={(event) =>
                        setDestination(event.target.value as ExternalAiDestination)
                      }
                    >
                      {DESTINATIONS.map((key) => (
                        <option key={key} value={key}>
                          {EXTERNAL_AI_DESTINATIONS[key].label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="Stratégie de recherche"
                    htmlFor="ask-ai-strategy"
                    hint={RESEARCH_STRATEGIES[strategy].objective}
                  >
                    <Select
                      id="ask-ai-strategy"
                      value={strategy}
                      disabled={Boolean(session)}
                      onChange={(event) =>
                        setStrategy(event.target.value as ExternalResearchStrategy)
                      }
                    >
                      {STRATEGIES.map((key) => (
                        <option key={key} value={key}>
                          {RESEARCH_STRATEGIES[key].label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                {!session ? (
                  <Button
                    variant="primary"
                    disabled={!canSavePrompt || busy}
                    onClick={() => void createPrompt()}
                  >
                    Générer et enregistrer le prompt
                  </Button>
                ) : null}
                {session ? (
                  <div className="space-y-3">
                    <p className="text-sm">
                      Dossier enregistré · {EXTERNAL_AI_DESTINATIONS[session.destination].label} ·{" "}
                      {RESEARCH_STRATEGIES[session.strategy].label}
                    </p>
                    <Textarea
                      aria-label="Prompt de recherche"
                      readOnly
                      value={previewPrompt}
                      className="min-h-72 font-mono text-xs"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => void copyPrompt()}>
                        <Copy size={15} /> Copier le prompt
                      </Button>
                      <a
                        href={EXTERNAL_AI_DESTINATIONS[session.destination].url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-surface-2"
                      >
                        Ouvrir {EXTERNAL_AI_DESTINATIONS[session.destination].label}{" "}
                        <ArrowUpRight size={15} />
                      </a>
                    </div>
                    <p className="text-xs text-muted">
                      Collez le prompt dans l’assistant ouvert et envoyez-le vous-même. Le transfert
                      n’est pas automatique et la réponse ne sera pas considérée comme une preuve.
                    </p>
                  </div>
                ) : null}
              </section>

              {session ? (
                <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
                  <div>
                    <h2 className="font-semibold">Importer la réponse externe</h2>
                    <p className="text-sm text-muted">
                      Cette réponse est enregistrée comme note externe non vérifiée et ne met pas à
                      jour le catalogue ni les moteurs internes.
                    </p>
                  </div>
                  <Field
                    label="Réponse de l’assistant"
                    htmlFor="ask-ai-answer"
                    hint="Maximum 50 000 caractères."
                  >
                    <Textarea
                      id="ask-ai-answer"
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      maxLength={50_000}
                      disabled={!canEdit || busy}
                      className="min-h-48"
                    />
                  </Field>
                  <Field label="Notes personnelles (facultatif)" htmlFor="ask-ai-notes">
                    <Textarea
                      id="ask-ai-notes"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      maxLength={5_000}
                      disabled={!canEdit || busy}
                    />
                  </Field>
                  <Button
                    variant="primary"
                    disabled={!canEdit || busy || !answer.trim()}
                    onClick={() => void importAnswer()}
                  >
                    Importer et enregistrer la réponse
                  </Button>
                  {session.status === "response_imported" ? (
                    <p role="status" className="text-sm text-warning">
                      Réponse importée · non vérifiée
                    </p>
                  ) : null}
                </section>
              ) : null}
            </>
          ) : null}

          {!currentContext && sessions.length === 0 ? (
            <EmptyState title="Aucune recherche sauvegardée">
              Ouvrez Ask AI depuis une fiche produit ou une comparaison, ou recherchez un SaaS ici.
            </EmptyState>
          ) : null}
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          {notice ? (
            <p role="status" className="text-sm text-accent">
              {notice}
            </p>
          ) : null}
        </div>

        <aside className="h-fit space-y-3 rounded-lg border border-border bg-surface p-4">
          <h2 className="font-semibold">Historique de recherche</h2>
          {sessions.length ? (
            <ul className="space-y-2">
              {sessions.map((item) => (
                <li key={item.id} className="rounded border border-border p-3">
                  <Link
                    href={`/w/${workspaceId}/ask-ai?session=${item.id}`}
                    className="block hover:underline"
                  >
                    <span className="block font-medium">{subjectLabel(item)}</span>
                    <span className="block text-xs text-muted">
                      {EXTERNAL_AI_DESTINATIONS[item.destination].label} ·{" "}
                      {RESEARCH_STRATEGIES[item.strategy].label}
                    </span>
                    <span className="block text-xs text-muted">
                      {formatTimestamp(item.created_at)}
                    </span>
                    <span className="block text-xs">
                      {item.status === "response_imported"
                        ? "Réponse importée · non vérifiée"
                        : "Prompt préparé"}
                    </span>
                  </Link>
                  {(canAdmin || item.created_by === userId) && canEdit ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void deleteSession(item)}
                      className="mt-2"
                    >
                      <Trash2 size={14} /> Supprimer
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              Les dossiers créés dans cet espace apparaîtront ici.
            </p>
          )}
          {!canEdit ? (
            <p className="text-xs text-muted">Votre rôle permet la consultation seule.</p>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
