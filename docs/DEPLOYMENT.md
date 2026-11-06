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
- **Logs**: one JSON line per event on stdout, including a `worker stats`
  line every 5 minutes (RSS, heap, running jobs) and at shutdown. Secrets
  are never logged (environment validation reports names only).

## 3. Memory (measured 6 Nov 2026)

| Situation | Measure |
|---|---|
| Idle worker (real bundle, empty queue, mock API) | RSS ≈ 110 MB (peak 117 MB), JS heap ≈ 22 MB |
| Heaviest job measured: deep discovery, 80 official pages of ~100 KB, in-process with the fake provider | +≈ 72 MB RSS, JS heap ≈ 61 MB |
| Estimate with `WORKER_CONCURRENCY=2` heavy jobs | ≈ 260 MB, below the 512 MB plan |
| E2E suite on the real stack, container limited to 512 MB | printed by CI (`memory.peak`) |

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

## 5. Not covered yet (rest of Sprint 7)

Web deployment on Vercel (region `fra1`), monitoring and alerts (stale jobs,
dead letters, provider spend), per-workspace quotas, backups and restore
drill, load and failure-mode tests, operational runbooks.
