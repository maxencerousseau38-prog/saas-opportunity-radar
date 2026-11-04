# ADR-006 — Provider-neutral AI gateway

- **Status:** ACCEPTED (selection method PD-08 and threshold process PD-22 approved on 4 November 2026); concrete provider, models and budgets PENDING_USER_APPROVAL (PD-24)
- **Date:** 4 November 2026
- **Sources:** PRD §15 ("Architecture IA": provider independence, model per task, conserve model, instruction version, sources, results, errors, cost); `CLAUDE.md` §4.3; Implementation Blueprint v1.0 §5.2.

## Decision (ACCEPTED)

- **Profiles:** `fast_extraction`, `classification`, `research`, `reasoning`, `verification`, `embedding`. They are resolved in server configuration.
- **Output validation:**
  - Every structured output is validated with Zod.
  - One recorded repair attempt is allowed at most.
  - Every identifier the model cites must be one it was given.
- **Persistence per step:** agent key, contract version, prompt version, provider, model, tokens, cost, latency, warnings and output.
- **No tools:** agents have no tools in v1. External content is passed as delimited, untrusted data.
- **Budgets:** per call, per run and per analysis. Exhausting a budget yields `partial` / `needs_review`.
- **Fallback:** only on retryable provider failures, and the model change is recorded.
- **Testing:** a fake provider is used for tests and local development.

## Approved on 4 November 2026

- **PD-08 (A):** the provider is chosen after a cost/quality benchmark on the evaluation fixtures. One provider is used, plus a fake provider for tests. The budget is fixed after the benchmark.
- **PD-22 (A):** per-agent evaluation thresholds are proposed from the first baseline run and approved by the product owner agent by agent.

## Still pending

- **PD-24:** the outcome of the benchmark:
  - the concrete provider;
  - the model per profile;
  - the embedding model, which fixes vector dimensions and enables an ANN index;
  - the AI budgets (per analysis, per run, monthly ceiling).
- **Blocking:** Sprint 3 can start with the fake provider, but its exit gate needs a real provider for D5/D6, and Sprint 4 needs the embedding model.
- **Prerequisite:** the product owner provides API access to the candidate providers.
