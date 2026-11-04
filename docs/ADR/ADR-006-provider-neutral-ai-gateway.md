# ADR-006 — Provider-neutral AI gateway

- **Status:** ACCEPTED; providers and thresholds PENDING_USER_APPROVAL (PD-08, PD-22)
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

## Pending

- **PD-08:** the provider(s), the model per profile, the embedding model (which fixes vector dimensions and enables an ANN index), and default AI budgets. Recommended: choose after benchmarking cost and quality on the evaluation fixtures.
- **PD-22:** the per-agent evaluation acceptance thresholds, proposed from the first baseline.
