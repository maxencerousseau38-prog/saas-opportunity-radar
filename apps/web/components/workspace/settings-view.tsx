"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ResearchPreferences, WorkspaceUsage } from "@sor/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import {
  CONFIGURABLE_EXCLUSIONS,
  CUSTOMER_TYPE,
  ROLE,
  formatDate,
  formatDateTime,
} from "@/lib/labels";
import { ImportsPanel } from "./imports-panel";

interface Props {
  workspaceId: string;
  workspaceName: string;
  userId: string;
  role: string;
  canAdmin: boolean;
  members: Array<{ user_id: string; email: string; role: string; joined_at: string }>;
  preferences: ResearchPreferences;
  invalidSettings: string[];
  sources: Array<{
    source_key: string;
    name: string;
    source_type: string;
    integration_status: string;
    is_enabled: boolean;
    default_reliability_level: number;
    last_sync_at: string | null;
    last_error_code: string | null;
    quota_per_day: number | null;
    storage_policy: string;
    terms_url: string | null;
    terms_reviewed_at: string | null;
    requests_today: number;
  }>;
  categories: Array<{ slug: string; name: string }>;
  usage: WorkspaceUsage;
}

const STORAGE_LABELS: Record<string, string> = {
  full: "Contenu complet",
  metadata_only: "Métadonnées seules",
  transient: "Aucune (transitoire)",
};

function UsageRow({
  label,
  used,
  limit,
  note,
}: {
  label: string;
  used: number;
  limit: number;
  note: string;
}) {
  const full = used >= limit;
  return (
    <tr className="border-t border-border">
      <td className="py-1.5">{label}</td>
      <td className="py-1.5">
        <Badge tone={full ? "warning" : "neutral"}>
          {used} / {limit}
        </Badge>
      </td>
      <td className="py-1.5 text-xs text-muted">{note}</td>
    </tr>
  );
}

function Block({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {note ? <p className="text-xs text-muted">{note}</p> : null}
      {children}
    </section>
  );
}

export function SettingsView(p: Props) {
  const router = useRouter();
  const base = `/workspaces/${p.workspaceId}`;
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invite, setInvite] = useState({ email: "", role: "member" });
  const [name, setName] = useState(p.workspaceName);
  const [prefs, setPrefs] = useState(p.preferences);
  const [newOwner, setNewOwner] = useState("");
  const owner = p.role === "owner";

  async function run(fn: () => Promise<unknown>, ok: string) {
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(ok);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }
  const toggle = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {notice ? (
        <p role="status" className="text-sm text-success">
          {notice}
        </p>
      ) : null}

      <Block title="Espace de travail">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => api(base, { method: "PATCH", body: { name } }), "Espace renommé.");
          }}
        >
          <Input
            aria-label="Nom de l’espace"
            value={name}
            disabled={!owner}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            className="max-w-sm"
          />
          {owner ? (
            <Button type="submit" disabled={!name.trim() || name === p.workspaceName}>
              Renommer
            </Button>
          ) : null}
        </form>
      </Block>

      <Block
        title="Membres"
        note="L’inscription publique est désactivée : un administrateur invite chaque membre par e-mail. Le rôle propriétaire ne s’attribue que par transfert."
      >
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1">E-mail</th>
              <th className="py-1">Rôle</th>
              <th className="py-1">Depuis</th>
              <th className="py-1">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {p.members.map((m) => {
              const self = m.user_id === p.userId;
              return (
                <tr key={m.user_id} className="border-t border-border" data-testid="member-row">
                  <td className="py-1.5">
                    {m.email}
                    {self ? " (vous)" : ""}
                  </td>
                  <td className="py-1.5">
                    {p.canAdmin && !self && m.role !== "owner" ? (
                      <Select
                        aria-label={`Rôle de ${m.email}`}
                        className="h-8 w-40"
                        value={m.role}
                        onChange={(e) =>
                          void run(
                            () =>
                              api(`${base}/members/${m.user_id}`, {
                                method: "PATCH",
                                body: { role: e.target.value },
                              }),
                            "Rôle mis à jour.",
                          )
                        }
                      >
                        {["admin", "member", "viewer"].map((r) => (
                          <option key={r} value={r}>
                            {ROLE[r]}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Badge>{ROLE[m.role]}</Badge>
                    )}
                  </td>
                  <td className="py-1.5">{formatDate(m.joined_at)}</td>
                  <td className="py-1.5 text-right">
                    {m.role !== "owner" && (self || p.canAdmin) ? (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          if (
                            window.confirm(
                              self ? "Quitter cet espace de travail ?" : `Retirer ${m.email} ?`,
                            )
                          )
                            void run(
                              async () => {
                                await api(`${base}/members/${m.user_id}`, { method: "DELETE" });
                                if (self) router.push("/");
                              },
                              self ? "Vous avez quitté l’espace." : "Membre retiré.",
                            );
                        }}
                      >
                        {self ? "Quitter" : "Retirer"}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {p.canAdmin ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const r = await api<{ data: { invitation_sent: boolean } }>(`${base}/members`, {
                  method: "POST",
                  body: invite,
                });
                setInvite({ email: "", role: "member" });
                setNotice(r.data.invitation_sent ? "Invitation envoyée." : "Membre ajouté.");
              }, "Membre ajouté.");
            }}
          >
            <Field label="Inviter par e-mail" htmlFor="invite-email">
              <Input
                id="invite-email"
                type="email"
                required
                value={invite.email}
                onChange={(e) => setInvite((i) => ({ ...i, email: e.target.value }))}
              />
            </Field>
            <Field label="Rôle" htmlFor="invite-role">
              <Select
                id="invite-role"
                value={invite.role}
                onChange={(e) => setInvite((i) => ({ ...i, role: e.target.value }))}
              >
                {["admin", "member", "viewer"].map((r) => (
                  <option key={r} value={r}>
                    {ROLE[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" variant="primary">
              Inviter
            </Button>
          </form>
        ) : null}
        {owner ? (
          <form
            className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (window.confirm("Transférer la propriété ? Vous deviendrez administrateur."))
                void run(
                  () =>
                    api(`${base}/ownership-transfer`, {
                      method: "POST",
                      body: { new_owner_user_id: newOwner },
                    }),
                  "Propriété transférée.",
                );
            }}
          >
            <Field label="Transférer la propriété à" htmlFor="new-owner">
              <Select id="new-owner" value={newOwner} onChange={(e) => setNewOwner(e.target.value)}>
                <option value="">—</option>
                {p.members
                  .filter((m) => m.user_id !== p.userId)
                  .map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.email}
                    </option>
                  ))}
              </Select>
            </Field>
            <Button type="submit" variant="danger" disabled={!newOwner}>
              Transférer
            </Button>
          </form>
        ) : null}
      </Block>

      <Block
        title="Préférences de recherche"
        note="Utilisées par le bouton « Mes préférences » de Discover. L’exclusion permanente des modèles d’affiliation et de partenariat ne fait pas partie des préférences et ne peut pas être désactivée."
      >
        {p.invalidSettings.length ? (
          <ErrorNote>
            Des préférences enregistrées étaient invalides ; les valeurs par défaut sont affichées.
          </ErrorNote>
        ) : null}
        <fieldset disabled={!p.canAdmin} className="space-y-3">
          <Field
            label="Pays prioritaires (codes ISO séparés par des virgules)"
            htmlFor="pref-countries"
          >
            <Input
              id="pref-countries"
              value={prefs.priority_countries.join(", ")}
              onChange={(e) =>
                setPrefs((x) => ({
                  ...x,
                  priority_countries: e.target.value
                    .toUpperCase()
                    .split(/[,\s]+/)
                    .filter((c) => /^[A-Z]{2}$/.test(c)),
                }))
              }
            />
          </Field>
          <Field label="Taille d’équipe maximale" htmlFor="pref-team">
            <Input
              id="pref-team"
              type="number"
              min={1}
              value={prefs.team_size_max ?? ""}
              onChange={(e) =>
                setPrefs((x) => ({
                  ...x,
                  team_size_max: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
            />
          </Field>
          <div className="flex flex-wrap gap-4 text-sm">
            {(["b2b", "b2c", "b2b_b2c"] as const).map((v) => (
              <label key={v} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={prefs.customer_types.includes(v)}
                  onChange={() =>
                    setPrefs((x) => ({ ...x, customer_types: toggle(x.customer_types, v) }))
                  }
                />
                {CUSTOMER_TYPE[v]}
              </label>
            ))}
          </div>
          <div className="space-y-1 text-sm">
            <p className="font-medium">Exclusions configurables par défaut</p>
            {Object.entries(CONFIGURABLE_EXCLUSIONS).map(([v, l]) => (
              <label key={v} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={prefs.configurable_exclusions.includes(v as never)}
                  onChange={() =>
                    setPrefs((x) => ({
                      ...x,
                      configurable_exclusions: toggle(x.configurable_exclusions, v as never),
                    }))
                  }
                />
                {l}
              </label>
            ))}
          </div>
          <Field
            label="Catégories prioritaires"
            htmlFor="pref-cats"
            hint="Ctrl/Cmd + clic pour une sélection multiple."
          >
            <select
              id="pref-cats"
              multiple
              className="h-32 w-full rounded-md border border-border bg-surface text-sm"
              value={prefs.priority_category_slugs}
              onChange={(e) =>
                setPrefs((x) => ({
                  ...x,
                  priority_category_slugs: [...e.target.selectedOptions].map((o) => o.value),
                }))
              }
            >
              {p.categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Marché d’adaptation" htmlFor="pref-market">
            <Input
              id="pref-market"
              maxLength={2}
              value={prefs.adaptation_market}
              onChange={(e) =>
                setPrefs((x) => ({ ...x, adaptation_market: e.target.value.toUpperCase() }))
              }
              className="w-20"
            />
          </Field>
          {p.canAdmin ? (
            <Button
              variant="primary"
              onClick={() =>
                void run(
                  () =>
                    api(`${base}/settings`, {
                      method: "PATCH",
                      body: { research_preferences: prefs },
                    }),
                  "Préférences enregistrées.",
                )
              }
            >
              Enregistrer
            </Button>
          ) : (
            <p className="text-xs text-muted">
              Seuls les administrateurs modifient les préférences.
            </p>
          )}
        </fieldset>
      </Block>

      <Block
        title="Imports"
        note="Ajout en masse de SaaS et d’avis clients déclarés (PRD §18). Le traitement est asynchrone."
      >
        <ImportsPanel workspaceId={p.workspaceId} canEdit={p.role !== "viewer"} />
      </Block>

      <Block
        title="Quotas"
        note="Limites de la plateforme appliquées à chaque demande de traitement (recherche IA, analyse, import, enrichissement, export). Une demande refusée n’est ni enregistrée ni décomptée ; renvoyer la même demande (même clé d’idempotence) ne consomme rien."
      >
        <table className="w-full text-left text-sm" aria-label="Quotas de traitements">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1">Limite</th>
              <th className="py-1">Utilisation</th>
              <th className="py-1">Remise à zéro</th>
            </tr>
          </thead>
          <tbody>
            <UsageRow
              label="Traitements en cours (workspace)"
              used={p.usage.active_jobs}
              limit={p.usage.max_concurrent_jobs}
              note="À la fin d’un traitement"
            />
            <UsageRow
              label="Traitements créés aujourd’hui (workspace)"
              used={p.usage.jobs_today}
              limit={p.usage.max_jobs_per_day}
              note={`Le ${formatDateTime(p.usage.day_resets_at)}`}
            />
            <UsageRow
              label="Mes demandes de traitement cette heure"
              used={p.usage.my_job_requests_this_hour}
              limit={p.usage.max_job_requests_per_hour}
              note={`Le ${formatDateTime(p.usage.hour_resets_at)}`}
            />
          </tbody>
        </table>
      </Block>

      <Block
        title="Sources"
        note="Une source n’est considérée comme intégrée qu’après le développement et la validation de son connecteur et la revue écrite de ses conditions (PRD §13, docs/DATA_SOURCES.md). Intégrées : site officiel (pages publiques, robots.txt respecté), saisie manuelle et imports CSV. Hacker News (API officielle) est enregistré mais désactivé : sa revue des conditions n’est pas terminée."
      >
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1">Source</th>
              <th className="py-1">Statut</th>
              <th className="py-1">Fiabilité</th>
              <th className="py-1">Conservation</th>
              <th className="py-1">Quota du jour</th>
              <th className="py-1">Conditions</th>
              <th className="py-1">Dernière synchro</th>
              <th className="py-1">Erreur</th>
            </tr>
          </thead>
          <tbody>
            {p.sources.map((s) => (
              <tr key={s.source_key} className="border-t border-border">
                <td className="py-1.5">{s.name}</td>
                <td className="py-1.5">
                  <Badge
                    tone={
                      s.integration_status === "integrated" && s.is_enabled ? "success" : "neutral"
                    }
                  >
                    {s.integration_status}
                    {s.is_enabled ? "" : " · désactivée"}
                  </Badge>
                </td>
                <td className="py-1.5">Niveau {s.default_reliability_level}</td>
                <td className="py-1.5">{STORAGE_LABELS[s.storage_policy] ?? s.storage_policy}</td>
                <td className="py-1.5">
                  {s.quota_per_day === null
                    ? `${s.requests_today} requête(s)`
                    : `${s.requests_today} / ${s.quota_per_day}`}
                </td>
                <td className="py-1.5">
                  {s.terms_reviewed_at
                    ? `Revue le ${formatDate(s.terms_reviewed_at)}`
                    : s.terms_url
                      ? "Revue à terminer"
                      : "—"}
                </td>
                <td className="py-1.5">{formatDate(s.last_sync_at) ?? "—"}</td>
                <td className="py-1.5">{s.last_error_code ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Block>
    </div>
  );
}
