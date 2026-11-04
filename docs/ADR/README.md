# Architecture Decision Records

**Last updated:** 4 November 2026

## Status legend

| Status | Meaning |
|---|---|
| `ACCEPTED` | Traceable to an approved source: `docs/PRODUCT_REQUIREMENTS.md`, `CLAUDE.md`, an explicit instruction of the product owner, or a choice stated in `docs/IMPLEMENTATION_BLUEPRINT.md` v1.0 as provided by the product owner and not contradicted by the PRD or `CLAUDE.md` **[ASSUMPTION: the product owner endorses the v1.0 implementation choices they committed as reference documentation]**. The source is cited in the ADR. |
| `PENDING_USER_APPROVAL` | A recommendation by the architecture work, not yet approved by the product owner. It must not be implemented before approval. |
| `SUPERSEDED` | Replaced by a later ADR (none yet). |

An ADR may be `ACCEPTED` overall while containing individual items marked
`PENDING_USER_APPROVAL`; those items carry a `PD-xx` identifier below.

Detailed specifications in `docs/IMPLEMENTATION_BLUEPRINT.md` that only
enforce an accepted rule (for example, a corrected RLS policy) are not
separate decisions.

## Index

| ADR | Title | Status |
|---|---|---|
| [ADR-000](ADR-000-reference-documents-and-governance.md) | Reference documents, precedence and decision governance | ACCEPTED |
| [ADR-001](ADR-001-modular-monolith-and-worker.md) | Modular monolith with a persistent worker; hosting | ACCEPTED; hosting PENDING (PD-02, PD-03) |
| [ADR-002](ADR-002-company-product-identity.md) | Company/product separation and product identity | ACCEPTED |
| [ADR-003](ADR-003-evidence-first-data-model.md) | Evidence-first data model with versioned snapshots | ACCEPTED |
| [ADR-004](ADR-004-pgmq-job-system.md) | PGMQ-based durable job system | ACCEPTED, subject to verification gate |
| [ADR-005](ADR-005-deterministic-scoring-and-verdicts.md) | Server-side deterministic scoring and verdict gates | ACCEPTED; parameters PENDING (PD-05, PD-06, PD-07, PD-21, PD-23) |
| [ADR-006](ADR-006-provider-neutral-ai-gateway.md) | Provider-neutral AI gateway | ACCEPTED; providers and evaluation thresholds PENDING (PD-08, PD-22) |
| [ADR-007](ADR-007-workspace-rls-and-platform-operator.md) | Workspace-scoped RLS, grants and platform operator role | ACCEPTED; operator holder PENDING (PD-12) |
| [ADR-008](ADR-008-pain-point-intelligence-engine.md) | Pain Point Intelligence Engine as third engine | ACCEPTED; cluster scope PENDING (PD-09) |
| [ADR-009](ADR-009-polymorphic-analysis-subjects.md) | Polymorphic analysis subjects | Requirement ACCEPTED; data model PENDING (PD-10) |
| [ADR-010](ADR-010-permanent-affiliate-partner-exclusion.md) | Permanent Affiliate/Partner exclusion | ACCEPTED; boundary cases PENDING (PD-11) |
| [ADR-011](ADR-011-toolchain-and-ci.md) | Toolchain, versions and CI | PENDING_USER_APPROVAL (PD-01) |
| [ADR-012](ADR-012-sprint-order.md) | Sprint order | PENDING_USER_APPROVAL (PD-13) |
| [ADR-013](ADR-013-source-acquisition-and-compliance.md) | Source acquisition and compliance | ACCEPTED; first sources PENDING (PD-14) |
| [ADR-014](ADR-014-workspace-status-model.md) | Workspace opportunity status model | PENDING_USER_APPROVAL (PD-04) |

## Pending decision register

Sprint numbers refer to `docs/IMPLEMENTATION_BLUEPRINT.md` §15. A
pending decision must be approved before the sprint it blocks starts.

| ID | Decision | Recommendation | Blocks | ADR |
|---|---|---|---|---|
| PD-01 | Toolchain versions (Node LTS line, pnpm, Next.js, Zod major, Supabase CLI, PostgreSQL) and CI provider | Current Node LTS line verified at Sprint 0 (v24 or v26; v22 nears end of support); pnpm 10; latest stable Next.js; Zod latest major with the version-agnostic contract tests; GitHub Actions (the repository is on GitHub) with a Supabase CLI database job | Sprint 0 | ADR-011 |
| PD-02 | Hosted environments: Supabase projects (staging, production), region, API key model | One staging and one production project in an EU region; new-style secret keys if available | Sprint 7 | ADR-001 |
| PD-03 | Hosting: confirm Vercel for web (PRD §22 "à confirmer"); choose the worker host | Vercel for web; a container host for the worker in the Supabase region | Sprint 7 | ADR-001 |
| PD-04 | Where opportunity status lives (PRD §10.3 vs §12.10 link-table `status`) | One status per product per workspace (`workspace_product_states`); collection items keep notes only | Sprint 1 | ADR-014 |
| PD-05 | Rating granularity | Integers 0--5 (PRD §8.7 defines only integer meanings) | Sprint 5 | ADR-005 |
| PD-06 | Verdict for complete scores 50--64 ("Faible potentiel"); whether a low-confidence exception should soften the ACCEPTED rule "score < 50 → REJECT" | 50--64 → REJECT with band "Faible potentiel"; no low-confidence exception | Sprint 5 | ADR-005 |
| PD-07 | Confidence formula and BUILD threshold; demand and differentiation gate definitions; kill-criterion substantiation | As specified in Implementation Blueprint §9.4--9.6 (threshold 70) | Sprint 5 | ADR-005 |
| PD-08 | AI providers, model per profile, embedding model, default AI budgets | Choose after a cost/quality benchmark on the evaluation fixtures; start with one provider plus a fake provider in tests | Sprint 3 (structured-output provider for D5/D6), Sprint 4 (embedding model) | ADR-006 |
| PD-09 | Pain Point Clusters scope | Workspace-scoped clusters and generated opportunities; structured problems and embeddings global | Sprint 4 | ADR-008 |
| PD-10 | Data model for analysis subjects | Typed nullable FKs + `analysis_subject_products` + one-shape check | Sprint 5 | ADR-009 |
| PD-11 | Exclusion boundary: sales-commission software for employees; customer-referral-program software | Not excluded by default, but routed to `needs_review` until decided (current safe behaviour) | Sprint 6 | ADR-010 |
| PD-12 | Who holds the platform operator role | The product owner only | Sprint 2 | ADR-007 |
| PD-13 | Sprint order | S0 tooling → S1 database → S2 catalog/Discover → S3 sources/evidence/jobs → S4 Pain Point → S5 Opportunity → S6 Discovery → S7 hardening | Sprint 4 | ADR-012 |
| PD-14 | First **third-party** sources (reviews, communities, search). The MVP base — manual entry, CSV imports, official website — is already ACCEPTED in ADR-013 | Add one review or community source only after a written terms review; choose the search source(s) for Discovery the same way | Sprint 4 (reviews), Sprint 6 (search) | ADR-013 |
| PD-15 | UI language | French UI copy, keeping the PRD's English navigation labels (Discover, AI Discovery, Opportunities, Saved, Settings) | Sprint 2 | --- |
| PD-16 | MVP "filtres fondamentaux" (PRD §18) | Groups A, B, C (HQ country), D, E, F, G, I, O; others in Phase 2 | Sprint 2 | --- |
| PD-17 | Derived filter definitions: "Indie SaaS", maturity estimation | Indie = independent AND ≤ 20 employees AND not externally funded; maturity only from evidence until a rule is approved | Sprint 2 (those filters only) | --- |
| PD-18 | "Rapport exportable" formats | JSON + Markdown in the MVP; PDF later | Sprint 5 | --- |
| PD-19 | Navigation placement of Pain Point Clusters, generated opportunities and Comparator | Under "Opportunities": tabs Analyses / Clusters / Generated opportunities; Comparator reachable from Saved and from multi-select | Sprint 4 | --- |
| PD-20 | Source of indicative FX rates (PRD §4.2.G) | European Central Bank daily reference rates, refreshed daily | Sprint 2 (price bands only) | --- |
| PD-21 | Whether user-recorded payments from validation experiments satisfy the paying-customer gate | Decide before Phase 3 | Phase 3 | ADR-005 |
| PD-22 | Acceptance thresholds of AI evaluations per agent | Proposed from the first baseline run, approved per agent | Sprint 3 (D5/D6), Sprint 4 | ADR-006 |
| PD-23 | PRD §14.1 "Seuil de validation": may a workspace set its own validation threshold? | Only stricter than the locked PRD §21 minimums (score ≥ 75, WTP ≥ 10), never lower | Sprint 5 | ADR-005 |

No decision blocks the remaining documentation. Only PD-01 blocks the
start of Sprint 0.
