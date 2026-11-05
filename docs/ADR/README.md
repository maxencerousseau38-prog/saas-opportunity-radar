# Architecture Decision Records

**Last updated:** 4 November 2026 (product-owner arbitration of PD-01 to PD-23)

## Status legend

| Status | Meaning |
|---|---|
| `ACCEPTED` | Traceable to an approved source: `docs/PRODUCT_REQUIREMENTS.md`, `CLAUDE.md`, an explicit instruction or arbitration of the product owner, or a choice stated in `docs/IMPLEMENTATION_BLUEPRINT.md` v1.0 as provided by the product owner and not contradicted by the PRD or `CLAUDE.md` **[ASSUMPTION: the product owner endorses the v1.0 implementation choices they committed as reference documentation]**. The source is cited in the ADR. |
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
| [ADR-001](ADR-001-modular-monolith-and-worker.md) | Modular monolith with a persistent worker; hosting | ACCEPTED (PD-02, PD-03); worker host vendor PENDING (PD-27) |
| [ADR-002](ADR-002-company-product-identity.md) | Company/product separation and product identity | ACCEPTED |
| [ADR-003](ADR-003-evidence-first-data-model.md) | Evidence-first data model with versioned snapshots | ACCEPTED |
| [ADR-004](ADR-004-pgmq-job-system.md) | PGMQ-based durable job system | ACCEPTED, subject to verification gate |
| [ADR-005](ADR-005-deterministic-scoring-and-verdicts.md) | Server-side deterministic scoring and verdict gates | ACCEPTED (PD-05, PD-06, PD-07, PD-21, PD-23); low-confidence exception PENDING (PD-25) |
| [ADR-006](ADR-006-provider-neutral-ai-gateway.md) | Provider-neutral AI gateway | ACCEPTED (PD-08 method, PD-22); provider/model/budget selection PENDING (PD-24) |
| [ADR-007](ADR-007-workspace-rls-and-platform-operator.md) | Workspace-scoped RLS, grants and platform operator role | ACCEPTED (PD-12) |
| [ADR-008](ADR-008-pain-point-intelligence-engine.md) | Pain Point Intelligence Engine as third engine | ACCEPTED (PD-09) |
| [ADR-009](ADR-009-polymorphic-analysis-subjects.md) | Polymorphic analysis subjects | ACCEPTED (PD-10) |
| [ADR-010](ADR-010-permanent-affiliate-partner-exclusion.md) | Permanent Affiliate/Partner exclusion | ACCEPTED (PD-11) |
| [ADR-011](ADR-011-toolchain-and-ci.md) | Toolchain, versions and CI | ACCEPTED (PD-01) |
| [ADR-012](ADR-012-sprint-order.md) | Sprint order | ACCEPTED (PD-13) |
| [ADR-013](ADR-013-source-acquisition-and-compliance.md) | Source acquisition and compliance | ACCEPTED (PD-14); G2 approval and Discovery search sources PENDING (PD-26, PD-28) |
| [ADR-014](ADR-014-workspace-status-model.md) | Workspace opportunity status model | ACCEPTED (PD-04) |

## Decisions approved by the product owner on 4 November 2026

| ID | Decision | Option approved | Main consequence | ADR |
|---|---|---|---|---|
| PD-01 | Toolchain and CI | **A** — latest Node LTS line verified at Sprint 0 start (24 or 26), pnpm 10, latest stable Next.js, latest Zod major with version-agnostic contract tests, GitHub Actions with a Supabase CLI database job | Node line confirmed by reading the official release schedule at Sprint 0 start; private-repository Actions minutes beyond the free quota are billed | ADR-011 |
| PD-02 | Hosted environments | **A** — one staging and one production Supabase project in an EU region, newest available API key model | Two projects to provision and pay for; migrations tested on staging first | ADR-001 |
| PD-03 | Hosting | **A** — web app on Vercel, worker on a container host in the Supabase region | Two hosting vendors; the container host vendor is still to choose (PD-27) | ADR-001 |
| PD-04 | Status model | **A** — one status per product per workspace (`workspace_product_states`); collection items keep notes only | A product's status is the same in every collection | ADR-014 |
| PD-05 | Rating granularity | **A** — integer ratings 0–5 | Every score is an integer; WTP ≥ 10/15 ⇔ WTP rating ≥ 4 | ADR-005 |
| PD-06 | Verdict for complete scores 50–64 | **B** — VALIDATE FIRST, with band "Faible potentiel" displayed | Every complete score from 50 to 74 is VALIDATE FIRST; REJECT comes only from a score < 50 or a substantiated critical kill criterion | ADR-005 |
| PD-07 | Confidence and gates | **A** — formula of Implementation Blueprint §9.4, BUILD threshold 70, demand gate (rating ≥ 3, ≥ 2 distinct sources), differentiation gate (rating ≥ 3 + evidenced opportunity/competitor-gap finding), kill criterion substantiated by ≥ 1 verified evidence item at reliability ≤ 3 | BUILD CANDIDATE practically requires verified evidence | ADR-005 |
| PD-08 | AI providers and budgets | **A** — choose after a cost/quality benchmark on the evaluation fixtures; one provider + a fake provider for tests; **budget to be fixed after the benchmark** | The concrete provider, models, embedding model and budgets remain open: PD-24 | ADR-006 |
| PD-09 | Cluster scope | **A** — clusters, market gaps and generated opportunities per workspace; structured problems and embeddings global | Corrections stay local to a workspace | ADR-008 |
| PD-10 | Analysis subject model | **A** — typed nullable FKs + `analysis_subject_products` + one-shape check | As specified in M7 | ADR-009 |
| PD-11 | Exclusion boundary cases | **A** — employee sales-commission software and customer-referral-program software are **not excluded** unless their core purpose is affiliate/partner commissions or distribution | Rule R6 becomes an informational flag (`eligible`); R1–R5 unchanged | ADR-010 |
| PD-12 | Platform operator | **A** — the product owner only | The product owner handles exclusion reviews, correction reports and merges | ADR-007 |
| PD-13 | Sprint order | **A** — S4 Pain Point → S5 Opportunity → S6 Discovery → S7 hardening | AI Discovery arrives in S6; the catalog is fed by manual entry and CSV imports until then | ADR-012 |
| PD-14 | First third-party sources | **A** — add one review/community source only after a written terms review; **G2 is the first source to study** | Until G2 is approved (PD-26), the Pain Point Engine relies on declared CSV feedback imports | ADR-013 |
| PD-15 | UI language | **A** — French UI copy, PRD English navigation labels | | --- |
| PD-16 | MVP filters | **A + J** — groups A, B, C (HQ country), D, E, F, G, I, J, O in the MVP; H, K, L, M, N in Phase 2 | Company profile filters (founder-led, indie, independent…) ship in Sprint 2 | --- |
| PD-17 | Derived filters | **Indie SaaS A** — independent AND ≤ 20 employees AND not externally funded; **maturity A** — set only from evidence | The maturity filter will mostly show "Unknown" at first | --- |
| PD-18 | Report export formats | **A** — JSON + Markdown in the MVP; PDF later | | --- |
| PD-19 | Navigation placement | **A** — under "Opportunities": tabs Analyses / Clusters / Generated opportunities; Comparator from Saved and multi-select | The PRD's five navigation entries are unchanged | --- |
| PD-20 | FX source | **A** — European Central Bank daily reference rates | Currencies not covered by the ECB stay unconverted ("Unknown" for price bands) | --- |
| PD-21 | Experiment payments as WTP evidence (Phase 3) | **A** — yes, when backed by a proof document (invoice or payment record) | See ADR-005 for how such evidence is recorded | ADR-005 |
| PD-22 | AI evaluation thresholds | **A** — proposed from the first baseline run, approved per agent | Each agent needs a product-owner approval of its thresholds before shipping | ADR-006 |
| PD-23 | Workspace validation threshold (PRD §14.1) | **A** — a workspace may only raise the BUILD thresholds above 75 / 10, never lower them | | ADR-005 |

## Pending decision register

These questions were **not** settled by the 4 November arbitration. Each
must be approved before the point it blocks.

| ID | Decision | Recommendation | Blocks | ADR |
|---|---|---|---|---|
| PD-24 | Concrete AI provider, model per profile, embedding model, and AI budgets — the outcome of the PD-08 benchmark. **Method approved 5 Nov 2026:** split into **PD-24a** (generation provider for D5/D6 and later agents, model per profile, per-task budgets = measured p95 cost × 2) and **PD-24b** (embedding model, Sprint 4); candidates Anthropic, OpenAI, Mistral, one retained; matrix B (entry and mid tier at two effort levels, top tier once as a ceiling); 28 real frozen sites + 5 adversarial + 6 synthetic fixtures; quality gates first, then recall, cost, latency; benchmark spend capped at 30 USD; residency B (public web content any region; customer reviews need EU processing or zero retention). The monthly production ceiling is **not** fixed yet. Plan: `evals/benchmark/PLAN.md`. **Preflight decisions (5 Nov 2026):** reference configurations on 14 cases (11 synthetic/adversarial + Rewardful, FirstPromoter, GrowSurf); calibration gate at the start of stage 1 (forecast × 1.25 + largest call reservation must fit the 22 USD cap); output caps D5 16,000 / 24,000 and D6 8,000 / 12,000 tokens (without / with reasoning); GrowSurf expected `excluded`, `needs_review` accepted because it also keeps a product out of the catalog. **Stage 1 approved on 5 Nov 2026 (cap 22 USD); pending execution** (keys and network access missing) | Run the two-stage benchmark of `evals/benchmark/PLAN.md` after approval of each stage; then approve PD-24a with the PD-22 thresholds. **Prerequisites on the product-owner side:** API keys as environment secrets of the cloud environment and network access to `api.openai.com` and `api.mistral.ai` | Sprint 3 **exit gate** (PD-24a: D5/D6 on a real provider); Sprint 4 (PD-24b: embedding model) | ADR-006 |
| PD-25 | Should low confidence turn a complete score < 50 into VALIDATE FIRST? (sub-question of PD-06, not answered) | No exception | Nothing: until decided, the ACCEPTED rule "score < 50 → REJECT" (PRD §8.8) applies | ADR-005 |
| PD-26 | Approve G2 as the first review source after its written terms review (access method, licence, cost, storage rights) | Decide on the written review, which is prepared before Sprint 4 | Use of G2 in Sprint 4 (Sprint 4 can run on CSV feedback imports) | ADR-013 |
| PD-27 | Container host vendor and plan for the worker (PD-03 approved the split, not the vendor) | Choose a host with an EU region next to the Supabase project, persistent processes and health checks | Sprint 7 (deployment) | ADR-001 |
| PD-28 | Search source(s) for the Discovery Engine (after terms review) | Same method as PD-14: one source after a written terms review | Sprint 6 | ADR-013 |

## What may start now

No decision blocks Sprint 0, Sprint 1 or Sprint 2 any more. **Sprint 0
still requires the product owner's explicit go-ahead.**
