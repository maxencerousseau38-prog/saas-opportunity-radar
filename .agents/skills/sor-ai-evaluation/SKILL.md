---
name: sor-ai-evaluation
description: Change or evaluate SOR AI agents, model prompts, structured outputs, provider adapters, discovery/enrichment quality, scoring inputs, token costs, or benchmark fixtures.
---

# SOR AI evaluation

Use this skill for all AI provider, agent, prompt, quality, evaluation and model-cost work.

## Architecture invariants

- Route model calls through the provider-neutral `packages/ai-gateway`; do not call vendor SDKs directly from engines, routes or the worker.
- Keep domain decisions, exclusions, scoring, confidence coverage and final verdict gates deterministic.
- Model output is untrusted proposed data. Validate it with canonical Zod contracts and verify claims against captured source evidence before accepting them.
- The fake provider is the default for tests and isolated CI. Do not imply that simulated-provider tests demonstrate real model quality.

## Benchmark and approval gates

1. Read ADR-006, `evals/benchmark/PLAN.md`, the relevant fixtures, `docs/IMPLEMENTATION_BLUEPRINT.md` and PD-22/PD-24 in the ADR register.
2. Preserve the approved benchmark matrix, fixture set, eliminatory gates, ranking criteria, residency rules, output limits and spend caps.
3. Use only the exact benchmark stage and budget already approved. Stage 2 requires its separate approval.
4. Do not choose a production provider/model or monthly budget until the measured evidence supports a documented product-owner decision.
5. API keys must be configured as secure environment secrets by the owner. Never request secrets in chat, print them, commit them or place them in test fixtures.
6. Do not use externally generated AI text as catalogue evidence. Manual research handoff notes remain unverified and must not enter discovery or opportunity-engine inputs.

## Report

Report quality-gate results first, then recall/coverage, cost and p95 latency. Include failures and exclusions, not only aggregate scores. Separate fixture results from real production use.
