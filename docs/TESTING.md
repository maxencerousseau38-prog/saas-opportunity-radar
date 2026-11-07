# Testing

**Created:** Sprint 0, 4 November 2026. Strategy: Technical Blueprint §16 and
Implementation Blueprint §14.

## Layers

| Layer | Tool | Location | Status |
|---|---|---|---|
| Unit | Vitest 5 | `packages/*/src/**/__tests__/*.test.ts`, `apps/worker/src/__tests__` | Active |
| Contract conventions | Vitest | `packages/contracts/src/__tests__/zod-conventions.test.ts` | Active (pins Zod 4 behaviours, §4.0) |
| Unit (web) | Vitest 5 | `apps/web/test/*.test.ts` | Active (cursor signing, filter chips, labels) |
| End-to-end | Playwright 1.64 | `apps/web/e2e/*.e2e.ts` | Active: Sprint 2 journeys on the local Supabase stack with labelled demo fixtures |
| Database (RLS, grants, triggers, RPCs) | pgTAP via `supabase test db` | `supabase/tests/*.sql` | Active: 12 files (see `docs/DATABASE_SECURITY.md`) |
| Integration (jobs, worker) | Vitest + local Supabase stack + fake provider + loopback fixture site | `apps/worker/test/integration/*.int.test.ts` (CI job `worker-integration`) | Active (Sprint 3) |
| AI evaluation | fixtures + metrics | `evals/` and `packages/discovery-engine/src/evals` | Active for D5/D6 (fake-provider baseline; real baseline after PD-24) |

## Conventions

- Every change adds or updates tests (CLAUDE.md §13).
- E2E files end in `.e2e.ts` so Vitest never picks them up.
- Packages without tests yet run `vitest run --passWithNoTests`; remove the flag
  when the first test lands.
- Tests never print secrets: environment tests assert that error messages contain
  variable names only.
- Fixtures and demo data are labelled; no mock data in production paths.

## Verified Zod 4 behaviours (contract convention tests)

The audit's Zod claims could not be checked against the documentation during
consolidation. Sprint 0 verified them on Zod 4.6.7:

| Behaviour | Result | Contract rule |
|---|---|---|
| `.default({})` on an object with inner defaults | inner defaults are **not** applied | use `.default(() => Inner.parse({}))` |
| `z.record(z.enum([...]), v)` | every enum key is required | use an explicit object with optional keys |
| `z.coerce.number("")` | returns `0` | CSV cells use `CsvNullableInt` / `CsvNullableNumber` (empty → `null`) |
| `z.string().url()` on `javascript:alert(1)` | accepted | use `HttpUrlSchema` (http/https only) |

## End-to-end tests (Sprint 2)

CI (`e2e` job) starts the local Supabase stack, seeds the labelled demo
fixtures with `pnpm --filter @sor/web seed:demo` (users
`demo-owner@demo.test` — also platform operator —, `demo-member@demo.test`,
`demo-viewer@demo.test`; a random password per run), builds the web app and
runs Playwright. The journeys share one database, so they run serially with no
retry.

Locally:

```bash
supabase start
```

Then export `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SECRET_KEY` (from `supabase status -o env`) and a `SEED_PASSWORD` of
12+ characters, and run:

```bash
pnpm --filter @sor/web seed:demo
```

```bash
pnpm test:e2e
```

The seed script refuses any Supabase URL other than `http://127.0.0.1` or
`http://localhost`; reset the database (`supabase db reset`) before seeding
again.

## Sprint 4: Pain Point Intelligence

- Unit: `@sor/domain` pain-point rules (evidence quality, `dedup-1`,
  `cluster-1`, `freq-1`), `@sor/ai-gateway` embeddings, `@sor/pain-point-engine`
  pipeline on in-memory ports (resume without repeated model calls, reuse
  across runs, exclusion of hypotheses, cancellation) and the evaluation
  fixtures of `evals/pain-points` (fake baseline: no incorrect merge,
  exact counts).
- Database: `supabase/tests/012_pain_points.sql` (privileges, RLS per role,
  scope triggers, request and correction RPCs, run/job state).
- Integration: `apps/worker/test/integration/pain.int.test.ts` (CSV feedback
  import → run → clusters, history, hypotheses; problems reused; cancellation).
- E2E: `apps/web/e2e/pain-points.e2e.ts` (import → run → cluster → correction
  → hypothesis status; viewer read-only), with the worker running.

## Sprint 5: Opportunity Engine

- Unit: `@sor/contracts` analysis and O1–O9 contracts, `@sor/domain`
  scoring (one test per §9.2 rule and §9.6 gate, confidence formula,
  PD-23 thresholds, red team only tightens), `@sor/opportunity-engine`
  pipeline on in-memory ports (VALIDATE FIRST on incomplete evidence,
  complete coverage, fatal flaw → REJECT, resume without repeated model
  calls, needs_review after two rejected assessments, permanent exclusion
  of recommendations and competitors, options, cancellation) and the
  evaluation fixtures of `evals/opportunity` (fake baseline: verdict
  consistency 1, reproducibility 1, no citation outside the index).
- Database: `supabase/tests/013_opportunity_analyses.sql` (privileges, RLS,
  every subject type, scope and thresholds, evidence index scope, finalize
  consistency checks, BUILD gates, exports, retry, deletion) and
  `014_analysis_customer_voice.sql` (analysis-owned pain point run).
- Integration: `apps/worker/test/integration/analysis.int.test.ts` (feedback
  import → analysis → nested P1–P7 run → report → Markdown export; second
  analysis reuses the covering run).
- E2E: `apps/web/e2e/opportunity-analyses.e2e.ts` (analysis from a SaaS
  profile and from a cluster; separate score elements; cited evidence;
  VALIDATE FIRST on incomplete evidence; export; viewer read-only).

## Sprint 6: Discovery Engine

- Unit: `@sor/contracts` discovery contracts (no exclusion override, no fit
  score in AI contracts, channels, leads without author or user text) and
  `@sor/domain` discovery rules (fit score `fit-1`, unknown values,
  explicit vs inferred vs preferences, configurable exclusions, planner
  guard, budgets).
- Database: `supabase/tests/015_discovery.sql` (privileges, RLS, source
  registry and quotas, Hacker News disabled, request validation, state
  sync, candidate identity/exclusion/fit rules, official-site evidence,
  evidence scope, recomputed counts, review, retry, deletion).
- Engine: `@sor/discovery-engine` `runDiscovery` on in-memory ports with
  the fake provider and synthetic pages (exclusion at every boundary,
  injection, partial results, identity, rebound controls, resume,
  cancellation).
- Integration: `apps/worker/test/integration/discovery.int.test.ts` (seed
  URLs → candidates with official-site evidence, Hacker News reported as
  not enabled and never called, excluded candidate rejected, duplicate
  delivery, acceptance, unreachable site → partial, crash recovery without
  repeated model calls, cancellation).
- E2E: `apps/web/e2e/discovery.e2e.ts` (start a run and follow its progress
  without any network call — Hacker News reported as not enabled; save the
  search; labelled demo run: fit score, coverage and evidence confidence
  shown separately, cited evidence, excluded candidate rejected and never
  addable, eligible candidate accepted into Discover; viewer read-only;
  Settings > Sources with storage policy and terms-review state).

## Sprint 7: worker deployability

- Unit: `apps/worker/src/__tests__/runtime.test.ts` (SIGTERM drain: a job
  finishing within the grace period completes normally; a job still
  running is released, never retried or failed; no new job after stop) and
  `watchdog.test.ts` (exit on stalled progress, quiet while progressing).
- Database: `supabase/tests/016_worker_release.sql` (only the lease owner
  releases; attempt given back; message visible at once; next claim is
  attempt 1).
- Integration: `pipeline.int.test.ts` — a SIGTERM drain releases a running
  job, no interrupted step is stored as completed, another worker completes
  the job at once.
- E2E: the CI runs the worker from its Docker image limited to 512 MB,
  prints the cgroup `memory.peak`, then checks a clean SIGTERM shutdown
  (exit code 0).

S7.2 (job quotas and rate limits):

- Database: `supabase/tests/017_job_quotas.sql` (hourly per-user limit with
  retry delay, refused requests leave nothing behind, idempotent replays
  answered and not counted, per-user budgets, daily per-workspace quota
  reset by UTC day, concurrency unchanged, usage RPC and its membership
  check).
- Unit: `packages/database/src/__tests__/errors.test.ts` (54000 →
  `RATE_LIMITED` / `LIMIT_EXCEEDED` with limit kind and retry delay),
  `packages/contracts/src/__tests__/jobs.test.ts` (usage DTO),
  `apps/web/test/limits.test.ts` (French message, details, `Retry-After`).
- Integration: `pipeline.int.test.ts` — the 31st job request of a user in
  an hour is refused through PostgREST with `RATE_LIMITED`, `job_posts`
  and a retry delay; a replay is still answered; usage reports 30/30.
- E2E: Settings shows the Quotas table to a viewer; `GET W/usage` answers.

S7.3 (monitoring, alerts, cost tracking):

- Database: `supabase/tests/018_ops_monitoring.sql` (privileges; stuck
  jobs — expired lease past the grace period, due job never picked up —
  and what is not stuck; queue counts; 24 h outcomes; recent failures;
  provider calls and errors over 1 h; cost today / per day / per provider,
  reported cost preferred; alert open → refresh → resolve → new episode;
  invalid keys and severities refused; workspace AI cost).
- Unit: `packages/domain/src/__tests__/ops.test.ts` (every alert rule,
  minimum samples, thresholds at 0, key suffixes),
  `apps/worker/src/__tests__/monitor.test.ts` (one log per transition,
  malformed snapshot refused, failed cycle logged, monitor disabled at 0).
- Integration: `pipeline.int.test.ts` — a running job with an expired lease
  opens `stuck_jobs` (critical) with its id, is not reopened on the next
  cycle, and resolves once the job is gone.
- E2E: the operator console shows the health section and
  `GET /api/v1/operator/health` answers (404 for a member); Settings shows
  the workspace AI cost; the CI checks that the worker container logged an
  `ops snapshot` and no `ops monitor failed`.

S7.4a (security guards):

- Database: `supabase/tests/019_privilege_manifest.sql` (structure rules
  and exact privilege manifest of the browser roles).
- `scripts/check-migrations.mjs` with `node --test scripts/` (names,
  unique timestamps, strictly increasing new migrations, forward-only).
- CI job "Security": gitleaks over the whole history (`.gitleaks.toml`),
  migration order against the previous revision, `pnpm audit --prod
  --audit-level high`. Dependabot: `.github/dependabot.yml`.

S7.4b–c (web hardening):

- Unit: `apps/web/test/security-headers.test.ts` (policy, nonce, static
  headers, CSP report parsing and rate limit), `apps/web/test/api-routes.test.ts`
  (route guards and role manifest).
- E2E: `e2e/fixtures.ts` makes every journey fail on a CSP violation;
  `e2e/security.e2e.ts` (headers, nonce, enforced policy blocks an injected
  inline script, report endpoint). Import `test` / `expect` from
  `./fixtures` in new journeys.

S7.4d (rate limits, invitation links, password policy):

- Database: `supabase/tests/020_action_rate_limits.sql`.
- Unit: `apps/web/test/limits.test.ts` (French messages and `Retry-After`
  for the new limits), `packages/contracts/src/__tests__/env.test.ts`
  (`SITE_URL` required in staging and production).
- Integration: `pipeline.int.test.ts` — the 21st invitation of a workspace
  in an hour is refused through PostgREST (`RATE_LIMITED`, `invitations`).

S7.4e (operator MFA):

- E2E: `catalog.e2e.ts` operator journey — operator API answers 403
  `mfa_required` before MFA, TOTP enrolment (code computed by
  `e2e/helpers.ts` `totp`, RFC 6238), console and API available after;
  non-operators still get 404. The enrolment key is kept in
  `test-results/.operator-totp-secret` for later sessions of the same run.

Integration files run one after the other (`--no-file-parallelism`, S7.4e):
they share one queue, and a worker that reads a job kind it has no handler
for leaves it invisible for its lease (S7.4a behaviour), which made timing
across files non-deterministic.

## Sprint 7: failure-mode tests (S7.5a)

CI job "Resilience" (`pnpm --filter @sor/worker test:resilience`) on the
local Supabase stack, files run one after the other; every scenario is
blocking. Harness: `apps/worker/test/resilience/harness.ts` (scripted fake
provider — transient / permanent / slow faults per agent call —, loopback
fixture site, small fixed leases and backoff, `expectInvariants`: bounded
attempts, terminal reason, one row per agent step, no duplicated evidence;
`withLimits` restores the platform limits it changes).

- `provider-faults.test.ts`: F1 transient outage retried with the
  extraction step reused; F2 lasting outage → dead letter, nothing applied,
  `dead_letters` and `provider_error_rate:fake` alerts; F3 slow provider cut
  off by its timeout, recorded, retried.
- `queue-faults.test.ts`: F6 frozen worker loses its lease, the new
  owner's result stands (its completed step is neither overwritten nor
  marked failed), nothing duplicated — this scenario exposed a defect fixed
  in S7.5a: step writes are now guarded by the attempt (see
  `docs/DEPLOYMENT.md` §2); F7 lost queue message re-sent
  by the orphan sweep; F8 malformed message on the real queue (sent with
  `psql`) archived and audited while the healthy job completes.
- `concurrency.test.ts`: F10 20 identical concurrent requests → one job,
  changed payload → conflict; F11 bursts admit exactly the concurrency
  limit, the daily quota and the hourly per-user limit.

