# AI evaluation fixtures

Fixed fixtures for the AI agents (CLAUDE.md §13 "AI evaluation";
Implementation Blueprint §14). They are the input of the PD-08 benchmark
whose outcome is PD-24 (provider, models, budgets) and of the per-agent
threshold approvals (PD-22).

| Directory     | Agents                              | Runner                                              |
| ------------- | ----------------------------------- | --------------------------------------------------- |
| `enrichment/` | D5 Enrichment, D6 Evidence Verifier | `packages/discovery-engine/src/evals/enrichment.ts` |

Each fixture is a small official website (pages as text) and the facts a
correct extraction may report (`expected`) or must never report
(`forbidden`). Metrics:

- **unsupported-claim rate**: accepted (verified) items whose quote is not in the
  cited page, or that match a `forbidden` fact; target 0;
- **extraction recall**: expected facts found and verified;
- **exclusion outcome**: the §5.4 classifier result after enrichment.

The fake provider is a deterministic baseline, not a model: its recall is
low by design. Run with a real provider once PD-24 is decided.

## PD-24a benchmark inputs (5 November 2026)

| Path                                     | Content                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `enrichment/real/sites.json`             | 30 official websites (28 captured)                                        |
| `enrichment/real/snapshots/`             | frozen pages (production connector, CI workflow `eval-snapshot.yml`)      |
| `enrichment/real/annotations/`           | expected / forbidden facts per site (drafts pending product-owner review) |
| `enrichment/real/ANNOTATION_GUIDE.md`    | annotation rules; `check-annotations.mjs` checks every quote              |
| `enrichment/adversarial.json`            | 5 adversarial cases                                                       |
| `benchmark/PLAN.md`                      | two-stage plan, gates, cost estimate, secrets                             |
| `benchmark/pricing.json`, `vendor-docs/` | verified vendor prices and the official pages they come from              |

Snapshots are inputs, never refreshed silently: the workflow skips any site
or page already frozen.

Runner: `pnpm --filter @sor/worker eval:build`, then
`node apps/worker/dist-evals/benchmark.js --stage dry-run` (fake provider,
zero cost). Paid stages need the product owner's approval, `--confirm-paid`,
a cap and the API keys (see `benchmark/PLAN.md`).
