# SAAS OPPORTUNITY RADAR

## Technical Blueprint v1.0

**Date:** 4 November 2026
**Status:** Reference architecture. Created during the documentation consolidation phase because no Technical Blueprint existed in the repository (see ADR-000).
**Derived from:** `docs/PRODUCT_REQUIREMENTS.md` v1.1 (functional reference), `CLAUDE.md`, `docs/IMPLEMENTATION_BLUEPRINT.md` v1.0, and the repository audit of 4 November 2026.
**Companion documents:** `docs/IMPLEMENTATION_BLUEPRINT.md` (implementable specifications), `docs/ADR/` (decisions), `CLAUDE.md` (permanent engineering rules).

---

## 0. How to read this document

### 0.1 Document precedence

| Concern | Reference document |
|---|---|
| What the product must do (features, UX, data to collect, scoring method, MVP scope) | `docs/PRODUCT_REQUIREMENTS.md` |
| How the system is structured (components, boundaries, flows, security, infrastructure) | `docs/TECHNICAL_BLUEPRINT.md` (this document) |
| What exactly to build (SQL, contracts, agents, API, jobs, tests, sprints) | `docs/IMPLEMENTATION_BLUEPRINT.md` |
| How to work in the repository (permanent rules, workflow) | `CLAUDE.md` |
| Why a choice was made and whether it is approved | `docs/ADR/` |

If two documents disagree on a functional requirement, the Product Requirements win (ADR-000). A technical document must never weaken a product requirement to fit an implementation.

### 0.2 Decision status legend

Every architectural decision in this document carries one of these statuses:

- **ACCEPTED** — traceable to an approved source (Product Requirements, `CLAUDE.md`, an explicit product-owner instruction). The source is cited.
- **PENDING_USER_APPROVAL** — a recommendation that has not been approved by the product owner. It must not be implemented before approval. Each pending decision has an identifier `PD-xx` registered in `docs/ADR/README.md`, with the sprint it blocks.

Detailed specifications in the Implementation Blueprint that merely enforce an ACCEPTED rule (for example, fixing an RLS policy so that a viewer cannot delete data) are not separate decisions; they are corrections required by the accepted rule.

### 0.3 Assumptions

Assumptions are marked **[ASSUMPTION]** in the text and listed in §19.

---

## 1. Context and goals

SaaS Opportunity Radar is a private, evidence-first research platform (Product Requirements §1). It discovers existing SaaS products, enriches their profiles with traceable evidence, detects customer problems within and across competitors, and evaluates the commercial potential of opportunity hypotheses with a deterministic score, a separate confidence level and a gated verdict.

### 1.1 Quality attributes (in priority order)

1. **Truthfulness and traceability** — no fabricated company, price, revenue, customer, review or link (PRD §16). Every material factual claim traces to a source snapshot.
2. **Security and isolation** — workspace data is private; catalog and operational writes are server-only; permanent exclusions cannot be bypassed.
3. **Reliability** — long-running work is asynchronous, idempotent, restartable and budget-bounded; failures produce partial results, never invented substitutes.
4. **Cost control** — every AI and external call is budgeted, metered and attributable.
5. **Maintainability and simplicity** — a modular monolith with one worker; no microservices; deterministic domain logic separated from AI.
6. **User experience** — fast browsing of hundreds of products, explicit unknown/partial/stale states (PRD §17).

### 1.2 Users and tenancy

- Initial user: a founder/entrepreneur (PRD §21). Public signup is out of scope (Implementation Blueprint §0 "Explicitly deferred"). **ACCEPTED.**
- Tenancy model: workspaces with roles `owner`, `admin`, `member`, `viewer` (`CLAUDE.md` §7). **ACCEPTED.**
- A **platform operator** role exists outside workspaces to curate the global catalog (resolve exclusion reviews, correction reports, identity merges). Need: the global catalog is shared and server-written, but PRD §16.14 requires that incorrect information can be corrected and `CLAUDE.md` §3 requires ambiguous exclusions to be reviewed. Who holds the role: the product owner only (**ACCEPTED**, PD-12 A).

---

## 2. Architecture overview

**ACCEPTED** (ADR-001; `CLAUDE.md` §5; Implementation Blueprint §0): modular monolith in a pnpm/Turborepo monorepo, one Next.js web application, one persistent Node.js worker, Supabase (PostgreSQL, Auth, Storage, Queues/PGMQ), provider-neutral AI gateway.

```text
                ┌──────────────────────────────────────────────┐
 Browser ──────▶│ apps/web (Next.js App Router)                │
 (UI only,      │  • UI (Tailwind, shadcn/ui, Radix)           │
  Supabase Auth │  • /api/v1 route handlers (thin)             │
  session)      │  • services: auth → authorize → validate →   │
                │    domain → repository → DTO                 │
                └───────┬───────────────────────┬──────────────┘
                        │ user-JWT client       │ server client (secret key)
                        │ (RLS enforced)        │ + RPC (job creation)
                        ▼                       ▼
                ┌──────────────────────────────────────────────┐
                │ Supabase                                     │
                │  • PostgreSQL: public (RLS) / private        │
                │  • PGMQ queue `sor_jobs`                     │
                │  • Auth (signup disabled)                    │
                │  • Storage: private buckets                  │
                │  • Cron (enqueue-only schedules, Phase 2)    │
                └───────▲──────────────────────────────────────┘
                        │ server client + RPC (claim/lease/ack)
                ┌───────┴──────────────────────────────────────┐
                │ apps/worker (persistent Node.js process)     │
                │  • queue consumer, leases, heartbeats        │
                │  • job handlers → engines                    │
                │  • Discovery / Pain Point / Opportunity      │
                │  • data-sources (safe fetcher, connectors)   │
                │  • ai-gateway (providers, budgets, metering) │
                └───────┬───────────────────────┬──────────────┘
                        ▼                       ▼
                 External sources         AI providers
                 (authorized only)        (structured output, embeddings)
```

Hard rules (**ACCEPTED**, `CLAUDE.md` §11, PRD §22):

- No LLM analysis runs in a Next.js request handler, Edge Function or database cron job. Route handlers create jobs and return `202 Accepted`.
- Scheduled jobs only enqueue work.
- The browser never receives the Supabase secret/service key or any AI provider key.

---

## 3. Components and responsibilities

| Component | Responsibility | Must not |
|---|---|---|
| `apps/web` | UI, authenticated `/api/v1` route handlers, DTO mapping, request validation, rate limiting, idempotency key handling | Run AI calls or long work; contain business rules beyond orchestration of services |
| `apps/worker` | Queue consumption, job leases and heartbeats, dependency injection, running engine orchestrators, persisting step artifacts | Expose HTTP endpoints to the public; read secrets from the browser path |
| `packages/contracts` | Canonical Zod schemas and inferred types for API, jobs, agent inputs/outputs | Import database clients, providers or network code |
| `packages/domain` | Deterministic rules: URL/domain normalization, identity matching rules, permanent exclusion classifier, filter semantics, fit score, scoring, confidence, verdict gates, retry classification, budgets | Perform I/O, import Supabase or AI SDKs |
| `packages/database` | Supabase clients (user-JWT and server), generated types, repositories, RPC wrappers | Contain business rules |
| `packages/data-sources` | Source connector interface, safe fetcher (SSRF defences), connectors, CSV import parsers | Write to catalog tables directly |
| `packages/ai-gateway` | Provider adapters, model profiles, structured output + Zod validation, embeddings, cost/latency metering, budget enforcement, fallback rules | Decide scores, verdicts or exclusions |
| `packages/discovery-engine` | Discovery orchestration and agents D1–D7 | Compute opportunity scores |
| `packages/pain-point-engine` | Pain Point Intelligence orchestration, deterministic clustering and agents P1–P9 | Compute opportunity scores |
| `packages/opportunity-engine` | Opportunity analysis orchestration, agents O1–O9, scoring input preparation, report composition | Write the final verdict without the domain scoring engine |

Package boundaries are **ACCEPTED** from `CLAUDE.md` §5 and Implementation Blueprint v1.0 §1; `packages/pain-point-engine` is added because the Pain Point Intelligence Engine is a locked product decision (PRD §15, §21; ADR-008).

---

## 4. The three engines

**ACCEPTED** (PRD §15, §21 — "Il faut impérativement séparer les trois moteurs"). The engines share sources, database, deduplication, search, evidence, execution journal and quality control (PRD §15 "Composants partagés"), but never share mutable in-memory state; they communicate only through persisted, versioned artifacts.

### 4.1 Responsibilities and outputs

| Engine | Input | Output (persisted) | Never produces |
|---|---|---|---|
| **Discovery Engine** | Natural-language request + explicit filters (PRD §6) | `discovery_runs`, `discovery_candidates`, catalog products in `candidate` state, source snapshots, evidence, deterministic fit score, evidence confidence | Opportunity score |
| **Pain Point Intelligence Engine** | A scope: one product, a set of competing products, or a category (PRD §7.3 Phase D, §15) | Structured problems per feedback, embeddings, workspace-scoped Pain Point Clusters with evidence, cross-competitor statistics, market gaps, generated opportunity hypotheses (unscored) | Opportunity score, verdict |
| **Opportunity Engine** | An analysis subject: product, product set, category, Pain Point Cluster, or generated opportunity (PRD §7.2) | `opportunity_analyses` with six dimension assessments, deterministic score, WTP, confidence, verdict, findings, evidence index and structured report | Catalog facts (it reads them; enrichment requests go through jobs) |

### 4.2 How the engines connect

```text
 Discovery Engine ──▶ catalog (candidate → active products, evidence)
        │
        ▼
 Catalog + customer_feedback (global, evidence-backed)
        │
        ▼
 Pain Point Engine ──▶ feedback_problems (global, derived)
        │             └▶ pain_point_clusters / generated_opportunities (workspace)
        ▼
 Opportunity Engine ◀── subject = product | product_set | category | cluster | generated_opportunity
        │
        ▼
 Deterministic scoring (packages/domain) ──▶ score, coverage, WTP, confidence, verdict
```

- The Opportunity Engine's Customer Voice Analyst (O3) reuses the Pain Point Engine's structured problems and clusters for the subject's products instead of re-extracting them.
- Generated opportunities are hypotheses. They are scored only when the user runs an Opportunity analysis on them (PRD §8.10: the /100 score applies to a specific opportunity hypothesis).
- Two distinct scores exist and are never mixed (PRD §8.10, `CLAUDE.md` §8): **SaaS Fit Score** (Discovery, deterministic match to filters) and **Opportunity Score** (Opportunity Engine). Evidence confidence is a third, separate metric.

---

## 5. Data architecture

### 5.1 Data domains

| Domain | Scope | Writers | Readers |
|---|---|---|---|
| Catalog & evidence (companies, products, identifiers, categories, sources, snapshots, evidence, provenance, features, integrations, pricing, signals, feedback, competitor links, exclusion assessments) | Global | Server only | Authenticated users, restricted by RLS to `active` and `eligible` products |
| Derived problem data (feedback problems, embeddings) | Global | Server only | Server; exposed to users only through workspace clusters and API DTOs |
| Workspace data (workspaces, members, settings, collections, saved searches, product states, tags, correction reports) | Workspace | Users per role (RLS) and server | Workspace members |
| Workspace intelligence (discovery runs/candidates, pain point runs/clusters/market gaps, generated opportunities, analyses, scores, findings, validation experiments) | Workspace | Server (results); users only create requests via the API and edit user-owned fields (status, notes, cluster corrections) | Workspace members |
| Platform & operations (operators, jobs, agent steps, provider usage, audit logs, rate limits, platform limits, exclusion rules) | Platform | Server only | Server only |

**ACCEPTED** basis: `CLAUDE.md` §6 (global catalogue, workspace-owned data, operational data). Pain Point Clusters being **workspace-scoped** (rather than global) is **ACCEPTED** (PD-09 A), because clusters can be corrected by users (PRD §7.3.D.B "Chaque cluster doit pouvoir être réexaminé et corrigé") and one workspace's corrections must not alter another's research.

### 5.2 Evidence model

**ACCEPTED** (ADR-003; `CLAUDE.md` §4.1; PRD §5.10, §12.7, §13.2, §16):

```text
 sources (connector registry, terms, quotas, status)
   └─ source_records (one logical document: source + canonical URL)
        └─ source_snapshots (one retrieval: content hash, retrieved_at, HTTP status, storage status)
             └─ evidence_items (one claim: claim type, value, fact status, reliability, verification)
                  ├─ catalog_field_provenance (which evidence backs each displayed field)
                  ├─ evidence_conflicts (contradictions kept, never overwritten)
                  ├─ customer_feedback (a review/discussion is itself an evidence item)
                  └─ analysis_evidence (evidence index of one analysis)
                        ├─ dimension_score_evidence
                        └─ finding_evidence
```

Rules:

- Re-fetching a document creates a new snapshot when the content hash changes; history is never overwritten.
- Each evidence item records both a **fact status** — `confirmed`, `estimated`, `declared`, `unknown` (PRD §5.10, §16.20) — and a **verification status** — `unverified`, `verified`, `needs_review`, `rejected`, `stale` (workflow). They answer different questions and are never merged.
- Reliability levels 1–4 follow PRD §13.2. Reliability is assessed per claim type: a level-3 community post can support a frustration but never a payment (PRD §13.2).
- Unknown values are `null` or an explicit unknown state; missing evidence never becomes a negative fact (`CLAUDE.md` §4.1).
- Original review text is stored only when the source terms permit it (`content_storage_status`; PRD §12.5).
- Every citation in an analysis must belong to that analysis' evidence index, and every evidence index entry must be in the analysis scope (database trigger + server validation; `CLAUDE.md` §6 integrity).

### 5.3 Product identity

**ACCEPTED** (ADR-002; `CLAUDE.md` §6; Implementation Blueprint v1.0 §6.5):

- Company and product are separate entities; a company may own several products.
- Identity keys, in order: canonical product URL → source-specific external identifier → registrable domain only when it maps to exactly one known product and is not a shared-hosting/marketplace domain → company/product relationship. Name similarity is a review signal only, never an automatic merge.
- Identifiers (domains, canonical URLs, external IDs, aliases) are kept in `entity_identifiers` with validity periods, so renames, domain changes and acquisitions preserve history. Merges set `record_status = 'merged'` and `merged_into_product_id`; nothing is deleted.
- Correction from v1.0: `saas_products.normalized_domain` is no longer globally unique (it blocked several products of one company on one domain).

### 5.4 Product lifecycle and visibility

`record_status`: `candidate` → `active` | `needs_review` | `archived` | `merged` (PRD §12.1 `record_status`).
`exclusion_status`: `unassessed` | `eligible` | `excluded` | `needs_review`.

A product is visible in Discover and analysable only when `record_status = 'active'` and `exclusion_status = 'eligible'`. Candidates are visible only to the workspace whose discovery run found them, through the API.

### 5.5 Analysis subjects

**ACCEPTED requirement** (PRD §7.2, §12.8: analyses may start from a product, a market category, a set of competitors, a Pain Point Cluster or a cross-cutting problem). Recommended model — typed nullable foreign keys plus a subject-product table, with a check constraint guaranteeing exactly one subject shape — is **ACCEPTED** (PD-10 A, ADR-009).

| `subject_type` | Subject reference | Scope products (for evidence) |
|---|---|---|
| `product` | `subject_product_id` | the product + its linked competitors |
| `product_set` | `analysis_subject_products` (2–10 products) | the set + their competitors |
| `category` | `subject_category_id` | eligible active products of the category at analysis time (snapshot) |
| `pain_point_cluster` | `subject_cluster_id` | products affected by the cluster |
| `generated_opportunity` | `subject_generated_opportunity_id` | source products + listed competitors of the opportunity |

The subject's scope is frozen into `analysis_subject_products` when the analysis is created, so a later catalog change does not alter a completed analysis.

---

## 6. Scoring and verdict architecture

**ACCEPTED** (ADR-005; PRD §8; `CLAUDE.md` §10):

- Six dimensions with weights 20/15/20/15/15/15, each rated 0–5; `weighted_points = rating / 5 × weight`.
- The server computes all scores in `packages/domain`. AI agents only **propose** dimension assessments with evidence references; the server validates them.
- A dimension with insufficient evidence is not assessed and does not count as zero (PRD §8.9).
- A final score exists only when all six dimensions are assessed. Otherwise the system shows provisional points with explicit coverage (sum of assessed weights) and never normalises them to /100.
- WTP is the willingness-to-pay dimension expressed on 0–15 (`rating × 3`), derived from that same dimension (single source).
- Confidence is a separate metric computed deterministically from evidence quality.
- BUILD CANDIDATE requires: complete score ≥ 75; WTP ≥ 10/15; adequate confidence; sufficient demand evidence; concrete differentiation; no substantiated critical kill criterion; and credible evidence of paying customers (PRD §21 "Signes crédibles de clients payants obligatoires pour valider une opportunité"; a pricing page alone is not enough, `CLAUDE.md` §4.1).
- A substantiated critical kill criterion forces REJECT regardless of the score.
- The Red-Team result can only make the verdict stricter, never more lenient.
- The PRD decision bands (0–49 reject, 50–64 low potential, 65–74 to investigate, 75–84 interesting, 85–100 priority; PRD §8.8) are always displayed next to the verdict.

**ACCEPTED** on 4 November 2026: integer ratings (PD-05 A); VALIDATE FIRST for complete scores of 50–64, with the band "Faible potentiel" (PD-06 B); the confidence formula, BUILD confidence threshold 70 and the demand, differentiation and kill-substantiation definitions (PD-07 A); workspaces may only raise the BUILD thresholds (PD-23 A). Still **PENDING_USER_APPROVAL**: a possible low-confidence exception to "score < 50 → REJECT" (PD-25, non-blocking). The complete decision table is in Implementation Blueprint §9.6.

---

## 7. Permanent Affiliate / Partner exclusion

**ACCEPTED** (ADR-010; PRD §1.3, §4.2.O, §21; `CLAUDE.md` §3): Affiliate, Partner and closely related business models are permanently excluded from discovery and recommendations. The rule is deterministic application code, not a prompt instruction, and no user input can disable it.

### 7.1 Design

- The rule set lives in `packages/domain/src/exclusion` (versioned constant) and is mirrored in the server-only `exclusion_rules` table for audit. Changing it requires a code change, a migration and an ADR update. No API, setting, saved search or prompt field can modify it.
- The classifier evaluates a product's **core purpose** (primary categories, name, tagline, LLM-proposed primary use case — the extraction, enrichment and opportunity-generation agents emit a `core_purpose_flag`) separately from **secondary mentions** (description, features). Outcomes:
  - core-purpose match → `excluded`;
  - ambiguous description-level match, or an LLM proposal that the core purpose is affiliate/partner → `needs_review`;
  - feature-level mention only (for example, a CRM with a referral feature) → `eligible` with an `incidental_mention` flag (`CLAUDE.md` §3: do not reject a general-purpose product for an incidental feature).
- An LLM may escalate a product to `needs_review`; it can never make a product `eligible`.
- `needs_review` blocks the product from Discover, ranking, analysis and recommendations until a platform operator resolves it (audit-logged). The operator cannot mark a product eligible while one of its primary categories is an excluded category.
- Boundary cases — sales-commission software for employees (PRD §1.3 lists "Commission management" without "lié aux partenaires") and customer-referral-program software — are **not excluded** unless their core purpose is affiliate/partner commissions or distribution (**ACCEPTED**, PD-11 A). They carry an informational boundary flag.

### 7.2 Enforcement points

| Boundary | Enforcement |
|---|---|
| Discovery query planning | Server appends permanent exclusions; planner output is validated; queries targeting excluded themes are dropped |
| Candidate extraction / enrichment | Classifier runs on every candidate and re-runs whenever core-purpose data changes |
| Identity resolution | A candidate matched to an excluded product stays excluded |
| Ranking | Only `eligible` candidates are ranked or recommended |
| Catalog API and RLS | Only `eligible` + `active` products are readable by users |
| Manual add / CSV import | Classifier runs before activation |
| Pain Point runs | Feedback of non-eligible products is ignored; scope requests containing them are rejected |
| Generated opportunities | Each hypothesis is classified; excluded hypotheses are discarded and logged |
| Opportunity analysis and pain point run creation | Rejected with `EXCLUDED_SUBJECT` if any scope product or the hypothesis is not eligible, or if a category subject is permanently excluded or not user-visible; empty scopes are rejected |
| Competitor analysis and reports | Non-eligible products are omitted; the report states how many were omitted |
| Report recommendations | The Recommended Product, Opportunity Map entries, `opportunity` findings and uncatalogued competitors are classified; excluded items are removed; an excluded or under-review Recommended Product blocks BUILD CANDIDATE |
| Saved searches / settings | Configurable exclusions (PRD §4.2.O "Exclusions configurables") are stored separately and cannot contain or remove permanent exclusions |

---

## 8. Job and worker architecture

**ACCEPTED** (ADR-004; `CLAUDE.md` §11; Implementation Blueprint v1.0 §10), subject to the PGMQ verification gate in Sprint 3:

- Queue: one durable PGMQ queue `sor_jobs` (underscore, to avoid relying on hyphen support in queue names **[ASSUMPTION]**).
- `job_executions` is the source of truth for job state; the queue message only carries `job_execution_id`, `kind` and `schema_version`.
- Job creation is atomic: one SECURITY DEFINER SQL function, executable only by the server role, inserts the job row, the domain row (run/analysis) and sends the queue message in one transaction, enforcing idempotency per `(workspace, requester, kind, idempotency key)` with a request hash (same key + same payload → original job; same key + different payload → `409`).
- Worker loop: read with a visibility timeout sized to a heartbeat cycle → claim lease in `job_executions` → run durable steps, persisting each agent step keyed by `(job_execution_id, agent_key, step_key)` → heartbeat and extend visibility → archive the message only at a terminal state.
- Retries: transient errors (timeouts, 429, 5xx, provider overload) retry with exponential backoff and jitter up to `max_attempts`; permanent errors (validation, 4xx except 408/429, budget exhausted, excluded subject) never retry. Exhausted retries → `dead_letter` with preserved error details.
- Redelivery after a crash replays only incomplete steps (completed steps are loaded by idempotency key).
- Cancellation sets `cancel_requested_at`; the worker checks it between steps and through `AbortSignal`; partial artifacts are preserved and the terminal reason is recorded.
- Every job has a terminal reason: `completed`, `partial`, `failed`, `cancelled`, `dead_letter`, `budget_exhausted`.
- If PGMQ is unavailable or its API differs in the target environment, implementation stops and a fallback is proposed (**PENDING_USER_APPROVAL at that point**, ADR-004).

Access pattern: web and worker use the server Supabase client (secret key, server-side only) and call SECURITY DEFINER RPC functions for transactional operations. Queue functions are never exposed to `anon` or `authenticated`.

---

## 9. AI architecture

**ACCEPTED** (ADR-006; PRD §15 "Architecture IA"; `CLAUDE.md` §4.3):

- Provider-neutral gateway with model **profiles**: `fast_extraction`, `classification`, `research`, `reasoning`, `verification`, `embedding`. Profiles resolve to provider/model in server configuration, never in agent code.
- Every structured output is validated with the agent's Zod schema; invalid output is rejected (one bounded repair attempt is allowed, recorded as a separate call).
- Each agent step persists agent key, contract version, prompt version, provider, model, tokens, cost (estimated and reported), latency, warnings and output.
- Agents have **no tools** in v1: orchestrators fetch sources and pass bounded, delimited, untrusted text to the model. External content is data, never instructions; text that looks like instructions is ignored and may be flagged.
- Agents cite only identifiers they were given (source snapshot IDs or evidence IDs); the server rejects any unknown or out-of-scope identifier. Agents cannot invent URLs.
- Budgets: per-call max output tokens and timeout; per-run and per-analysis maximum cost; per-workspace concurrency. Reaching a budget yields `partial` or `needs_review`, never fabricated output.
- Provider fallback only on retryable provider failures, and the model change is recorded.
- Selection method **ACCEPTED** (PD-08 A): one provider chosen by a cost/quality benchmark, plus a fake provider for tests. The concrete provider, models per profile, embedding model and budgets: **PENDING_USER_APPROVAL (PD-24)**, after the benchmark.

---

## 10. Source acquisition and fetch security

**ACCEPTED** (ADR-013; PRD §6.3 "Gestion des sources", §13.1; `CLAUDE.md` §7):

- Every connector declares its access method (official API, contract, feed, or explicitly authorised method), terms URL, quotas and capabilities. A configured source is not "integrated" until its connector is developed and tested. Unauthorised scraping is forbidden.
- Connectors return explicit states: `ok`, `blocked`, `unavailable`, `not_supported`, `rate_limited`, `error`. They never fabricate data and never write to catalog tables.
- MVP acquisition paths (PRD §18: "Import de données", "Ajout manuel d'un SaaS", "nombre limité de connecteurs fiables"): manual product entry, CSV import of products and of customer feedback (with a per-import rights declaration), and an official-website connector. Third-party sources are added one at a time after a written terms review (**ACCEPTED**, PD-14 A). G2 is the first to study; its approval is **PENDING_USER_APPROVAL (PD-26)**. Discovery search sources: **PENDING_USER_APPROVAL (PD-28)**.
- **Safe fetcher** (all outbound HTTP to untrusted URLs): `http`/`https` only; DNS resolution with rejection of loopback, private, link-local, CGNAT, multicast, reserved and IPv4-mapped IPv6 ranges; connection pinned to the validated IP (DNS-rebinding defence); every redirect re-validated (max 5); timeout, response-size and content-type limits; no cookies or credentials; per-host rate limiting; robots.txt respected for the official-website connector; a neutral user agent that contains no personal data.

---

## 11. Security architecture

**ACCEPTED** (ADR-007; `CLAUDE.md` §7; Implementation Blueprint v1.0 §11):

### 11.1 Authentication

- Supabase Auth; public signup disabled in every environment; users are invited. The Supabase CLI 3.0.0 default is `enable_signup = true` (verified in Sprint 0), so `supabase/config.toml` sets it to `false` explicitly; hosted projects must be configured the same way.
- The acting user is always derived from the verified session, never from a request body.

### 11.2 Authorization layers

1. **API layer** — every private route authenticates, resolves `workspaceId` from the URL path, verifies membership and role on the server, validates every input with Zod.
2. **Database layer** — RLS enabled on every table in exposed schemas, explicit per-operation policies (no `FOR ALL` policies), minimal grants per operation, helper functions in the non-exposed `private` schema with pinned empty `search_path` and fully qualified names.
3. **Server-only writes** — catalog, derived data, results, operations and queue are written only by the server role. Browser roles never get `INSERT`/`UPDATE` on server-owned result columns; job-creating requests go through the API, which calls the job-creation RPC.

Role matrix (summary; full matrix in Implementation Blueprint §12):

| Capability | owner | admin | member | viewer |
|---|:-:|:-:|:-:|:-:|
| Read workspace data | ✓ | ✓ | ✓ | ✓ |
| Collections, saved searches, notes, tags, product states, correction reports | ✓ | ✓ | ✓ | — |
| Start discovery / pain point runs / analyses | ✓ | ✓ | ✓ | — |
| Correct clusters, set opportunity statuses | ✓ | ✓ | ✓ | — |
| Delete analyses, edit workspace settings | ✓ | ✓ | — | — |
| Manage members (except owner) | ✓ | ✓ | — | — |
| Transfer ownership | ✓ (server operation) | — | — | — |

### 11.3 Other controls

- Secrets only in server environment variables; nothing server-side uses the `NEXT_PUBLIC_` prefix; startup validates environment variables with Zod.
- Safe errors with stable codes and request IDs; no SQL, stack traces or provider details in responses.
- Rate limits and idempotency on expensive POST endpoints.
- Private Storage buckets; downloads via short-lived signed URLs after authorisation.
- Logs exclude credentials, tokens and unnecessary personal data; reviewer identities are stored only as salted hashes when permitted.
- Prompt-injection defences per §9; SSRF defences per §10.
- Output encoding: only `http(s)` URLs are rendered as links.

---

## 12. API architecture

**ACCEPTED** (`CLAUDE.md` §12; Implementation Blueprint v1.0 §9), with workspace scoping made explicit:

- Versioned routes under `/api/v1`. Workspace resources live under `/api/v1/workspaces/{workspaceId}/…`; the server checks membership for that ID on every request.
- Route handlers are thin: parse → authenticate → authorise → call service → map DTO → respond.
- DTOs are explicit; database rows are never returned as-is.
- Cursor pagination with deterministic ordering (sort key + `id` tiebreaker); signed, opaque cursors.
- `Idempotency-Key` required on every job-creating POST; long work returns `202` with a `status_url`.
- Error envelope `{ error: { code, message, details?, request_id } }` with a fixed error-code catalogue.

---

## 13. Frontend architecture

**ACCEPTED** (PRD §2, §3, §5, §17; `CLAUDE.md` §12):

- Next.js App Router; server components for data loading through the internal service layer; client components only for interaction.
- Navigation per PRD §2: Discover, AI Discovery, Opportunities, Saved, Settings; search and filters inside Discover. Pain Point Clusters and generated opportunities are tabs under "Opportunities" (Analyses / Clusters / Generated opportunities); the Comparator is reached from Saved and from multi-select (**ACCEPTED**, PD-19 A).
- Explicit loading, empty, partial, error and stale states; unknown values rendered as "Unknown", never as zero or "No".
- Score, WTP, confidence, coverage and decision band are separate visual elements; every score links to its evidence.
- Demo or sample data is labelled; no decorative dead controls; keyboard navigation and basic accessibility tested.
- Dark mode first, light mode available (PRD §17).
- UI language: French copy with the PRD's English navigation labels (**ACCEPTED**, PD-15 A).

---

## 14. Infrastructure and environments

| Environment | Purpose | Status |
|---|---|---|
| Local | Supabase CLI local stack (requires Docker), web, worker, fake AI provider and fake connectors | ACCEPTED |
| CI | Install, lint, typecheck, unit tests, build; database tests (`supabase test db`) and integration tests on a Docker-capable runner | ACCEPTED: GitHub Actions (PD-01 A) |
| Staging / Production | Staging + production Supabase projects in an EU region (PD-02 A); web on Vercel, worker on a container host (PD-03 A) | ACCEPTED; worker host vendor PENDING (PD-27) |

- PRD §22 lists Vercel for hosting as "envisagée — à confirmer". A persistent worker cannot run as a request-scoped serverless function **[ASSUMPTION — Vercel limits not re-verified in this session]**, so the worker needs a container or VM host. **ACCEPTED** (PD-03 A): web on Vercel, worker on a container host in the Supabase project's region; vendor PENDING (PD-27).
- The cloud session used for this consolidation has no running Docker daemon and no Supabase CLI. Database tests must therefore run in CI or on a developer machine. This is an environment constraint, not an architecture choice.
- Migrations are timestamped, forward-only, applied in CI against a clean database, and never edited once applied.
- Backups: hosted Supabase backups plus a documented restore drill before production (Sprint 7).

---

## 15. Observability and cost control

**ACCEPTED** (`CLAUDE.md` §11; Implementation Blueprint v1.0 §12):

- Structured JSON logs with request ID, job execution ID, workspace ID, run/analysis ID, agent/step key, provider/model, tokens, cost, latency, retry count, error code and evidence IDs produced.
- Persisted metering in `provider_usage` and `agent_step_runs`; product metrics from PRD §20 are computed from the database.
- Alerts (Sprint 7): dead-letter count, stale leases, budget exhaustion rate, provider error rate, cost per day.
- Budgets are configured server-side in `platform_limits`; workspace settings can only lower them (PRD §14.2 "Budget maximal par analyse").

---

## 16. Testing strategy

**ACCEPTED** (`CLAUDE.md` §13; Implementation Blueprint v1.0 §13):

| Layer | Tooling | Focus |
|---|---|---|
| Unit | Vitest | Contracts, normalization, exclusion classifier, filter semantics, identity rules, scoring, confidence, verdict gates, retry classification, budgets |
| Database | pgTAP via `supabase test db` | Grants and RLS for anon, non-member, viewer, member, admin, owner, server role; integrity triggers; RPC functions |
| Integration | Vitest + local Supabase + fake providers/connectors | Job lifecycle, idempotency, retries, crash recovery, duplicate delivery, cancellation, partial results, evidence scope, exclusion across engines |
| E2E | Playwright | The journeys of PRD §23 and `CLAUDE.md` §13 |
| AI evaluation | Fixed fixtures + metrics | Extraction precision, identity resolution, entailment, unsupported-claim rate, clustering quality (no merge of different problems), category accuracy, reproducibility, verdict consistency, cost |

Valid JSON is not evidence that an agent works; an agent ships only after its evaluation thresholds pass.

---

## 17. Phasing

The MVP and later phases follow PRD §18 exactly. The feature-by-feature mapping (PRD → phase → sprint) is in Implementation Blueprint Appendix B. Nothing from the PRD is dropped; features outside the MVP are scheduled in Phase 2 or Phase 3 as the PRD states.

---

## 18. Non-goals for v1

**ACCEPTED** (Implementation Blueprint v1.0 §0 "Explicitly deferred"): public multi-tenant billing, public signup, autonomous purchase/outreach/external account actions, fully autonomous scraping, free-form multi-agent conversations. Vector search for catalog semantic search is Phase 2 (PRD §18), while embeddings for pain clustering are MVP (PRD §18 "Clustering sémantique des retours"; ADR-008).

---

## 19. Assumptions and items not verified

These items could not be verified in the consolidation session (network policy blocked the official documentation sites; no Docker or Supabase CLI) and must be verified at the indicated sprint:

| Item | Verify in |
|---|---|
| Exact current versions of Node LTS lines, pnpm, Next.js, Zod, Supabase CLI and PostgreSQL — **verified in Sprint 0**: Node 26.13.0 is the active LTS (official schedule), pnpm 10.34.9, Next.js 16.4.5, Zod 4.6.7, TypeScript 6.0.3 (7.x is not yet supported by typescript-eslint), Supabase CLI 3.0.0 whose local stack runs PostgreSQL 17; see `docs/ENVIRONMENT.md` | Done (Sprint 0) |
| Zod major-version semantics — **verified in Sprint 0** by contract tests: `.default({})` skips inner defaults, enum-keyed records are exhaustive, `coerce.number("")` is 0, `.url()` accepts `javascript:` (Implementation Blueprint §4.0) | Done (Sprint 0) |
| Supabase API key model and default grants on new objects in `public` — **verified in Sprint 1**: the CLI 3.0.0 local stack exposes `PUBLISHABLE_KEY` / `SECRET_KEY` (`sb_publishable_…`, `sb_secret_…`) alongside the legacy `ANON_KEY` / `SERVICE_ROLE_KEY`; the project uses the publishable/secret pair. After M1, tables created in `public` are not readable by `anon` or `authenticated` (pgTAP `001_schema_privileges.sql`) | Done (Sprint 1) |
| PGMQ availability, queue-name rules and function signatures (`pgmq.create`, `send`, `read`, `set_vt`, `archive`, `delete`) in the target Supabase version | Sprint 3 (gate, before any queue code) |
| `pgvector` availability and the embedding dimensions of the chosen model | Sprint 4 |
| Vercel function duration limits | Before Sprint 7 deployment |
| Full-text search behaviour on French queries over English content | Sprint 2 (test with French query fixtures) |

---

## 20. Decision index

| ADR | Title | Status |
|---|---|---|
| ADR-000 | Reference documents, precedence and decision governance | ACCEPTED |
| ADR-001 | Modular monolith with a persistent worker; hosting | ACCEPTED (PD-02, PD-03); worker host vendor PENDING (PD-27) |
| ADR-002 | Company/product separation and product identity | ACCEPTED |
| ADR-003 | Evidence-first data model with versioned snapshots | ACCEPTED |
| ADR-004 | PGMQ-based durable job system | ACCEPTED (verification gate; fallback pending if needed) |
| ADR-005 | Server-side deterministic scoring and verdict gates | ACCEPTED (PD-05, PD-06 B, PD-07, PD-21, PD-23); low-confidence exception PENDING (PD-25) |
| ADR-006 | Provider-neutral AI gateway | ACCEPTED (PD-08 method, PD-22); provider/models/budgets PENDING (PD-24) |
| ADR-007 | Workspace-scoped RLS, grants and platform operator role | ACCEPTED (PD-12) |
| ADR-008 | Pain Point Intelligence Engine as third engine | ACCEPTED (PD-09) |
| ADR-009 | Polymorphic analysis subjects | ACCEPTED (PD-10) |
| ADR-010 | Permanent Affiliate/Partner exclusion | ACCEPTED (PD-11) |
| ADR-011 | Toolchain, versions and CI | ACCEPTED (PD-01) |
| ADR-012 | Sprint order | ACCEPTED (PD-13) |
| ADR-013 | Source acquisition and compliance | ACCEPTED (PD-14); G2 approval and Discovery search sources PENDING (PD-26, PD-28) |
| ADR-014 | Workspace opportunity status model | ACCEPTED (PD-04) |

The full register of pending decisions, with recommendations and blocked sprints, is in `docs/ADR/README.md`.
