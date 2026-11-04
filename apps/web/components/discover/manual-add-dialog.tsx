"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import type { ManualAddResult } from "@sor/contracts";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import type { CategoryOption } from "./types";

const OUTCOME: Record<string, string> = {
  eligible: "Le SaaS est ajouté au catalogue avec des données déclarées (non vérifiées).",
  needs_review:
    "Le SaaS a été enregistré mais doit être revu par l’opérateur (affiliation ou partenariat possible). Il restera masqué jusqu’à sa décision.",
  excluded:
    "Ce SaaS relève de l’exclusion permanente (affiliation, partenariat ou modèle apparenté). Il n’apparaîtra pas dans le catalogue.",
};

export function ManualAddDialog({
  workspaceId,
  categories,
}: {
  workspaceId: string;
  categories: CategoryOption[];
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    website_url: "",
    company_name: "",
    short_description: "",
    category: "",
    note: "",
  });
  const [result, setResult] = useState<ManualAddResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const children = categories.filter((c) => c.parent_id !== null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const res = await api<{ data: ManualAddResult }>(`/workspaces/${workspaceId}/products`, {
        method: "POST",
        body: {
          name: form.name,
          website_url: form.website_url,
          company_name: form.company_name || null,
          short_description: form.short_description || null,
          category_slugs: form.category ? [form.category] : [],
          note: form.note || null,
        },
      });
      setResult(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="primary"
        onClick={() => {
          setOpen(true);
          setResult(null);
        }}
      >
        <Plus size={14} /> Ajouter un SaaS
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Ajouter un SaaS manuellement"
        description="Les informations saisies sont enregistrées comme déclarées (niveau de fiabilité 4) jusqu’à leur vérification."
      >
        {result ? (
          <div role="status" className="space-y-2 text-sm">
            <p>
              {result.status === "existing"
                ? "Ce SaaS est déjà connu du catalogue."
                : "Ajout enregistré."}
            </p>
            <p>{OUTCOME[result.exclusion_status] ?? ""}</p>
            {result.enrichment_note === "queued" ? (
              <p data-testid="enrichment-queued">
                Enrichissement depuis le site officiel demandé : les informations vérifiées
                apparaîtront sur la fiche.
              </p>
            ) : result.enrichment_note === "limit_reached" ? (
              <p>
                Trop de traitements en cours dans l’espace : lancez l’enrichissement plus tard
                depuis la fiche.
              </p>
            ) : null}
            {result.visible && result.product_id ? (
              <p>
                <Link
                  className="text-accent underline"
                  href={`/w/${workspaceId}/discover`}
                  onClick={() => setOpen(false)}
                >
                  Retour à Discover
                </Link>
              </p>
            ) : null}
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <Field label="Nom du SaaS" htmlFor="ma-name">
              <Input
                id="ma-name"
                required
                maxLength={200}
                value={form.name}
                onChange={set("name")}
              />
            </Field>
            <Field label="Site officiel" htmlFor="ma-url">
              <Input
                id="ma-url"
                type="url"
                required
                placeholder="https://"
                value={form.website_url}
                onChange={set("website_url")}
              />
            </Field>
            <Field label="Entreprise (optionnel)" htmlFor="ma-company">
              <Input
                id="ma-company"
                maxLength={200}
                value={form.company_name}
                onChange={set("company_name")}
              />
            </Field>
            <Field label="Description en une phrase (optionnel)" htmlFor="ma-desc">
              <Input
                id="ma-desc"
                maxLength={300}
                value={form.short_description}
                onChange={set("short_description")}
              />
            </Field>
            <Field label="Catégorie principale (optionnel)" htmlFor="ma-cat">
              <Select id="ma-cat" value={form.category} onChange={set("category")}>
                <option value="">—</option>
                {children.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {categories.find((p) => p.id === c.parent_id)?.name} › {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Note (optionnel)" htmlFor="ma-note">
              <Textarea id="ma-note" maxLength={2000} value={form.note} onChange={set("note")} />
            </Field>
            {error ? <ErrorNote>{error}</ErrorNote> : null}
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Ajout…" : "Ajouter"}
            </Button>
          </form>
        )}
      </Dialog>
    </>
  );
}
