// Platform health in the operator console (Sprint 7, S7.3): alerts that hold
// now, alert history, queue state, stuck and failed jobs, provider errors and
// AI cost. Read-only; values come from sor_ops_snapshot (server-only).
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/labels";
import type { PlatformHealth as Health } from "@/lib/services/ops";

const REASON: Record<string, string> = {
  lease_expired: "Bail expiré, non repris",
  queue_wait: "En file, non pris en charge",
};

const usd = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD" }).format(n);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: ReactNode; tone?: "danger" }) {
  return (
    <div className="rounded border border-border p-2">
      <div className="text-xs text-muted">{label}</div>
      <div
        className={
          tone === "danger" ? "text-lg font-semibold text-danger" : "text-lg font-semibold"
        }
      >
        {value}
      </div>
    </div>
  );
}

export function PlatformHealth({ health }: { health: Health }) {
  const { snapshot: s, alerts, history } = health;
  return (
    <section
      aria-label="Santé de la plateforme"
      className="space-y-4 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Santé de la plateforme</h2>
        <span className="text-xs text-muted">Relevé du {formatDateTime(s.generated_at)}</span>
      </div>

      <Section title="Alertes en cours">
        {alerts.length === 0 ? (
          <p className="text-sm text-muted" data-testid="no-alert">
            Aucune alerte : files, jobs, fournisseurs et coûts sont dans les seuils.
          </p>
        ) : (
          <ul className="space-y-1">
            {alerts.map((a) => (
              <li key={a.key} data-testid="ops-alert" className="flex items-start gap-2 text-sm">
                <Badge tone={a.severity === "critical" ? "danger" : "warning"}>
                  {a.severity === "critical" ? "Critique" : "Attention"}
                </Badge>
                <span>
                  <span className="font-mono text-xs text-muted">{a.key}</span> — {a.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="En file" value={s.queue.queued + s.queue.retrying} />
        <Metric label="En cours" value={s.queue.running} />
        <Metric
          label="Jobs bloqués"
          value={s.stuck.stale_leases + s.stuck.queue_wait}
          {...(s.stuck.stale_leases + s.stuck.queue_wait > 0 ? { tone: "danger" as const } : {})}
        />
        <Metric label="Attente max (s)" value={s.queue.oldest_due_wait_seconds} />
        <Metric label="Terminés 24 h" value={s.jobs_24h.finished} />
        <Metric
          label="Échecs 24 h"
          value={s.jobs_24h.failed + s.jobs_24h.dead_letter}
          {...(s.jobs_24h.dead_letter > 0 ? { tone: "danger" as const } : {})}
        />
        <Metric label="Budget épuisé 24 h" value={s.jobs_24h.budget_exhausted} />
        <Metric label="Coût IA aujourd’hui" value={usd(s.cost.today_usd)} />
      </div>

      {s.stuck.jobs.length > 0 ? (
        <Section title="Jobs bloqués">
          <table className="w-full text-left text-sm" aria-label="Jobs bloqués">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1">Job</th>
                <th className="py-1">Type</th>
                <th className="py-1">Cause</th>
                <th className="py-1">Depuis</th>
                <th className="py-1">Tentative</th>
              </tr>
            </thead>
            <tbody>
              {s.stuck.jobs.map((j) => (
                <tr key={j.id} className="border-t border-border">
                  <td className="py-1.5 font-mono text-xs">{j.id.slice(0, 8)}</td>
                  <td className="py-1.5">{j.job_kind}</td>
                  <td className="py-1.5">{REASON[j.reason] ?? j.reason}</td>
                  <td className="py-1.5">{formatDateTime(j.since)}</td>
                  <td className="py-1.5">{j.attempt_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}

      <Section title="Échecs récents (24 h)">
        {s.recent_failures.length === 0 ? (
          <p className="text-sm text-muted">Aucun échec sur 24 h.</p>
        ) : (
          <table className="w-full text-left text-sm" aria-label="Échecs récents">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1">Job</th>
                <th className="py-1">Type</th>
                <th className="py-1">État</th>
                <th className="py-1">Code d’erreur</th>
                <th className="py-1">Fin</th>
              </tr>
            </thead>
            <tbody>
              {s.recent_failures.map((f) => (
                <tr key={f.id} className="border-t border-border">
                  <td className="py-1.5 font-mono text-xs">{f.id.slice(0, 8)}</td>
                  <td className="py-1.5">{f.job_kind}</td>
                  <td className="py-1.5">
                    {f.state === "dead_letter" ? "Échec définitif" : "Échec"}
                  </td>
                  <td className="py-1.5">{f.last_error_code ?? "—"}</td>
                  <td className="py-1.5">
                    {f.completed_at ? formatDateTime(f.completed_at) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="Fournisseurs IA (1 h)">
          {s.providers_1h.length === 0 ? (
            <p className="text-sm text-muted">Aucun appel sur la dernière heure.</p>
          ) : (
            <table className="w-full text-left text-sm" aria-label="Fournisseurs IA">
              <tbody>
                {s.providers_1h.map((p) => (
                  <tr key={p.provider} className="border-t border-border">
                    <td className="py-1.5">{p.provider}</td>
                    <td className="py-1.5">
                      {p.errors} erreur(s) / {p.calls} appel(s)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
        <Section title="Coût IA (7 jours, UTC)">
          <table className="w-full text-left text-sm" aria-label="Coût IA par jour">
            <tbody>
              {s.cost.last_7_days.length === 0 ? (
                <tr>
                  <td className="py-1.5 text-muted">Aucune dépense enregistrée.</td>
                </tr>
              ) : (
                s.cost.last_7_days.map((d) => (
                  <tr key={d.day} className="border-t border-border">
                    <td className="py-1.5">{d.day}</td>
                    <td className="py-1.5">{usd(d.usd)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <p className="text-xs text-muted">
            Seuil d’alerte : {usd(s.thresholds.ai_cost_usd_per_day)} par jour. Fournisseur simulé
            tant que PD-24 n’est pas tranchée : coût nul.
          </p>
        </Section>
      </div>

      <Section title="Historique des alertes">
        {history.open.length + history.resolved.length === 0 ? (
          <p className="text-sm text-muted">
            Aucune alerte enregistrée (le worker enregistre les alertes à chaque cycle de
            surveillance).
          </p>
        ) : (
          <table className="w-full text-left text-sm" aria-label="Historique des alertes">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1">Alerte</th>
                <th className="py-1">Ouverte</th>
                <th className="py-1">Résolue</th>
              </tr>
            </thead>
            <tbody>
              {[...history.open, ...history.resolved].map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="py-1.5">
                    <span className="font-mono text-xs">{a.alert_key}</span> — {a.message}
                  </td>
                  <td className="py-1.5">{formatDateTime(a.opened_at)}</td>
                  <td className="py-1.5">
                    {a.resolved_at ? (
                      formatDateTime(a.resolved_at)
                    ) : (
                      <Badge tone="danger">En cours</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </section>
  );
}
