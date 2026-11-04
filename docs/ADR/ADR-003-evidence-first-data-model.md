# ADR-003 — Evidence-first data model with versioned snapshots

- **Status:** ACCEPTED
- **Date:** 4 November 2026
- **Sources:**
  - `CLAUDE.md` §4.1: preserve URL, source identity, retrieval timestamp, publication timestamp and content hash; keep contradictory evidence.
  - PRD §5.10: confirmed / estimated / declared / unknown.
  - PRD §12.5: store original text only when permitted.
  - PRD §13.2: reliability levels.
  - PRD §16.

## Decision

- Chain: `sources` → `source_records` → `source_snapshots` (one per content hash, never overwritten) → `evidence_items` (one claim each).
- Each evidence item carries two separate statuses:
  - `fact_status` (confirmed / estimated / declared / unknown);
  - `verification_status` (unverified / verified / needs_review / rejected / stale).
- `catalog_field_provenance` links each displayed field to its evidence. `evidence_conflicts` keeps contradictions.
- A customer review is itself an evidence item, linked one-to-one from `customer_feedback`. Its text is stored only when `content_storage_status` allows it.
- Analyses cite only evidence from their own evidence index (`analysis_evidence`), which database triggers restrict to the analysis scope.
- Integrity is enforced in the database:
  - scope triggers;
  - composite foreign keys;
  - checks: traffic is always estimated; levels 3–4 never confirm payment; a feature claim needs evidence.

## Consequences

- More tables than v1.0, but every factual statement is traceable and history is preserved.
- Re-fetching unchanged content updates `last_retrieved_at` instead of creating a duplicate snapshot.

## Alternatives considered

- Overwriting `source_records`, as in v1.0. Rejected: it lost history.
- `uuid[]` arrays of evidence IDs, as in v1.0. Rejected: there is no referential integrity.
