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
