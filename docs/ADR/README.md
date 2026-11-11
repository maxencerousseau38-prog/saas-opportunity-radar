# Architecture Decision Records

**Last updated:** 11 November 2026 (PD-36 and PD-37 approved for S8.3); 6 November 2026 (PD-28 approved); 4 November 2026 (product-owner arbitration of PD-01 to PD-23)

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
| [ADR-001](ADR-001-modular-monolith-and-worker.md) | Modular monolith with a persistent worker; hosting | ACCEPTED (PD-02, PD-03, PD-27) |
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
| [ADR-013](ADR-013-source-acquisition-and-compliance.md) | Source acquisition and compliance | ACCEPTED (PD-14, PD-28); G2 and Product Hunt approval PENDING (PD-26, PD-29) |
| [ADR-014](ADR-014-workspace-status-model.md) | Workspace opportunity status model | ACCEPTED (PD-04) |
| [ADR-015](ADR-015-manual-external-ai-research-handoff.md) | Manual external AI research handoff | ACCEPTED (PD-35) |\n| [ADR-016](ADR-016-product-visual-assets-and-heroes.md) | Product visual assets and Discover Heroes | ACCEPTED (PD-36) |\n| [ADR-017](ADR-017-acquisition-channel-taxonomy.md) | Acquisition Channel taxonomy and evidence | ACCEPTED (PD-37) |

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

## Sprint 4 start (5 November 2026)

The product owner deferred the paid PD-24a benchmark and authorised Sprint 4
(Pain Point Intelligence Engine, Implementation Blueprint §15 — option A of
the Sprint 4 plan) **while the Sprint 3 exit gate stays pending**. Sprint 4
uses only simulated providers (fake LLM handlers and a deterministic fake
embedder); no paid call and no production change. Its exit gate stays
pending PD-24a/PD-24b and the PD-22 thresholds. G2 is not used (PD-26
pending): feedback comes from declared CSV imports.

## Sprint 5 start (5 November 2026)

The product owner authorised Sprint 5 (Opportunity Engine, Implementation
Blueprint §15) with simulated providers only, no paid call, no spending and
no production change, and approved the three choices of the sprint plan:
(1) an analysis indexes existing catalog and feedback evidence only — no new
market evidence is collected during an analysis until search sources exist
(PD-28); (2) comparison analyses (§8.11) stay in Phase 2; (3) the analysis
depth is stored and drives budgets and caps, never the scoring rules. The
quality of the real agents stays pending PD-24a and the PD-22 thresholds.

## Sprint 6 start (6 November 2026)

The product owner approved **PD-28** after the source analysis of the
Sprint 6 plan (written review: `docs/DATA_SOURCES.md`):

- **Hacker News, official API only** (`hacker-news.firebaseio.com`), as
  the first Discovery search source. The Algolia-hosted HN search is not
  approved. Metadata only (no usernames, no user text).
- **Product CSV import** (existing) as a discovery seed list.
- **Rebound from official websites, under control**: pages of catalogued
  products' own sites (integrations, alternatives, comparisons) give
  leads; depth 1, allow-listed paths, robots.txt, per-run budgets, and a
  lead becomes a candidate only from its own official site
  (`docs/DATA_SOURCES.md`, "Discovery rebound — controls").
- **Product Hunt:** a permission request is drafted
  (`docs/sources/product-hunt-permission-request.md`) and **not sent**;
  approval is PD-29.
- **Brave Search:** deferred, **no spending**.
- Network may be opened **only to read official terms pages**, never for
  API calls. No source is enabled in production.

Slices S6.0 (terms review) and S6.1 (contracts and fit score) are
authorised. Activating `hacker_news` anywhere still requires reading the
Y Combinator site terms (blocked by the network policy on 6 November 2026)
and a product-owner go-ahead. The quality of the real agents (D1, D3)
stays pending PD-24a and the PD-22 thresholds.

## Sprint 6 status (6 November 2026)

Sprint 6 (Discovery Engine) is implemented with simulated providers only
(Implementation Blueprint §15 "Sprint 6"). No source was enabled and no
paid call was made. Hacker News (official API) is registered `planned`
and disabled: enabling it needs the Y Combinator terms review (page
blocked by the cloud network policy on 6 Nov 2026) and a product-owner
go-ahead per environment. Product Hunt waits for PD-29. Real-use quality
of D1/D3 waits for PD-24a and the PD-22 thresholds.

## PD-27 approved (6 November 2026)

The product owner approved **PD-27: Render Background Worker in Frankfurt**
(analysis: [`PD-27-worker-host-analysis.md`](PD-27-worker-host-analysis.md)).
Sprint 7 development may start; **no deployment, no paid service and no
spending without a further explicit approval**. Consequence for PD-02: the
Supabase staging and production projects should be created in Frankfurt
(`eu-central-1`) when the product owner creates them; no hosted Supabase
project is linked to the repository yet (checked 6 Nov 2026).

## Sprint 7 status (6 November 2026)

S7.1 (worker deployability) and S7.2 (job quotas and rate limits) are
validated by CI; S7.3 (monitoring, alerts, cost tracking) is implemented
without any external monitoring service. Nothing is deployed and nothing
was spent. The daily job quota per workspace (200) and the alert thresholds
(`ops_*` platform limits, e.g. 5 USD of AI cost per day) are [ASSUMPTION]
starting values, not product decisions; per-workspace AI cost caps wait for
the PD-24 budgets.

## S7.4 security decisions (7 November 2026)

After the read-only security and RLS review (`docs/SECURITY_REVIEW.md`), the
product owner approved:

- **PD-30 — Operator MFA (approved):** the operator console and the
  operator API require an MFA-verified session (AAL2, TOTP). Holder: the
  product owner only (PD-12 A).
- **PD-31 — Password policy (approved):** at least 12 characters with
  letters and digits, in every environment.
- **PD-32 — Migration order (approved):** existing migration names are
  kept; CI enforces strictly increasing, forward-only migrations (the next
  timestamp is the later of the current UTC time and the last one plus one
  day).
- **PD-33 — Content Security Policy rollout (approved):** Report-Only
  first, validated by the E2E suite, then enforced.
- **Secret scanning in CI (approved):** gitleaks over the whole history on
  every push.

Implemented in S7.4a–e (all validated by CI): privilege manifest, CI
security job, security headers and enforced CSP, action rate limits,
password policy, operator MFA.

No deployment and no paid service.

## Product completion V1 — external AI handoff (8 November 2026)

The product owner authorized a no-API manual research workflow in the
attached “Master Product Completion V1” instruction. **PD-35** records this
as a separate path from the internal AI gateway: users choose a destination,
preview and copy a bounded prompt, open the assistant themselves, and
optionally import its answer as an unverified workspace note. It does not
resolve or alter PD-24, call a provider, or turn imported text into evidence.
The current implementation covers catalog products and product sets only;
custom strategies and cluster/opportunity context remain outstanding.

| ID | Decision | Option approved | Main consequence | ADR |
|---|---|---|---|---|
| PD-35 | Ask AI without an application API key | **Manual handoff** — preview and copy a bounded prompt, open the assistant, paste it manually, and optionally import its response as an unverified workspace note | No provider call; imported content never becomes catalog evidence or engine input | ADR-015 |

## S7.5 failure-mode and load tests (7 November 2026)

Approved by the product owner:

- **Reproducible simulations only**, on the local Supabase stack in CI; no
  deployment, no spending. Correctness (no lost job, no duplicated step or
  evidence, isolation, quotas) is **always blocking**; performance
  thresholds block only **major regressions** (generous limits), measured
  numbers are kept as CI artifacts.
- **Real PostgreSQL restart** in CI for the database-outage scenario.
- **Catalog benchmarks at 2,000, 10,000 and 50,000 products** (synthetic,
  labelled, test database only).
- The design must keep the way open for large catalog sources:
  **Hugging Face (~260K products) and Enlisted (10K+)**, to be integrated
  only after their licences and data quality are verified (PD-34 below).

## First bulk catalog collection (10 November 2026)

Instruction of the product owner (10 Nov 2026): build the system that feeds
the library and the Discover feed with real SaaS collected massively from
the best catalog libraries, after checking their access and terms, without
unauthorized scraping; implement the first working connector and prepare
the next ones; import real SaaS; normalize, categorize, deduplicate while
keeping the original sources. Decisions taken under that instruction (terms
review: `docs/DATA_SOURCES.md`, official pages frozen in `docs/sources/terms`):

- **Wikidata** (CC0, public query service) is the first catalog source,
  integrated and enabled (migration `20261116090001_catalog_sources`).
  Collection runs on GitHub runners (Catalog collection workflow) and is
  committed as a snapshot; ingestion goes through identity resolution, the
  permanent exclusion classifier, the deterministic category mapping
  `catmap-1` and declared evidence with field provenance.
- **Product Hunt**: connector prepared, source registered `planned` and
  disabled. Its API terms allow only non-commercial use and require a token
  the product owner creates; enabling it is a product-owner action (token
  as a repository secret, then a migration). PD-29 remains for commercial use.
- **Uneed** (official free read-only API, "the legitimate alternative to
  scraping") is the second catalog source, integrated and enabled
  (migration `20261117090001_uneed_source`), metadata only with
  attribution; no data licence is stated, so it is disabled at once if Uneed
  objects.
- **Microlaunch, BetaList, Y Combinator directory**: not retained (their
  terms prohibit copying). **SaaSHub**: later (account key, CC BY-SA).
- **Taxonomy**: seven top-level categories added (Communication &
  Collaboration, Productivity, Design & Creative, HR & Recruiting, Education
  & Learning, Security & IT, Industry & Vertical Software) under PRD §4.2.E ("Pouvoir créer de nouvelles
  catégories") and §24.1 (global catalog, no sectoral restriction).
- Loading the snapshot into a **hosted** database is not done by Claude: it
  needs the product owner's go-ahead per environment and the hosted
  project's migrations (`docs/DEPLOYMENT.md` §9).

## S8.3 launch (11 November 2026)

The product owner authorized the start of **S8.3 — Discover V2 Completion** from `main` at `87e801f`, after S8.2 was merged and CI #137 passed. Work proceeds on a dedicated branch; no direct commits to `main`.

The product owner approved the two policy directions recorded in:
- **PD-36 / ADR-016:** authentic static product visuals only; rights must cover the selected delivery method; no synthetic screenshot, no private/authenticated capture, and no display of unknown or restricted assets.
- **PD-37 / ADR-017:** retain the eight existing Acquisition Channel categories; normalize canonical channel keys; preserve `confirmed`, `declared`, `estimated`, `unknown`; primary-channel claims need evidence; confidence must be distinct and justified.

The implementation sequence and acceptance gates are recorded in `docs/sprints/S8.3-DISCOVER-V2.md`. The exact asset ingestion/delivery implementation must still respect the rights attached to each source; this decision does not authorize a new connector, scraping source, paid API, budget, or deployment. PD-34 remains a separate gate for Hugging Face and Enlisted.

| ID | Decision | Approved direction | Main consequence | ADR |
|---|---|---|---|---|
| PD-36 | Product visual assets and Discover Heroes | Static authentic official Heroes, screenshots or illustrations only; rights must explicitly cover storage or remote embedding; unapproved assets stay hidden | Evidence-linked, rights-aware asset pipeline with honest fallback | ADR-016 |
| PD-37 | Acquisition Channel taxonomy and evidence | Keep eight existing categories; canonical channel keys; evidence-based status and primary role; explainable confidence | Normalize data and filters without fabricating channel coverage | ADR-017 |

---

## Pending decision register

These questions were **not** settled by the 4 November arbitration. Each
must be approved before the point it blocks.

| ID | Decision | Recommendation | Blocks | ADR |
|---|---|---|---|---|
| PD-24 | Concrete AI provider, model per profile, embedding model, and AI budgets — the outcome of the PD-08 benchmark. **Method approved 5 Nov 2026:** split into **PD-24a** (generation provider for D5/D6 and later agents, model per profile, per-task budgets = measured p95 cost × 2) and **PD-24b** (embedding model, Sprint 4); candidates Anthropic, OpenAI, Mistral, one retained; matrix B (entry and mid tier at two effort levels, top tier once as a ceiling); 28 real frozen sites + 5 adversarial + 6 synthetic fixtures; quality gates first, then recall, cost, latency; benchmark spend capped at 30 USD; residency B (public web content any region; customer reviews need EU processing or zero retention). The monthly production ceiling is **not** fixed yet. Plan: `evals/benchmark/PLAN.md`. **Preflight decisions (5 Nov 2026):** reference configurations on 14 cases (11 synthetic/adversarial + Rewardful, FirstPromoter, GrowSurf); calibration gate at the start of stage 1 (forecast × 1.25 + largest call reservation must fit the 22 USD cap); output caps D5 16,000 / 24,000 and D6 8,000 / 12,000 tokens (without / with reasoning); GrowSurf expected `excluded`, `needs_review` accepted because it also keeps a product out of the catalog. **Stage 1 approved on 5 Nov 2026 (cap 22 USD); pending execution** (keys and network access missing) | Run the two-stage benchmark of `evals/benchmark/PLAN.md` after approval of each stage; then approve PD-24a with the PD-22 thresholds. **Prerequisites on the product-owner side:** API keys as environment secrets of the cloud environment and network access to `api.openai.com` and `api.mistral.ai` | Sprint 3 **exit gate** (PD-24a: D5/D6 on a real provider); Sprint 4 (PD-24b: embedding model) | ADR-006 |
| PD-25 | Should low confidence turn a complete score < 50 into VALIDATE FIRST? (sub-question of PD-06, not answered) | No exception | Nothing: until decided, the ACCEPTED rule "score < 50 → REJECT" (PRD §8.8) applies | ADR-005 |
| PD-26 | Approve G2 as the first review source after its written terms review (access method, licence, cost, storage rights) | Decide on the written review, which is prepared before Sprint 4 | Use of G2 in Sprint 4 (Sprint 4 can run on CSV feedback imports) | ADR-013 |
| PD-29 | Product Hunt as the second Discovery source | Decide after Product Hunt's written answer to the permission request (draft not sent) and its terms review | Any Product Hunt connector | ADR-013 |
| PD-34 | Bulk catalog sources: a Hugging Face dataset (~260K products) and Enlisted (10K+), named by the product owner on 7 Nov 2026 | Written review first (exact dataset / provider, licence and reuse rights, storage rights, update cadence, field quality on a sample, overlap and identity matching, exclusion classifier on a sample); then an import plan through the existing CSV/import pipeline with identity resolution and provenance | Any import from these sources | ADR-013 |

## What may start now

No decision blocks Sprint 0, Sprint 1 or Sprint 2 any more. **Sprint 0
still requires the product owner's explicit go-ahead.**
