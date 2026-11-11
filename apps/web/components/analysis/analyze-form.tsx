"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AnalysisSubject } from "@sor/contracts";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import { mergeProductChoices, type ProductChoice } from "@/lib/product-choices";
import { ProductSearch } from "@/components/workspace/product-search";

export interface ContextDefaults {
  targetCountry: string;
}

/** Context fields of PRD §7.2, prefilled with the workspace's usual criteria. */
function useContextForm(defaults: ContextDefaults) {
  const [country, setCountry] = useState(defaults.targetCountry);
  const [budget, setBudget] = useState("");
  const [technical, setTechnical] = useState("");
  const [productType, setProductType] = useState("");
  const [constraints, setConstraints] = useState("");
  const [depth, setDepth] = useState<"quick" | "standard" | "deep">("standard");
  const [plan, setPlan] = useState(true);
  const body = () => ({
    analysis_depth: depth,
    context: {
      target_country: country.toUpperCase(),
      budget_note: budget.trim() || null,
      technical_level_note: technical.trim() || null,
      product_type_note: productType.trim() || null,
      constraints: constraints
        .split("\n")
        .map((c) => c.trim())
        .filter(Boolean)
        .slice(0, 20),
    },
    options: { generate_validation_plan: plan },
  });
  const valid = /^[A-Za-z]{2}$/.test(country);
  const fields = (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Pays ciblé (code ISO)" htmlFor="an-country">
          <Input
            id="an-country"
            value={country}
            maxLength={2}
            onChange={(e) => setCountry(e.target.value)}
          />
        </Field>
        <Field label="Profondeur" htmlFor="an-depth">
          <Select
            id="an-depth"
            value={depth}
            onChange={(e) => setDepth(e.target.value as typeof depth)}
          >
            <option value="quick">Rapide</option>
            <option value="standard">Standard</option>
            <option value="deep">Approfondie</option>
          </Select>
        </Field>
        <Field label="Budget" htmlFor="an-budget">
          <Input
            id="an-budget"
            value={budget}
            maxLength={300}
            onChange={(e) => setBudget(e.target.value)}
          />
        </Field>
        <Field label="Niveau technique" htmlFor="an-tech">
          <Input
            id="an-tech"
            value={technical}
            maxLength={300}
            onChange={(e) => setTechnical(e.target.value)}
          />
        </Field>
        <Field label="Type de produit recherché" htmlFor="an-type">
          <Input
            id="an-type"
            value={productType}
            maxLength={300}
            onChange={(e) => setProductType(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Contraintes particulières (une par ligne)" htmlFor="an-constraints">
        <Textarea
          id="an-constraints"
          value={constraints}
          onChange={(e) => setConstraints(e.target.value)}
          className="min-h-16"
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={plan} onChange={(e) => setPlan(e.target.checked)} />
        Produire un plan de validation
      </label>
      <p className="text-xs text-muted">
        Le score, la confiance et le verdict sont calculés par le serveur à partir des preuves. Les
        exclusions permanentes (affiliation, partenariat) s’appliquent toujours.
      </p>
    </div>
  );
  return { body, valid, fields };
}

async function start(workspaceId: string, subject: AnalysisSubject, body: Record<string, unknown>) {
  const res = await api<{ data: { id: string } }>(`/workspaces/${workspaceId}/analyses`, {
    method: "POST",
    body: { analysis_type: "opportunity", subject, ...body },
    idempotencyKey: crypto.randomUUID(),
  });
  return res.data.id;
}

/** "Analyze Opportunity" (PRD §7.2) for a fixed subject: SaaS, cluster or hypothesis. */
export function AnalyzeButton({
  workspaceId,
  subject,
  defaults,
  label = "Analyze Opportunity",
}: {
  workspaceId: string;
  subject: AnalysisSubject;
  defaults: ContextDefaults;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useContextForm(defaults);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const id = await start(workspaceId, subject, form.body());
      router.push(`/w/${workspaceId}/opportunities/analyses/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Analyse d’opportunité"
        description="Contexte complémentaire (facultatif). L’analyse s’exécute en arrière-plan."
      >
        <form onSubmit={submit} className="space-y-3" aria-label="Lancer une analyse d’opportunité">
          {form.fields}
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          <Button type="submit" variant="primary" disabled={!form.valid || busy}>
            {busy ? "Lancement…" : "Lancer l’analyse"}
          </Button>
        </form>
      </Dialog>
    </>
  );
}

/** Analysis of a set of competing SaaS or of a category (PRD §7.2). */
export function NewAnalysisForm({
  workspaceId,
  products,
  categories,
  defaults,
}: {
  workspaceId: string;
  products: Array<{ id: string; name: string }>;
  categories: Array<{ slug: string; name: string }>;
  defaults: ContextDefaults;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"product_set" | "category">("product_set");
  const [selected, setSelected] = useState<string[]>([]);
  const [found, setFound] = useState<ProductChoice[]>([]);
  const choices = mergeProductChoices(found, products);
  const [category, setCategory] = useState(categories[0]?.slug ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useContextForm(defaults);
  const valid =
    form.valid &&
    (kind === "category" ? category !== "" : selected.length >= 2 && selected.length <= 10);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const subject: AnalysisSubject =
        kind === "category"
          ? { type: "category", category_slug: category }
          : { type: "product_set", product_ids: selected };
      const id = await start(workspaceId, subject, form.body());
      router.push(`/w/${workspaceId}/opportunities/analyses/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border border-border p-4"
      aria-label="Nouvelle analyse d’opportunité"
    >
      <Field label="Sujet" htmlFor="an-kind">
        <Select
          id="an-kind"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as typeof kind);
            setSelected([]);
          }}
        >
          <option value="product_set">Plusieurs SaaS concurrents (2 à 10)</option>
          <option value="category">Une catégorie de marché</option>
        </Select>
      </Field>
      {kind === "category" ? (
        <Field label="Catégorie" htmlFor="an-category">
          <Select id="an-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">SaaS ({selected.length} sélectionnés)</legend>
          <ProductSearch
            workspaceId={workspaceId}
            id="an-product-search"
            onResults={(rows) => setFound((cur) => mergeProductChoices(rows, cur))}
          />
          <div className="grid max-h-48 gap-1 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-2">
            {choices.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={(e) =>
                    setSelected((cur) =>
                      e.target.checked ? [...cur, p.id] : cur.filter((x) => x !== p.id),
                    )
                  }
                />
                {p.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {form.fields}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button type="submit" variant="primary" disabled={!valid || busy}>
        {busy ? "Lancement…" : "Lancer l’analyse"}
      </Button>
    </form>
  );
}
