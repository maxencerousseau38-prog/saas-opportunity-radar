# @sor/pain-point-engine

Pain Point Intelligence Engine (Implementation Blueprint §7; ADR-008):
orchestration of P1–P9 over persisted, keyed steps. Never scores.

- `runPainPointRun(ports)` — state machine of §7.1; deterministic parts come
  from `@sor/domain` (P2 dedup-1, P5 cluster-1, P7 freq-1, exclusion excl-1).
- `fakePainPointHandlers` — labelled fake P3/P6/P8/P9 for tests and the CI
  (PD-24a/PD-24b pending: no real provider is wired).
- `memoryPorts` — in-memory ports for tests and `evaluatePainFixtures`
  (fixtures in `evals/pain-points/`).

Import boundaries are enforced by the root `eslint.config.mjs`.
