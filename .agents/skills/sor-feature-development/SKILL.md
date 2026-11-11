---
name: sor-feature-development
description: Implement or refactor SaaS Opportunity Radar product features in the existing monorepo while preserving product requirements, architecture boundaries, design system, and test coverage.
---

# SOR feature development

Use this skill for new product features, UI work, API changes and refactors.

## Workflow

1. Read `AGENTS.md`, the relevant sections of `CLAUDE.md`, and the applicable PRD, ADR, technical blueprint and implementation-status entries.
2. Inspect the existing end-to-end flow before editing: page/component → route/action → contract → package/service → database or worker path.
3. Identify the smallest coherent vertical slice. Reuse existing contracts, components, repositories, hooks and patterns.
4. Keep responsibilities inside the approved package boundaries. Validate inputs at boundaries and authorize every workspace operation on the server.
5. For UI changes, read `DESIGN.md`; preserve the monochrome dark-first visual language, responsive behavior, semantic status colors, keyboard access and accessible labels.
6. Add or update unit, contract, integration or Playwright tests at the layer that proves the behavior. Include loading, empty, error and permission states where applicable.
7. Run formatting, lint, typecheck and relevant tests. Inspect the diff for accidental unrelated edits.

## Hard constraints

- Do not change the product strategy, scoring weights, verdict gates, permanent exclusions, source policy or architecture without an accepted decision.
- Do not treat a blueprint proposal or pending decision as a shipped requirement.
- Do not fabricate sample data in real product paths. Fixtures must be explicit and labelled.
- Do not add dependencies or new services without proving the existing stack cannot meet the need.
- Do not make a UI appear functional when its backend behavior is absent; represent unavailable data honestly.
- Do not deploy to production as part of feature implementation.
