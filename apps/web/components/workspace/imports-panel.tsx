"use client";
import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import type { JobStatus } from "@sor/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import { IMPORT_ROW_STATUS, JOB_STATE, TERMINAL_STATES, formatDate } from "@/lib/labels";

const PRODUCT_COLUMNS =
  "name,website_url,company_name,country_code,employee_min,employee_max,category_slugs,source_url";
const FEEDBACK_COLUMNS =
  "product_slug,source_url,source_name,published_at,rating,rating_scale_max,text,author_reference,author_company";

interface ImportResult {
  total?: number;
  counts?: Record<string, number>;
  rows?: Array<{ row: number; status: string; reasons?: string[] }>;
}

async function readFile(e: ChangeEvent<HTMLInputElement>): Promise<string> {
  const file = e.target.files?.[0];
  return file ? file.text() : "";
}

export function ImportsPanel({ workspaceId, canEdit }: { workspaceId: string; canEdit: boolean }) {
  const [jobs, setJobs] = useState<JobStatus[]>([]);
  const [productCsv, setProductCsv] = useState("");
  const [feedbackCsv, setFeedbackCsv] = useState("");
  const [storage, setStorage] = useState("excerpt");
  const [authorAllowed, setAuthorAllowed] = useState(false);
  const [basis, setBasis] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const base = `/workspaces/${workspaceId}/imports`;

  const load = useCallback(async () => {
    try {
      setJobs((await api<{ data: JobStatus[] }>(base)).data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!jobs.some((j) => !TERMINAL_STATES.has(j.state))) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [jobs, load]);

  async function submit(kind: "products" | "feedback") {
    setError(null);
    setNotice(null);
    try {
      const body =
        kind === "products"
          ? { csv: productCsv }
          : {
              csv: feedbackCsv,
              rights_declaration: {
                storage,
                author_reference_storage_permitted: authorAllowed,
                declared_basis: basis,
              },
            };
      await api(`${base}/${kind}`, {
        method: "POST",
        body,
        idempotencyKey: `import-${kind}-${crypto.randomUUID()}`,
      });
      setNotice("Import mis en file d’attente : les résultats par ligne s’affichent ci-dessous.");
      if (kind === "products") setProductCsv("");
      else setFeedbackCsv("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }

  return (
    <div className="space-y-4" data-testid="imports">
      {canEdit ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Importer des SaaS (CSV)</h3>
            <p className="text-xs text-muted">
              Colonnes : <code>{PRODUCT_COLUMNS}</code>. Catégories séparées par « | ». Données
              déclarées (fiabilité 4) ; le classifieur d’exclusion permanente s’applique à chaque
              ligne.
            </p>
            <input
              aria-label="Fichier CSV de SaaS"
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => setProductCsv(await readFile(e))}
              className="text-sm"
            />
            <Textarea
              aria-label="Contenu CSV des SaaS"
              value={productCsv}
              onChange={(e) => setProductCsv(e.target.value)}
              className="min-h-24 font-mono text-xs"
              placeholder={PRODUCT_COLUMNS}
            />
            <Button
              variant="primary"
              disabled={!productCsv.trim()}
              onClick={() => void submit("products")}
            >
              Importer les SaaS
            </Button>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Importer des avis clients (CSV)</h3>
            <p className="text-xs text-muted">
              Colonnes : <code>{FEEDBACK_COLUMNS}</code>. Déclarez vos droits : ils déterminent ce
              qui est conservé. Les identités d’auteur ne sont stockées que sous forme de hachage
              salé.
            </p>
            <input
              aria-label="Fichier CSV d’avis"
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => setFeedbackCsv(await readFile(e))}
              className="text-sm"
            />
            <Textarea
              aria-label="Contenu CSV des avis"
              value={feedbackCsv}
              onChange={(e) => setFeedbackCsv(e.target.value)}
              className="min-h-24 font-mono text-xs"
              placeholder={FEEDBACK_COLUMNS}
            />
            <Field label="Conservation du texte" htmlFor="rights-storage">
              <Select
                id="rights-storage"
                value={storage}
                onChange={(e) => setStorage(e.target.value)}
              >
                <option value="full">Texte complet</option>
                <option value="excerpt">Extrait (500 caractères)</option>
                <option value="reference_only">Référence uniquement (aucun texte)</option>
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-accent"
                checked={authorAllowed}
                onChange={(e) => setAuthorAllowed(e.target.checked)}
              />
              Je suis autorisé à conserver une référence (hachée) des auteurs
            </label>
            <Field
              label="Base juridique de l’utilisation"
              htmlFor="rights-basis"
              hint="Ex. : export de notre propre enquête clients."
            >
              <Textarea
                id="rights-basis"
                value={basis}
                onChange={(e) => setBasis(e.target.value)}
                maxLength={1000}
                className="min-h-12"
              />
            </Field>
            <Button
              variant="primary"
              disabled={!feedbackCsv.trim() || basis.trim().length < 10}
              onClick={() => void submit("feedback")}
            >
              Importer les avis
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">
          Les membres peuvent importer des fichiers CSV ; votre rôle permet la consultation.
        </p>
      )}
      {notice ? (
        <p role="status" className="text-sm text-success">
          {notice}
        </p>
      ) : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <div>
        <h3 className="text-sm font-semibold">Imports récents</h3>
        {jobs.length === 0 ? <p className="text-sm text-muted">Aucun import.</p> : null}
        <ul className="space-y-2">
          {jobs.map((job) => {
            const r = job.result as ImportResult;
            return (
              <li
                key={job.id}
                className="rounded border border-border p-2 text-sm"
                data-testid="import-job"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span>{job.kind === "catalog_import" ? "SaaS" : "Avis"}</span>
                  <Badge
                    tone={
                      job.state === "completed"
                        ? "success"
                        : TERMINAL_STATES.has(job.state)
                          ? "warning"
                          : "accent"
                    }
                  >
                    {JOB_STATE[job.state]}
                  </Badge>
                  <span className="text-xs text-muted">{formatDate(job.created_at)}</span>
                  {r.counts
                    ? Object.entries(r.counts).map(([k, v]) => (
                        <span key={k} className="text-xs">
                          {IMPORT_ROW_STATUS[k] ?? k} : {v}
                        </span>
                      ))
                    : null}
                </div>
                {r.rows?.some((row) => row.reasons?.length) ? (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-muted">
                      Lignes à corriger
                    </summary>
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {r.rows
                        .filter((row) => row.reasons?.length)
                        .map((row) => (
                          <li key={row.row}>
                            Ligne {row.row} — {IMPORT_ROW_STATUS[row.status] ?? row.status} :{" "}
                            {row.reasons?.join(" ; ")}
                          </li>
                        ))}
                    </ul>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
