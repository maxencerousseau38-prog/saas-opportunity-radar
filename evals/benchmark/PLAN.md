# PD-24a benchmark — plan (generation provider for D5/D6)

**Status:** prepared 5 November 2026. **No paid call has been made.** Each
stage runs only after the product owner's explicit approval of that stage.

## Decisions approved by the product owner (5 November 2026)

| Topic           | Decision                                                                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope           | PD-24 split: **PD-24a now** (generation provider, model per profile, per-task budgets); **PD-24b in Sprint 4** (embedding model, measured on the clustering fixtures) |
| Candidates      | Anthropic, OpenAI, Mistral — **one provider retained** (PD-08 A)                                                                                                      |
| Matrix          | B: per vendor, entry and mid tier at two effort levels, top tier once as a quality ceiling                                                                            |
| Evaluation set  | B: 20–30 real official websites frozen once + 5 adversarial cases (+ the 6 Sprint 3 synthetic fixtures)                                                               |
| Criteria        | Quality first: eliminatory gates, then ranking (recall, then cost, then p95 latency)                                                                                  |
| Benchmark spend | Capped at **30 USD** in total                                                                                                                                         |
| Budgets         | Per-task budget = measured p95 cost × 2; **monthly production budget not fixed yet**                                                                                  |
| Residency       | B: public web content in any region; customer reviews (PD-24b) need EU processing or zero retention                                                                   |

## Evaluation set (39 fixtures)

- **28 real sites** — `evals/enrichment/real/` (30 listed; `carrd` and `groove`
  failed: their home page redirects to another domain, which the production
  connector refuses). Pages frozen on 5 Nov 2026 by `.github/workflows/eval-snapshot.yml`
  with the production connector (robots.txt obeyed). `growsurf` and `typefully`
  have a one-page snapshot and stay in the set as sparse-information cases.
  Annotations: `annotations/<id>.json` (drafts, to be reviewed by the product
  owner; `node evals/enrichment/real/check-annotations.mjs` checks that every
  expected item quotes the frozen page).
- **5 adversarial cases** — `evals/enrichment/adversarial.json`: discontinued
  product, several products on one domain, similar names, contradictory facts,
  inflated social proof with an injection.
- **6 synthetic fixtures** of Sprint 3 — `evals/enrichment/fixtures.json`.

Screening subset (21): the 11 synthetic/adversarial fixtures + 10 real sites
stratified by size and exclusion status (`rewardful`, `firstpromoter`,
`growsurf`, `typefully`, `instatus`, `cronitor`, `savvycal`, `transistor`,
`testimonial`, `frase`). Hard subset (15): the 11 synthetic/adversarial
fixtures + `rewardful`, `firstpromoter`, `growsurf`, `frase`.

## Configurations (15)

Prices verified in the official documentation (`pricing.json`, snapshots in
`vendor-docs/`). D5 = `fast_extraction`, D6 = `verification`.

| Id  | Model                                | Setting                                         | USD / MTok in–out |
| --- | ------------------------------------ | ----------------------------------------------- | ----------------- |
| A1  | claude-haiku-5-5                     | thinking disabled                               | 0.10 – 0.50       |
| A2  | claude-haiku-5-5                     | adaptive thinking, effort medium                | 0.10 – 0.50       |
| A3  | claude-sonnet-5-5                    | thinking `between_tools`, effort low            | 2 – 10            |
| A4  | claude-sonnet-5-5                    | adaptive thinking, effort medium                | 2 – 10            |
| A5  | claude-opus-5-5                      | effort low — **top-tier reference**             | 4 – 20            |
| O1  | gpt-6-luna                           | reasoning none                                  | 0.10 – 0.50       |
| O2  | gpt-6-luna                           | reasoning medium                                | 0.10 – 0.50       |
| O3  | gpt-6.1-sol                          | reasoning low (no "none" on Sol)                | 2 – 10            |
| O4  | gpt-6.1-sol                          | reasoning medium                                | 2 – 10            |
| O5  | gpt-6-astra                          | reasoning low — **top-tier reference**          | 10 – 50           |
| M1  | ministral-14b-2512 (Ministral 3 14B) | no reasoning (entry tier has no effort setting) | 0.20 – 0.20       |
| M2  | mistral-small-2603 (Small 4)         | reasoning none                                  | 0.15 – 0.60       |
| M3  | mistral-small-2603 (Small 4)         | reasoning high                                  | 0.15 – 0.60       |
| M4  | mistral-large-4                      | reasoning low                                   | 0.70 – 2.10       |
| M5  | mistral-large-4                      | reasoning high — **top-tier reference**         | 0.70 – 2.10       |

Mistral has no current mid tier (Medium 3.5 deprecated on 31 Oct 2026), so
Small 4 plays the mid tier and Large 4 (public preview) the top tier.
Max output tokens (reasoning included): D5 8,000 without reasoning, 24,000
with; D6 4,000 / 12,000.

## Stages

**Stage 1 — screening** (synchronous calls, latency measured). The 12
non-reference configurations run once on the 21-fixture screening subset;
the 3 references run once on the 15-fixture hard subset. Hard cap: **22 USD**.

**Stage 2 — confirmation.** Finalists: the best configuration of each vendor
that passes every gate (at most 3; references are not finalists). Each
finalist runs once on the 18 remaining real sites and twice more on the
screening subset (3 runs in total → reproducibility). Hard cap: **30 USD
minus the actual stage-1 spend**. Before stage 2, the exact cost of each
finalist (measured in stage 1) is presented for approval; finalists are
taken in ranking order while they fit the cap.

## Gates (eliminatory) and ranking

Gates, per configuration:

1. unsupported-claim rate among accepted items ≤ 1 % (target 0);
2. zero accepted forbidden item (injection followed, another product's or
   company's facts, payment proof inferred from pricing or a customer count,
   archived plans reported as current);
3. exclusion outcome correct on 100 % of fixtures;
4. ≥ 95 % of calls schema-valid at the first attempt, and no enrichment lost
   after the single repair;
5. stage 2 only: identical exclusion outcome across the 3 runs.

Ranking of the configurations that pass: recall of the annotated facts
(plans, features, integrations, stated fields; ties within 2 points count as
equal), then cost per enrichment, then p95 latency. Reported, not ranked:
reproducibility (Jaccard of verified items across runs), conflicts and
warnings on the adversarial cases.

## Estimated cost (USD)

Input tokens measured on the real D5/D6 requests (system instructions + JSON
schema + frozen pages) with the `o200k_base` tokenizer, then converted per
vendor: OpenAI ×1.0 (prudent ×1.15), Mistral ×1.1 (×1.25), Anthropic ×1.35
(×1.5; the docs state recent Claude models produce about 30 % more tokens).
Mean D5 input of a real site: ~11,200 tokens (median ~9,900; max ~40,900 for
`convertflow`), all below Haiku 5.5's 100,000-token price threshold. Output
assumed: D5 2,500 visible tokens, D6 1,000; reasoning low 1,500/800, medium
4,000/2,000, high 8,000/4,000. "Prudent" = ceiling tokenizer factor, +50 %
output, 10 % of calls repaired.

| Config            | Stage 1 expected | Stage 1 prudent | Stage 2 if finalist (expected / prudent) | Mean cost per real enrichment |
| ----------------- | ---------------: | --------------: | ---------------------------------------: | ----------------------------: |
| A1                |             0.05 |            0.07 |                              0.20 / 0.28 |                         0.005 |
| A2                |             0.11 |            0.18 |                              0.38 / 0.58 |                         0.008 |
| A3                |             1.48 |            2.25 |                              5.30 / 7.88 |                         0.130 |
| A4                |             2.26 |            3.53 |                             7.52 / 11.55 |                         0.167 |
| A5 (ref.)         |             1.77 |            2.70 |                                        — |                         0.261 |
| O1                |             0.04 |            0.06 |                              0.16 / 0.24 |                         0.004 |
| O2                |             0.11 |            0.17 |                              0.34 / 0.54 |                         0.007 |
| O3                |             1.33 |            2.07 |                              4.67 / 7.15 |                         0.112 |
| O4                |             2.11 |            3.35 |                             6.89 / 10.81 |                         0.149 |
| O5 (ref.)         |             4.02 |            6.26 |                                        — |                         0.558 |
| M1                |             0.05 |            0.08 |                              0.23 / 0.31 |                         0.007 |
| M2                |             0.06 |            0.09 |                              0.24 / 0.34 |                         0.007 |
| M3                |             0.21 |            0.34 |                              0.67 / 1.06 |                         0.014 |
| M4                |             0.35 |            0.53 |                              1.30 / 1.91 |                         0.033 |
| M5 (ref.)         |             0.52 |            0.82 |                                        — |                         0.053 |
| **Stage 1 total** |        **14.47** |       **22.50** |                                          |                               |

Stage 1 per vendor (expected): Anthropic 5.67, OpenAI 7.60, Mistral 1.20.
Running every configuration on all 39 fixtures would cost ~46 USD expected
(~69 prudent), which is why stage 1 uses subsets.

**Guarantee.** The harness reserves the worst case of each call before
sending it (input counted at 1 token per 2 characters, output at
`max_tokens`, at list price) and refuses any call that would take the
cumulative spend above the stage cap; the run then stops with a partial
report. A spending limit set in each vendor console (e.g. 15 USD) is a
second, independent safeguard.

## Engineering before execution (done 5 November 2026, no paid call)

1. **Provider adapters** — `packages/ai-gateway/src/providers.ts`: Anthropic
   Messages API (`output_config.format` JSON schema, `output_config.effort`,
   `thinking`; never `temperature`), OpenAI Responses API (strict
   `text.format` JSON schema, `reasoning.effort`, `store: false`), Mistral
   chat completions (`response_format` JSON schema, `reasoning_effort`).
   Plain HTTPS with a few retries on 408/409/429/5xx/529 (never on other
   client errors); refusals are permanent errors; truncation is reported as
   `length` and goes through the gateway's single repair. Schemas are
   prepared per vendor (`prompt.ts`): constraint keywords a vendor rejects
   are dropped (Zod still validates everything), every object is strict with
   all properties required, and the polymorphic claim `value` is typed as
   string | number | boolean | string[] | null. Tested against simulated
   responses that follow the documented shapes — **no real call has been
   made, so a first stage-1 call may still reveal a shape difference**.
2. **Per-model settings** — the gateway's profile configuration now carries
   `maxOutputTokens`, `timeoutMs`, `reasoningEffort` and `thinking`
   (`ModelSettings`); production keeps the fake provider and its defaults.
3. **Runner** — `apps/worker/src/evals/benchmark-runner.ts` and the CLI
   `benchmark.ts` (built by `pnpm --filter @sor/worker eval:build`). It
   replays the frozen pages through the production `runEnrichment`, scores
   each case (`packages/discovery-engine/src/evals/benchmark.ts`): quotes
   found in the page and numbers found in the quote, forbidden items,
   recall of annotated plans/features/integrations/fields, exclusion,
   first-attempt validity, lost enrichments, cost and latency. Prices come
   from `pricing.json`, configurations and stages from `configs.json`.
   Guards: a stage with a real provider refuses to start without
   `--confirm-paid`, a positive cap and every needed key; before each call
   the gateway reserves its worst case and refuses it above the remaining
   cap; the run then stops and the report says so.
4. **Dry run** — `evals/benchmark/results/dry-run/` (fake provider, 39
   cases, 0 USD). The fake provider is not a model and fails the gates, as
   expected; the run shows the scorer catching prices misread from
   "$4,971", archived plans reported as current and missed exclusions.

Commands (from the repository root, after `pnpm --filter @sor/worker eval:build`):

```bash
node apps/worker/dist-evals/benchmark.js --stage dry-run
```

```bash
NODE_USE_ENV_PROXY=1 node apps/worker/dist-evals/benchmark.js --stage stage1 --confirm-paid
```

```bash
NODE_USE_ENV_PROXY=1 node apps/worker/dist-evals/benchmark.js --stage stage2 --configs <approved finalists> --cap <30 minus stage-1 spend> --confirm-paid
```

`NODE_USE_ENV_PROXY=1` makes Node's `fetch` use the environment's HTTPS
proxy (needed for `api.openai.com` and `api.mistral.ai` in the cloud
session). Before stage 1, a free model listing per vendor confirms the
exact model ids (Ministral 3 14B is `ministral-14b-2512`, checked on its official page on 5 Nov 2026).

## Secrets and network

- Keys are environment variables of the cloud environment —
  `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `MISTRAL_API_KEY` — set by the
  product owner in the environment settings, never in the conversation, the
  repository or the CI. A new session picks them up.
- Network access: `api.openai.com` and `api.mistral.ai` must be allowed in
  the environment's network settings (`api.anthropic.com` is already
  reachable).
- Keys are read only by the runner process, never logged; reports contain
  no key or request header.

## Residency facts for the final choice (and PD-24b)

| Vendor    | EU processing                                                                                                                                  | Zero / reduced retention                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Anthropic | Not on the first-party API (`inference_geo`: global or us). EU via AWS Bedrock EU profiles or Google Cloud `eu` multi-region (+10 %, no Batch) | ZDR by arrangement with sales; Batch not ZDR-eligible                                          |
| OpenAI    | `eu.api.openai.com` data residency, +10 %, subject to sales eligibility                                                                        | ZDR / Modified Abuse Monitoring by prior approval; default abuse-monitoring logs up to 30 days |
| Mistral   | `api.eu.mistral.ai`, +10 %, self-serve (no Batch, no Files there)                                                                              | Not verified (legal pages not readable as text)                                                |

## Output of the benchmark

A report with gates, recall, cost and p95 latency per configuration; the
recommended provider and model per profile (D5 and D6 may use different
models of the same provider); the per-task budget (p95 enrichment cost × 2);
proposed PD-22 thresholds for D5/D6. The product owner approves PD-24a and
the PD-22 thresholds; the monthly production budget is fixed later.
