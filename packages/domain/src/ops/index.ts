// Platform alerts (Sprint 7, S7.3; Technical Blueprint §15): deterministic
// evaluation of a monitoring snapshot against server-side thresholds
// (platform_limits). No I/O: the worker and the operator console call it with
// the snapshot read from sor_ops_snapshot.
//
// Alerts: stuck jobs (lease expired and not recovered), queue backlog (due
// job not picked up), dead letters, job failure rate, budget exhaustion rate,
// AI provider error rate (per provider), AI cost per day.
import type { OpsAlert, OpsSnapshot } from "@sor/contracts";

export const OPS_ALERTS_VERSION = "ops-alerts-1";

const pct = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
const usd = (n: number) => Math.round(n * 100) / 100;

/** Alert-key suffix from a provider name (keys accept [a-z0-9_.-] only). */
export function alertKeySuffix(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s.length > 0 ? s : "unknown";
}

/** The alerts that hold for this snapshot, most severe first, keys unique. */
export function evaluateOpsAlerts(snapshot: OpsSnapshot): OpsAlert[] {
  const t = snapshot.thresholds;
  const alerts: OpsAlert[] = [];

  if (snapshot.stuck.stale_leases > 0) {
    alerts.push({
      key: "stuck_jobs",
      severity: "critical",
      message: `${snapshot.stuck.stale_leases} job(s) en cours dont le bail a expiré depuis plus de ${t.stale_lease_grace_seconds} s sans reprise : vérifier que le worker tourne.`,
      details: {
        count: snapshot.stuck.stale_leases,
        job_ids: snapshot.stuck.jobs.filter((j) => j.reason === "lease_expired").map((j) => j.id),
      },
    });
  }
  if (snapshot.jobs_24h.dead_letter >= t.dead_letters_per_day && t.dead_letters_per_day > 0) {
    alerts.push({
      key: "dead_letters",
      severity: "critical",
      message: `${snapshot.jobs_24h.dead_letter} job(s) en échec définitif (dead letter) sur 24 h.`,
      details: {
        count: snapshot.jobs_24h.dead_letter,
        threshold: t.dead_letters_per_day,
        job_ids: snapshot.recent_failures.filter((f) => f.state === "dead_letter").map((f) => f.id),
      },
    });
  }
  if (snapshot.stuck.queue_wait > 0) {
    alerts.push({
      key: "queue_backlog",
      severity: "warning",
      message: `${snapshot.stuck.queue_wait} job(s) dus non pris en charge depuis plus de ${t.queue_wait_alert_seconds} s (attente max ${snapshot.queue.oldest_due_wait_seconds} s).`,
      details: {
        count: snapshot.stuck.queue_wait,
        oldest_due_wait_seconds: snapshot.queue.oldest_due_wait_seconds,
        job_ids: snapshot.stuck.jobs.filter((j) => j.reason === "queue_wait").map((j) => j.id),
      },
    });
  }

  const finished = snapshot.jobs_24h.finished;
  if (finished >= t.min_sample) {
    const failed = snapshot.jobs_24h.failed + snapshot.jobs_24h.dead_letter;
    const rate = pct(failed, finished);
    if (rate >= t.failure_rate_pct) {
      alerts.push({
        key: "job_failure_rate",
        severity: "warning",
        message: `${rate} % des jobs terminés sur 24 h ont échoué (${failed}/${finished}).`,
        details: { rate_pct: rate, failed, finished, threshold_pct: t.failure_rate_pct },
      });
    }
    const exhausted = snapshot.jobs_24h.budget_exhausted;
    const exhaustedRate = pct(exhausted, finished);
    if (exhaustedRate >= t.budget_exhaustion_rate_pct) {
      alerts.push({
        key: "budget_exhaustion_rate",
        severity: "warning",
        message: `${exhaustedRate} % des jobs terminés sur 24 h ont épuisé leur budget (${exhausted}/${finished}).`,
        details: {
          rate_pct: exhaustedRate,
          budget_exhausted: exhausted,
          finished,
          threshold_pct: t.budget_exhaustion_rate_pct,
        },
      });
    }
  }

  const providerAlerts = new Map<string, OpsAlert>();
  for (const p of snapshot.providers_1h) {
    if (p.calls < t.min_provider_calls) continue;
    const rate = pct(p.errors, p.calls);
    if (rate < t.provider_error_rate_pct) continue;
    const key = `provider_error_rate:${alertKeySuffix(p.provider)}`;
    const prev = providerAlerts.get(key);
    const calls = p.calls + ((prev?.details.calls as number | undefined) ?? 0);
    const errors = p.errors + ((prev?.details.errors as number | undefined) ?? 0);
    providerAlerts.set(key, {
      key,
      severity: "warning",
      message: `Fournisseur IA ${p.provider} : ${pct(errors, calls)} % d’erreurs sur 1 h (${errors}/${calls}).`,
      details: {
        provider: p.provider,
        rate_pct: pct(errors, calls),
        errors,
        calls,
        threshold_pct: t.provider_error_rate_pct,
      },
    });
  }
  alerts.push(...providerAlerts.values());

  if (t.ai_cost_usd_per_day > 0 && snapshot.cost.today_usd >= t.ai_cost_usd_per_day) {
    alerts.push({
      key: "ai_cost_per_day",
      severity: "warning",
      message: `Coût IA du jour : ${usd(snapshot.cost.today_usd)} USD (seuil ${t.ai_cost_usd_per_day} USD).`,
      details: {
        today_usd: usd(snapshot.cost.today_usd),
        threshold_usd: t.ai_cost_usd_per_day,
        by_provider: snapshot.cost.by_provider_today,
      },
    });
  }

  return alerts.sort((a, b) =>
    a.severity === b.severity ? a.key.localeCompare(b.key) : a.severity === "critical" ? -1 : 1,
  );
}
