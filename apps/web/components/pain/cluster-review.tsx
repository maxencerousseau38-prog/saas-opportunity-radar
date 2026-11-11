"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ErrorNote, Unknown } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import { RESOLUTION, formatDate } from "@/lib/labels";

export interface EvidenceRow {
  problem_id: string;
  removed: boolean;
  membership_source: string;
  problem_statement: string;
  severity: number | null;
  resolution_status: string;
  product_name: string | null;
  published_at: string | null;
  excerpt: string | null;
  content_storage_status: string;
  source_name: string | null;
  source_connector: string | null;
  evidence_url: string | null;
}

/**
 * Review and correction of a cluster (Implementation Blueprint §7.4): rename,
 * confirm, reject, remove or move problems. The server recomputes the statistics.
 */
export function ClusterReview({
  workspaceId,
  clusterId,
  name,
  description,
  evidence,
  otherClusters,
  canEdit,
}: {
  workspaceId: string;
  clusterId: string;
  name: string;
  description: string;
  evidence: EvidenceRow[];
  otherClusters: Array<{ id: string; name: string }>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState(otherClusters[0]?.id ?? "");
  const [newName, setNewName] = useState(name);
  const [newDescription, setNewDescription] = useState(description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await api(`/workspaces/${workspaceId}/clusters/${clusterId}`, { method: "PATCH", body });
      setSelected([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  const active = evidence.filter((e) => !e.removed);
  const removed = evidence.filter((e) => e.removed);
  return (
    <div className="space-y-4">
      {canEdit ? (
        <section
          className="space-y-2 rounded-lg border border-border p-4"
          aria-label="Correction du cluster"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom" htmlFor="cluster-name">
              <Input
                id="cluster-name"
                value={newName}
                maxLength={200}
                onChange={(e) => setNewName(e.target.value)}
              />
            </Field>
            <Field label="Description" htmlFor="cluster-description">
              <Textarea
                id="cluster-description"
                value={newDescription}
                maxLength={3000}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy || (newName.trim() === name && newDescription.trim() === description)}
              onClick={() => patch({ name: newName.trim(), description: newDescription.trim() })}
            >
              Enregistrer le nom et la description
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() => patch({ review_status: "user_confirmed" })}
            >
              Confirmer le cluster
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => patch({ review_status: "rejected" })}
            >
              Rejeter le cluster
            </Button>
          </div>
        </section>
      ) : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <section className="space-y-2" aria-labelledby="evidence-title">
        <h2 id="evidence-title" className="font-semibold">
          Preuves ({active.length})
        </h2>
        {canEdit && active.length > 0 ? (
          <div className="flex flex-wrap items-end gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={busy || selected.length === 0}
              onClick={() => patch({ remove_problem_ids: selected })}
            >
              Retirer la sélection ({selected.length})
            </Button>
            {otherClusters.length > 0 ? (
              <>
                <label className="sr-only" htmlFor="move-target">
                  Cluster de destination
                </label>
                <Select
                  id="move-target"
                  className="w-64"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  {otherClusters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  disabled={busy || selected.length === 0 || !target}
                  onClick={() =>
                    patch({
                      move_problem_ids_to_cluster: {
                        target_cluster_id: target,
                        problem_ids: selected,
                      },
                    })
                  }
                >
                  Déplacer vers ce cluster
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
        <ul className="divide-y divide-border rounded-lg border border-border">
          {active.map((e) => (
            <li key={e.problem_id} className="flex gap-3 p-3 text-sm">
              {canEdit ? (
                <input
                  type="checkbox"
                  aria-label={`Sélectionner : ${e.problem_statement}`}
                  checked={selected.includes(e.problem_id)}
                  onChange={(ev) =>
                    setSelected((cur) =>
                      ev.target.checked
                        ? [...cur, e.problem_id]
                        : cur.filter((x) => x !== e.problem_id),
                    )
                  }
                />
              ) : null}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium">{e.problem_statement}</p>
                {e.excerpt ? (
                  <blockquote className="border-l-2 border-border pl-2 text-muted">
                    {e.excerpt}
                  </blockquote>
                ) : (
                  <p className="text-xs text-muted">
                    Texte non conservé (droits de stockage) : seule la référence est gardée.
                  </p>
                )}
                <p className="flex flex-wrap gap-x-3 text-xs text-muted">
                  <span>{e.product_name ?? <Unknown label="SaaS non visible" />}</span>
                  <span>{formatDate(e.published_at) ?? "Date inconnue"}</span>
                  <span>Gravité : {e.severity ?? "inconnue"}</span>
                  <span>{RESOLUTION[e.resolution_status] ?? e.resolution_status}</span>
                  {e.evidence_url ? (
                    <a
                      className="text-accent underline"
                      href={e.evidence_url}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Source{e.source_name ? ` : ${e.source_name}` : ""}
                    </a>
                  ) : null}
                  {e.source_connector && e.source_connector !== e.source_name ? (
                    <span>via {e.source_connector}</span>
                  ) : null}
                </p>
              </div>
            </li>
          ))}
        </ul>
        {removed.length > 0 ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">
              Retirés du cluster ({removed.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {removed.map((e) => (
                <li key={e.problem_id}>
                  {e.problem_statement}{" "}
                  <Badge>
                    {e.membership_source === "verifier"
                      ? "écarté par le vérificateur"
                      : "retiré par un utilisateur"}
                  </Badge>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    </div>
  );
}
