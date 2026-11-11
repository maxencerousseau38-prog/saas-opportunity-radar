"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/states";
import { api } from "@/lib/client-api";

export interface DiscoveryFormDefaults {
  title: string;
  prompt: string;
  depth: "standard" | "deep";
  maxResults: number;
  search: boolean;
  rebound: boolean;
  seedUrls: string[];
  filters: Record<string, unknown>;
  rerunOf: string | null;
}

/** Starts a discovery run (POST W/discovery-runs, 202) — PRD §6.2, §6.4. */
export function NewDiscoveryForm({
  workspaceId,
  defaults,
  searchEnabled,
}: {
  workspaceId: string;
  defaults: DiscoveryFormDefaults;
  /** True when at least one search source is integrated and enabled. */
  searchEnabled: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(defaults.title);
  const [prompt, setPrompt] = useState(defaults.prompt);
  const [depth, setDepth] = useState(defaults.depth);
  const [max, setMax] = useState(defaults.maxResults);
  const [search, setSearch] = useState(defaults.search);
  const [rebound, setRebound] = useState(defaults.rebound);
  const [urls, setUrls] = useState(defaults.seedUrls.join("\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seedUrls = urls
    .split(/\s+/)
    .map((u) => u.trim())
    .filter(Boolean);
  const valid =
    title.trim().length > 0 &&
    prompt.trim().length >= 3 &&
    (search || rebound || seedUrls.length > 0) &&
    seedUrls.length <= 100;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ data: { id: string } }>(`/workspaces/${workspaceId}/discovery-runs`, {
        method: "POST",
        idempotencyKey: crypto.randomUUID(),
        body: {
          title: title.trim(),
          prompt: prompt.trim(),
          depth,
          max_results: max,
          filters: defaults.filters,
          channels: {
            search,
            official_site_rebound: { enabled: rebound, seed_product_ids: [] },
            seed_urls: seedUrls,
          },
          ...(defaults.rerunOf ? { rerun_of_run_id: defaults.rerunOf } : {}),
        },
      });
      router.push(`/w/${workspaceId}/ai-discovery/${res.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border border-border p-4"
      aria-label="Nouvelle recherche AI Discovery"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Intitulé de la recherche" htmlFor="disc-title">
          <Input
            id="disc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
          />
        </Field>
        <Field label="Profondeur" htmlFor="disc-depth">
          <Select
            id="disc-depth"
            value={depth}
            onChange={(e) => setDepth(e.target.value as "standard" | "deep")}
          >
            <option value="standard">Standard</option>
            <option value="deep">Approfondie</option>
          </Select>
        </Field>
        <Field label="Résultats au maximum" htmlFor="disc-max">
          <Input
            id="disc-max"
            type="number"
            min={1}
            max={100}
            value={max}
            onChange={(e) => setMax(Number(e.target.value))}
          />
        </Field>
      </div>
      <Field label="Demande en langage naturel" htmlFor="disc-prompt">
        <Textarea
          id="disc-prompt"
          rows={3}
          value={prompt}
          maxLength={2000}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Trouve-moi des SaaS B2B américains indépendants, avec moins de 20 employés, dans le marketing et l’analytics…"
          required
        />
      </Field>
      <fieldset className="space-y-1 text-sm">
        <legend className="font-medium">Sources</legend>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={search} onChange={(e) => setSearch(e.target.checked)} />
          Recherche (Hacker News, API officielle)
          {searchEnabled ? null : (
            <span className="text-muted">
              — non activée pour l’instant : elle sera signalée comme indisponible
            </span>
          )}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={rebound} onChange={(e) => setRebound(e.target.checked)} />
          Rebond depuis les sites officiels des SaaS du catalogue (pages intégrations, alternatives,
          comparatifs)
        </label>
      </fieldset>
      <Field label="URL de SaaS à examiner (une par ligne, 100 au plus)" htmlFor="disc-urls">
        <Textarea
          id="disc-urls"
          rows={3}
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          placeholder="https://exemple.com"
        />
      </Field>
      <p className="text-xs text-muted">
        Les exclusions permanentes (affiliation, partenariat) s’appliquent toujours et ne peuvent
        pas être levées. Un candidat n’est retenu que d’après son propre site officiel.
      </p>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button type="submit" variant="primary" disabled={!valid || busy}>
        Lancer la recherche
      </Button>
    </form>
  );
}
