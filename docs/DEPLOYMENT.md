# Deployment — worker on Render (PD-27)

**Status (6 November 2026):** prepared, **not deployed**. No Render service,
no Supabase project and no paid resource exists or was created. Every step
marked **[product owner]** creates or changes a paid resource and needs the
product owner's explicit approval.

Decision: PD-27 (approved 6 Nov 2026) — Render Background Worker, region
Frankfurt, plan `0.5c-512mb` (0.5 CPU / 512 MB, formerly "Starter").
Analysis: `docs/ADR/PD-27-worker-host-analysis.md`.

## 1. Artefacts in the repository

| File | Role |
|---|---|
| `apps/worker/Dockerfile` | Two-stage image: builds the self-contained bundle (`pnpm --filter @sor/worker build:container`), runtime = `node:26.13.0-slim` + `main.js` only, non-root user, `NODE_OPTIONS=--max-old-space-size=320` |
| `.dockerignore` | Keeps `node_modules`, builds, `.env*`, `.git`, docs and evals out of the build context |
| `render.yaml` | Render Blueprint for **`sor-worker-staging`** (Frankfurt, `0.5c-512mb`, Docker, `autoDeployTrigger: off`, `maxShutdownDelaySeconds: 60`, secrets `sync: false`) |
| `apps/worker/tsup.container.config.ts` | Bundle with every dependency inlined (the image needs no `node_modules`) |

CI builds the image on every push and runs the E2E suite against the worker
**container** limited to 512 MB, then checks the peak memory and a clean
SIGTERM shutdown (exit code 0).

## 2. Process behaviour on the host

- **SIGTERM** (deploy, restart, scale-down): the worker stops reading the
  queue, gives running jobs `WORKER_SHUTDOWN_GRACE_SECONDS` (40 s) to
  finish, then aborts and **releases** the rest (`sor_worker_release`:
  attempt returned, message visible at once; completed agent steps are
  reused). Render waits `maxShutdownDelaySeconds` (60 s) before SIGKILL.
  A second signal stops immediately.
- **Watchdog** (no health checks for Render workers): a separate thread
  kills the process if the event loop is blocked for
  `WORKER_WATCHDOG_BLOCKED_SECONDS` (60 s); the main thread exits with code 1
  if neither the polling loop nor a job heartbeat progressed for
  `WORKER_WATCHDOG_STALL_SECONDS` (300 s). Render restarts the process; the
  job system recovers the job (lease expiry, crash recovery tested in CI).
- **Fatal errors** (`uncaughtException`, `unhandledRejection`) are logged
  and exit with code 1.
- **Frozen worker** (S7.5a): a worker that stalls past its lease (frozen
  process, long pause) and wakes up after another worker took the job over
  cannot start a step of the job, nor complete or fail a step, unless the
  job still runs its own attempt; the write is refused as a lost lease, so
  the newer attempt's results are never overwritten.
- **Unknown job kind** (S7.4a): a worker without a handler for a message's
  job kind (e.g. an older version during a rolling deploy) logs
  `no handler for job kind: left for another worker` and leaves the message
  untouched; it is redelivered when its read lease expires. A job is never
  failed because one worker lacks its handler; if no worker takes it, the
  `queue_backlog` alert opens.
- **Logs**: one JSON line per event on stdout, including a `worker stats`
  line every 5 minutes (RSS, heap, running jobs) and at shutdown. Secrets
  are never logged (environment validation reports names only).

## 3. Memory (measured 6 Nov 2026)

| Situation | Measure |
|---|---|
| Idle worker (real bundle, empty queue, mock API) | RSS ≈ 110 MB (peak 117 MB), JS heap ≈ 22 MB |
| Heaviest job measured: deep discovery, 80 official pages of ~100 KB, in-process with the fake provider | +≈ 72 MB RSS, JS heap ≈ 61 MB |
| Estimate with `WORKER_CONCURRENCY=2` heavy jobs | ≈ 260 MB, below the 512 MB plan |
| E2E suite on the real stack (23 journeys, 12 jobs of every kind), container limited to 512 MB — CI run 59, 6 Nov 2026 | cgroup `memory.peak` 72.5 MiB (14 % of 512 MiB); process RSS 105 MB at start, 124 MB at shutdown; JS heap 24 MB; SIGTERM exit 0 |

Real AI providers (PD-24a) change little in memory (responses are small);
re-measure from the `worker stats` logs on staging.

## 4. Steps to deploy staging (not done — each needs approval)

1. **[product owner]** Create the Supabase **staging** project in
   **Frankfurt (`eu-central-1`)** (PD-02 A, PD-27). Disable public signup
   (Authentication settings), as locally.
2. Apply the migrations to staging (`supabase db push` against the staging
   project) and run the PGMQ verification gate.
3. **[product owner]** In Render, create the service from `render.yaml`
   (New → Blueprint, this repository). This creates a paid service.
4. **[product owner]** Enter the secrets in the Render dashboard (never in
   the repository or a chat): `SUPABASE_URL` (staging API URL),
   `SUPABASE_SECRET_KEY` (staging secret key, `sb_secret_…`),
   `AUTHOR_HASH_SECRET` (32+ random characters, different per environment).
5. **[product owner]** Trigger the first manual deploy; check the logs for
   `worker configured` and `worker started`, then run one job from the
   staging web app.
6. Production: same steps with a `sor-worker-production` service, after
   staging is validated.

## 5. Platform limits (S7.2)

Job requests are limited in the database (`platform_limits`, server-only;
change a value with an audited SQL update on the target project, never from
the browser):

| Key | Default | Refusal |
|---|---|---|
| `max_concurrent_jobs_per_workspace` | 3 | 429 `LIMIT_EXCEEDED` (`concurrent_jobs`) |
| `workspace_max_jobs_per_day` | 200 (UTC day) [ASSUMPTION, tune on staging] | 429 `LIMIT_EXCEEDED` (`daily_jobs`) + `Retry-After` |
| `api_rate_limit_job_posts_per_hour` | 30 per user | 429 `RATE_LIMITED` (`job_posts`) + `Retry-After` |

Usage is shown in Settings > Quotas and by `GET /api/v1/workspaces/{id}/usage`.

## 6. Monitoring and alerts (S7.3)

No paid monitoring service is used (none approved). Every
`WORKER_MONITOR_INTERVAL_SECONDS` (300 s; `0` disables it on extra workers)
the worker reads `sor_ops_snapshot`, evaluates the alerts with deterministic
rules (`@sor/domain` `evaluateOpsAlerts`, version `ops-alerts-1`) and records
their state in `ops_alerts` (one row per episode, opened / refreshed /
resolved). Logs (JSON, one line each):

- `ops snapshot` every cycle: queued, running, retrying, oldest due wait,
  stuck jobs, queue backlog, finished / failed / dead-letter /
  budget-exhausted over 24 h, AI cost today, open alerts;
- `alert opened` (level `error` for critical, `warn` otherwise) and
  `alert resolved`, once per transition — match these with a log-based
  alert on the host (Render log streams / alerts: to configure by the
  product owner when staging exists, **not done**);
- `ops monitor failed` if a cycle fails (the worker keeps running).

The operator console (`/operator`, `GET /api/v1/operator/health`) shows the
live snapshot, the alerts that hold now and the alert history.

| Alert key | Severity | Holds when (thresholds in `platform_limits`) | First response |
|---|---|---|---|
| `stuck_jobs` | critical | a running job's lease expired > `ops_stale_lease_grace_seconds` (300 s) ago and no worker took it back | Check that a worker runs and logs `worker stats`; restart it (Render "Restart"); its message reappears and the job resumes from its last completed step |
| `dead_letters` | critical | ≥ `ops_alert_dead_letters_per_day` (1) dead-letter jobs over 24 h | Read `last_error_code` in the console; fix the cause; the user retries from the UI |
| `queue_backlog` | warning | a due queued/retrying job waits > `ops_queue_wait_alert_seconds` (900 s) | Worker down or saturated: check logs and `WORKER_CONCURRENCY`; the orphan sweep re-sends lost messages |
| `job_failure_rate` | warning | failed + dead letter ≥ `ops_alert_failure_rate_pct` (25 %) of ≥ `ops_alert_min_sample` (10) finished jobs over 24 h | Group failures by error code in the console |
| `budget_exhaustion_rate` | warning | `budget_exhausted` ≥ `ops_alert_budget_exhaustion_rate_pct` (20 %) of finished jobs over 24 h | Budgets too low for the workload (PD-24 budgets) |
| `provider_error_rate:<provider>` | warning | provider errors ≥ `ops_alert_provider_error_rate_pct` (20 %) of ≥ `ops_alert_min_provider_calls` (20) calls over 1 h | Provider outage or schema drift: check the provider status page; jobs retry with backoff |
| `ai_cost_per_day` | warning | AI cost today (UTC) ≥ `ops_alert_ai_cost_usd_per_day` (5 USD, [ASSUMPTION] until PD-24) | Check the top workspaces in the console; lower budgets if needed |

Cost = `reported_cost_usd` when the provider reports it, otherwise the
gateway estimate (`provider_usage`). Workspaces see their own AI cost of the
day in Settings > Quotas.

## 7. Operator access (PD-30)

The operator console and API require an MFA-verified session (TOTP). Hosted
projects: enable TOTP enrolment and verification in Authentication → MFA.
If the operator loses the authenticator app: in the Supabase dashboard,
Authentication → Users → the operator → remove the TOTP factor; the next
visit to `/operator` starts a new enrolment. Never share the enrolment key.

## 8. Not covered yet (rest of Sprint 7)

Web deployment on Vercel (region `fra1`), host-side log alert configuration
(needs staging), security and RLS review, backups and restore drill, load
and failure-mode tests, remaining operational runbooks.
