# ADR-000 — Reference documents, precedence and decision governance

- **Status:** ACCEPTED
- **Date:** 4 November 2026
- **Source:** product-owner instruction of 4 November 2026 (documentation consolidation mission): "utilise le cahier des charges comme référence pour les exigences fonctionnelles"; `CLAUDE.md` §2.

## Context

The repository audit found that `docs/TECHNICAL_BLUEPRINT.md`, listed as a required source by `CLAUDE.md` §2, did not exist. It also found contradictions between `docs/PRODUCT_REQUIREMENTS.md` v1.1, `docs/IMPLEMENTATION_BLUEPRINT.md` v1.0 and `CLAUDE.md` v1.0: a third engine, analysis subjects, verdict thresholds and sprint order.

## Decision

1. **Precedence for functional requirements:** `docs/PRODUCT_REQUIREMENTS.md` wins. No technical document may weaken a product requirement to fit an implementation.
2. **Document roles:**
   - `docs/PRODUCT_REQUIREMENTS.md` — what the product does.
   - `docs/TECHNICAL_BLUEPRINT.md` — architecture.
   - `docs/IMPLEMENTATION_BLUEPRINT.md` — implementable specifications.
   - `CLAUDE.md` — permanent working rules.
   - `docs/ADR/` — decisions and their approval status.
3. **Technical Blueprint:** created on 4 November 2026 from verified content of the other documents, because none existed.
4. **Governance:**
   - Each decision is `ACCEPTED`, with a cited source, or `PENDING_USER_APPROVAL`, with a `PD-xx` entry in the register (`docs/ADR/README.md`).
   - Pending items are never implemented before approval.
   - Assumptions are marked `[ASSUMPTION]`.
5. **Change rule:** a change to one reference document that affects another is made in all affected documents in the same change, with an ADR update when a decision changes.

## Consequences

- The PRD changed only in formatting, with two clarifications that align with its own locked decisions. The functional scope is unchanged.
- Implementers have one place to check whether a decision is approved.

## Alternatives considered

- Waiting for an externally written Technical Blueprint. Rejected: it would block all work, and the architecture can be derived from the existing approved documents.
