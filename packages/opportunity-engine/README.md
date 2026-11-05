# @sor/opportunity-engine

Opportunity Engine (Implementation Blueprint §8): orchestration of the agents
O1–O9 for an opportunity analysis. Agents only propose; the evidence index,
proposal validation, score, coverage, WTP, confidence, kill-criterion
substantiation and verdict come from `@sor/domain` and the database (§9).

- `pipeline.ts`: state machine of §8.1, keyed steps (a resumed job repeats no
  model call), recommendation and competitor exclusion (§5.4, §8.10).
- `evidence-index.ts`: deterministic index selection, capped by depth.
- `report.ts`: final report document (server blocks + composer narrative) and
  Markdown export (PD-18 A). Simulated output is labelled.
- `fake.ts`: labelled fake handlers (PD-24a pending); `memory.ts`: in-memory
  ports; `evals.ts`: runner of `evals/opportunity/fixtures.json`.

Customer voice reuses persisted Pain Point clusters through the
`customerVoice()` port: engines never import each other.
