# ADR-009 — Polymorphic analysis subjects

- **Status:** ACCEPTED (requirement from the PRD; data model PD-10 approved on 4 November 2026)
- **Date:** 4 November 2026
- **Sources:**
  - PRD §7.2: an analysis can start from a SaaS, a market category, a set of competing SaaS, a Pain Point Cluster, or a problem from a cross-cutting search, and is then not limited to one SaaS.
  - PRD §8.10: the /100 score applies to a precise opportunity hypothesis.
  - PRD §12.8: analyses can be associated with a cluster and several source SaaS.

## Context

v1.0 had `opportunity_analyses.product_id NOT NULL`. This made every non-product analysis impossible.

## Approved model (PD-10, option A)

- `subject_type` takes one of: `product`, `product_set`, `category`, `pain_point_cluster`, `generated_opportunity`.
- One typed nullable foreign key per subject kind, plus `analysis_subject_products`, which freezes the scope products and their role.
- A check constraint guarantees exactly one subject shape. Composite foreign keys keep clusters and generated opportunities inside the analysis' workspace.
- `subject_snapshot` keeps the subject as it was when the analysis was requested.
- A "problem from a cross-cutting search" is analysed through its cluster or its generated opportunity.

## Alternatives considered

- A generic `(subject_type, subject_id)` pair. Rejected: no referential integrity.
- A separate table per subject type. Rejected: it duplicates the scores, findings and report tables.
