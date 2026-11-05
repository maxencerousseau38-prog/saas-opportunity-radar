"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/states";
import { api } from "@/lib/client-api";

type Scope = "product" | "product_set" | "category";

/** Starts a pain point run (POST W/pain-point-runs, 202) over visible products or a category. */
export function NewRunForm({
  workspaceId,
  products,
  categories,
}: {
  workspaceId: string;
  products: Array<{ id: string; name: string }>;
  categories: Array<{ slug: string; name: string }>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState<Scope>("product_set");
  const [selected, setSelected] = useState<string[]>([]);
  const [category, setCategory] = useState(categories[0]?.slug ?? "");
  const [max, setMax] = useState(500);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    title.trim().length > 0 &&
    (scope === "category"
      ? category !== ""
      : scope === "product"
        ? selected.length === 1
        : selected.length >= 2 && selected.length <= 20);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        title: title.trim(),
        max_feedback_items: max,
        scope:
          scope === "category"
            ? { type: "category", category_slug: category }
            : scope === "product"
              ? { type: "product", product_id: selected[0] }
              : { type: "product_set", product_ids: selected },
      };
      const res = await api<{ data: { id: string } }>(
        `/workspaces/${workspaceId}/pain-point-runs`,
        {
          method: "POST",
          body,
          idempotencyKey: crypto.randomUUID(),
        },
      );
      router.push(`/w/${workspaceId}/opportunities/runs/${res.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border border-border p-4"
      aria-label="Nouvelle analyse de problèmes"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Titre" htmlFor="run-title">
          <Input
            id="run-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
          />
        </Field>
        <Field label="Périmètre" htmlFor="run-scope">
          <Select
            id="run-scope"
            value={scope}
            onChange={(e) => {
              setScope(e.target.value as Scope);
              setSelected([]);
            }}
          >
            <option value="product">Un SaaS</option>
            <option value="product_set">Plusieurs SaaS concurrents (2 à 20)</option>
            <option value="category">Une catégorie</option>
          </Select>
        </Field>
        <Field label="Avis analysés au maximum" htmlFor="run-max">
          <Input
            id="run-max"
            type="number"
            min={10}
            max={2000}
            value={max}
            onChange={(e) => setMax(Number(e.target.value))}
          />
        </Field>
      </div>
      {scope === "category" ? (
        <Field label="Catégorie" htmlFor="run-category">
          <Select id="run-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">
            {scope === "product" ? "SaaS (un seul)" : `SaaS (${selected.length} sélectionnés)`}
          </legend>
          {products.length === 0 ? (
            <p className="text-sm text-muted">Aucun SaaS visible dans le catalogue.</p>
          ) : (
            <div className="grid max-h-48 gap-1 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-2">
              {products.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input
                    type={scope === "product" ? "radio" : "checkbox"}
                    name="run-products"
                    checked={selected.includes(p.id)}
                    onChange={(e) =>
                      setSelected((cur) =>
                        scope === "product"
                          ? [p.id]
                          : e.target.checked
                            ? [...cur, p.id]
                            : cur.filter((x) => x !== p.id),
                      )
                    }
                  />
                  {p.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      )}
      <p className="text-xs text-muted">
        L’analyse porte sur les avis déjà importés (Settings → Imports). Les avis sans texte
        conservé ne sont pas analysés. Les résultats sont des hypothèses, jamais une preuve de
        disposition à payer.
      </p>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button type="submit" variant="primary" disabled={!valid || busy}>
        {busy ? "Lancement…" : "Lancer l’analyse"}
      </Button>
    </form>
  );
}
