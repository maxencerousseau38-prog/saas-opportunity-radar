# Testing

**Created:** Sprint 0, 4 November 2026. Strategy: Technical Blueprint §16 and
Implementation Blueprint §14.

## Layers

| Layer | Tool | Location | Status |
|---|---|---|---|
| Unit | Vitest 5 | `packages/*/src/**/__tests__/*.test.ts`, `apps/worker/src/__tests__` | Active |
| Contract conventions | Vitest | `packages/contracts/src/__tests__/zod-conventions.test.ts` | Active (pins Zod 4 behaviours, §4.0) |
| End-to-end | Playwright 1.64 | `apps/web/e2e/*.e2e.ts` | Smoke test active |
| Database (RLS, grants, triggers, RPCs) | pgTAP via `supabase test db` | `supabase/tests/*.sql` | Active: 7 files, 121 assertions (see `docs/DATABASE_SECURITY.md`) |
| Integration (jobs, engines) | Vitest + local Supabase + fake providers | per package | From Sprint 3 |
| AI evaluation | fixtures + metrics | `evals/` | From Sprint 3 |

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
