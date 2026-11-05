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

