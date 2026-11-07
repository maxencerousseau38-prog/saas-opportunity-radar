# SAAS OPPORTUNITY RADAR

## Implementation Blueprint v1.1

**Date:** 4 November 2026 (v1.0: 3 November 2026)\
**Purpose:** Executable implementation contract for Claude Code and
engineering contributors.\
**Status:** Consolidated baseline. Reference SQL has **not** been executed
(documentation-only phase); Sprint 1 must apply every migration to a clean
local Supabase database and pass the pgTAP suite before it is considered
valid.\
**Companion documents:** `docs/PRODUCT_REQUIREMENTS.md` (functional
reference), `docs/TECHNICAL_BLUEPRINT.md` (architecture), `docs/ADR/`
(decisions and the pending-decision register), `CLAUDE.md` (working
rules).

Version 1.1 integrates the Pain Point Intelligence Engine, polymorphic
analysis subjects, versioned source snapshots, field provenance, the
deterministic permanent-exclusion design, corrected RLS/grants, a
corrected scoring engine and the missing API surface. Appendix A maps every
audit finding to its resolution; Appendix B maps every PRD feature to a
phase and sprint.

Decision markers used in this document:

-   **[ACCEPTED: source]** --- traceable to an approved source.
-   **[PENDING_USER_APPROVAL: PD-xx]** --- recommendation not yet approved;
    do not implement before approval. The register is in
    `docs/ADR/README.md`.

------------------------------------------------------------------------

# 0. Implementation rules

This document is the source of truth for implementation details. If code
and this document disagree, update the document and the implementation
together. If this document and `docs/PRODUCT_REQUIREMENTS.md` disagree on
a functional requirement, the Product Requirements win (ADR-000).

## Non-negotiable rules

1.  A SaaS product, its owning company, a source document, an evidence
    claim, and an AI conclusion are different entities.
2.  Unknown data is `null` or an explicit `unknown` state. Never infer a
    positive or negative fact from missing data.
3.  Every externally derived claim must point to one or more source
    snapshots through evidence items.
4.  AI output is untrusted input. Validate every response with Zod
    before persistence, then validate every referenced identifier
    against the database.
5.  The server computes final scores, coverage, confidence and verdicts.
    LLMs may propose dimension ratings and explanations but cannot write
    final scores or verdicts.
6.  Workspace data is private and protected by RLS. Catalog data is
    readable only by authenticated users, and only for products that are
    `active` and `eligible`; catalog writes are server-only.
7.  Long-running work is asynchronous. API requests create durable jobs
    and return `202`.
8.  Jobs and agent steps must be idempotent, retryable, observable, and
    budget-limited.
9.  Web pages, reviews, documents, and tool results are untrusted data,
    never instructions.
10. Never scrape or store data contrary to source terms, access
    controls, privacy law, or applicable copyright restrictions.
11. The permanent Affiliate/Partner exclusion is enforced by
    deterministic code (§5.4) at every boundary listed in Technical
    Blueprint §7.2; no input can disable it.
12. Every migration that creates a table also enables RLS, revokes
    default privileges and grants exactly the required operations for
    that table in the same migration.
13. Every citation (dimension score, finding, report statement) must
    reference an evidence item that belongs to the analysis evidence
    index, and every evidence index entry must be in the analysis scope.

## V1 implementation choices

-   Monorepo: pnpm + Turborepo. **[ACCEPTED: IB v1.0 §0 as provided by the product owner; pnpm also in CLAUDE.md §14 commands]**; versions are PD-01.
-   Runtime: Node.js LTS, TypeScript strict mode. The most recent LTS
    line, verified against the official schedule at Sprint 0 start (24 or
    26) **[ACCEPTED: PD-01, approved 4 Nov 2026]**.
-   Web: Next.js App Router.
-   Database/Auth/Storage: Supabase.
-   Queue: Supabase Queues (PGMQ), one durable queue `sor_jobs`;
    server-side consumers only.
-   Validation: Zod, latest major **[ACCEPTED: PD-01]**; contracts are
    written version-agnostically and pinned by contract tests (§4.0).
-   Tests: Vitest, Playwright, Supabase pgTAP tests.
-   AI: provider-neutral gateway; no provider-specific calls inside
    engine agents.
-   Catalog search: PostgreSQL full-text and relational filters first;
    catalog semantic (vector) search is Phase 2 (PRD §18).
-   Pain clustering: embeddings stored with `pgvector` in the MVP (PRD §18
    "Clustering sémantique des retours"). **[ACCEPTED: PRD §18, ADR-008]**
-   Worker: persistent Node.js process; not a long-running request
    handler.

## Explicitly deferred

-   Public multi-tenant SaaS billing.
-   Public signup.
-   Autonomous purchase, outreach, or external account actions.
-   Fully autonomous source scraping.
-   Vector embeddings for catalog semantic search, until lexical search
    and structured filters are validated (PRD Phase 2). Embeddings for
    pain clustering are **not** deferred.
-   Multi-agent free-form conversations. Agents exchange versioned JSON
    artifacts only.

------------------------------------------------------------------------

# 1. Repository layout

``` text
saas-opportunity-radar/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   │   ├── (auth)/login/
│   │   │   ├── (dashboard)/[workspaceId]/discover/
│   │   │   ├── (dashboard)/[workspaceId]/saas/[slug]/
│   │   │   ├── (dashboard)/[workspaceId]/discovery/[runId]/
│   │   │   ├── (dashboard)/[workspaceId]/pain-points/[runId]/
│   │   │   ├── (dashboard)/[workspaceId]/clusters/[clusterId]/
│   │   │   ├── (dashboard)/[workspaceId]/opportunities/
│   │   │   ├── (dashboard)/[workspaceId]/analyses/[analysisId]/
│   │   │   ├── (dashboard)/[workspaceId]/compare/
│   │   │   ├── (dashboard)/[workspaceId]/saved/
│   │   │   ├── (dashboard)/[workspaceId]/settings/
│   │   │   └── api/v1/
│   │   ├── components/
│   │   └── lib/
│   └── worker/
│       └── src/
│           ├── main.ts
│           ├── queue/
│           ├── handlers/
│           └── observability/
├── packages/
│   ├── contracts/src/
│   │   ├── common.ts
│   │   ├── catalog.ts       (S0: CSV cell helpers; catalog schemas in S2)
│   │   ├── env.ts           (S0: environment validation)
│   │   ├── filters.ts
│   │   ├── evidence.ts
│   │   ├── workspace.ts
│   │   ├── discovery.ts
│   │   ├── pain-points.ts
│   │   ├── analysis.ts
│   │   ├── agents/          (one file per agent output contract)
│   │   ├── jobs.ts
│   │   └── api.ts           (DTOs, error codes)
│   ├── database/src/
│   │   ├── generated.ts
│   │   ├── clients.ts
│   │   └── repositories/
│   ├── domain/src/
│   │   ├── normalization/   (URL, domain, slug)
│   │   ├── identity/
│   │   ├── exclusion/
│   │   ├── filters/
│   │   ├── fit/
│   │   ├── scoring/
│   │   ├── confidence/
│   │   ├── verdict/
│   │   ├── jobs/            (retry classification, budgets)
│   │   └── agent.ts         (agent contract types only)
│   ├── ai-gateway/src/
│   │   ├── provider.ts
│   │   ├── gateway.ts
│   │   └── profiles.ts
│   ├── data-sources/src/
│   │   ├── connector.ts
│   │   ├── safe-fetch.ts
│   │   ├── import/          (CSV parsers)
│   │   └── connectors/
│   ├── discovery-engine/src/
│   │   ├── orchestrator.ts
│   │   └── agents/
│   ├── pain-point-engine/src/
│   │   ├── orchestrator.ts
│   │   ├── clustering.ts    (deterministic algorithm)
│   │   └── agents/
│   └── opportunity-engine/src/
│       ├── orchestrator.ts
│       └── agents/
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   └── tests/              (pgTAP)
├── evals/                   (AI evaluation fixtures and runners)
├── docs/
│   ├── PRODUCT_REQUIREMENTS.md
│   ├── TECHNICAL_BLUEPRINT.md
│   ├── IMPLEMENTATION_BLUEPRINT.md
│   └── ADR/
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

Package scope: `@sor/*` (for example `@sor/contracts`). Each package
declares explicit `exports` subpaths.

## Package boundaries

-   `contracts`: Zod schemas and inferred TypeScript types. No database
    or provider imports.
-   `domain`: deterministic business rules. No network access, Supabase
    client, or LLM imports.
-   `database`: Supabase clients, generated database types,
    repositories, RPC wrappers.
-   `data-sources`: connectors and the safe fetcher; return normalized
    source documents. No direct writes to catalog tables.
-   `ai-gateway`: provider abstraction, structured-output handling,
    embeddings, metering, budgets.
-   `discovery-engine`: discovery orchestration and agents D1--D7.
-   `pain-point-engine`: pain point orchestration, deterministic
    clustering and agents P1--P9.
-   `opportunity-engine`: analysis orchestration, agents O1--O9, scoring
    input preparation, and report composition.
-   `apps/worker`: queue consumer and dependency injection.
-   `apps/web`: UI and authenticated API boundary.

------------------------------------------------------------------------

# 2. Database model

## 2.1 Schemas

-   `public`: tables exposed through the Supabase Data API, protected by
    grants and RLS, plus RPC functions whose `EXECUTE` is granted
    explicitly.
-   `private`: internal helper functions, triggers and the scope-check
    functions. Never exposed through PostgREST.
-   `extensions`: managed extensions (`vector`).
-   `pgmq`: owned by the PGMQ extension. Never hand-create or modify its
    tables. The `pgmq_public` wrapper schema, if present, is not exposed
    to `anon` or `authenticated`.

## 2.2 Entity ownership

### Global catalog and evidence (server-written)

`companies`, `saas_products`, `entity_identifiers`, `categories`,
`product_categories`, `sources`, `source_records`, `source_snapshots`,
`evidence_items`, `catalog_field_provenance`, `evidence_conflicts`,
`product_features`, `product_integrations`, `pricing_plans`,
`company_signals`, `customer_feedback`, `competitor_links`,
`product_exclusion_assessments`, `fx_rates`.

Authenticated users may read rows that belong to a visible product
(`record_status = 'active'` and `exclusion_status = 'eligible'`). Only
trusted backend operations may create or update them.

### Global derived problem data (server-only)

`feedback_problems`, `feedback_problem_embeddings`.

### Workspace-scoped data

`workspaces`, `workspace_members`, `workspace_settings`, `collections`,
`collection_items`, `saved_searches`, `workspace_product_states`, `tags`,
`tag_assignments`, `catalog_correction_reports`, `discovery_runs`,
`discovery_candidates`, `discovery_candidate_evidence`, `pain_point_runs`, `pain_point_run_products`,
`pain_point_clusters`, `pain_point_evidence`,
`pain_point_cluster_snapshots`, `market_gaps`, `market_gap_clusters`,
`market_gap_evidence`, `generated_opportunities`,
`generated_opportunity_clusters`, `generated_opportunity_products`,
`opportunity_analyses`, `analysis_subject_products`, `analysis_evidence`,
`analysis_dimension_scores`, `dimension_score_evidence`,
`analysis_findings`, `finding_evidence`, `validation_experiments`.

All workspace-scoped reads and writes require membership and role
checks. Pain Point Clusters and generated opportunities are
workspace-scoped **[ACCEPTED: PD-09, approved 4 Nov 2026]**.

### Platform and operations (server-only)

`platform_operators`, `exclusion_rules`, `platform_limits`,
`job_executions`, `agent_step_runs`, `provider_usage`, `audit_logs`,
`rate_limit_counters`. Queue state belongs to PGMQ.

## 2.3 PRD data model mapping

PRD §12 lists fields by table. The schema below keeps every field, but
some fields are stored in a normalized location instead of a single wide
table. Nothing is dropped.

| PRD field(s) | Stored in |
|---|---|
| §12.1 `categories`, `subcategories` | `product_categories` (+ `categories.parent_id`) |
| §12.1 `business_model` | `saas_products.billing_models` (multi-value, PRD §4.2.F values) |
| §12.1 `headquarters_country`, `headquarters_city`, `employee_count_min/max`, `company_type`, `founder_led`, `independent_status`, `founding_year` | `companies` (`country_code`, `city`, `employee_min/max`, `company_type`, `founder_led`, `founded_year`); `independent_status` = `company_type` |
| §12.1 `official_status` | `saas_products.product_status` |
| §5.3 founders, public LinkedIn profiles | `company_people` (public professional data only, evidence required) |
| §5.4 problem solved, value proposition, use cases, compatibilities, platforms, languages, markets served | `saas_products.problem_solved`, `value_proposition`, `use_cases`, `compatibilities`, `technology_tags`, `languages`, `served_countries` (each with provenance) |
| §12.1 `first_discovered_at`, `discovery_source` | `saas_products.first_discovered_at`, `discovery_source_id` |
| §12.1 `record_status` | `saas_products.record_status` |
| §12.2 `source_id`, `confidence` on features | `product_features.evidence_id`, `confidence` |
| §12.3 `monthly_price`, `annual_price` | one `pricing_plans` row per plan × billing period (`billing_period`, `price_amount`, `currency`) |
| §12.4 Company Signals | `company_signals` |
| §12.5 `source_platform`, `source_url` | via `customer_feedback.source_snapshot_id` → `source_records` → `sources` |
| §12.5 `problem_category`, `severity`, `recurring_issue_group`, `resolution_status`, `confidence` | `feedback_problems` (one feedback may contain several problems; the primary one has `is_primary = true`); `recurring_issue_group` = cluster membership in `pain_point_evidence` |
| §12.5 `distinct_author_reference` | `customer_feedback.author_reference_hash` (only when permitted) |
| §12.6 `source_id` on competitors | `competitor_links.evidence_id` |
| §12.7 Sources (`saas_id`, `verified_at`, `evidence_type`, `raw_reference`, `extraction_method`) | `sources` + `source_records` + `source_snapshots` + `evidence_items` (`verified_at`, `evidence_type`, `extraction_method`) |
| §12.8 AI Analyses (`individual_scores`, `model_identifier`, `prompt_version`) | `opportunity_analyses` + `analysis_dimension_scores` + `agent_step_runs` (per-step model and prompt versions) |
| §12.9 `excluded_categories`, `sorting` | `saved_searches.filters.configurable_exclusions`, `saved_searches.sort_key` |
| §12.10 link table `personal_notes`, `status` | `collection_items.notes`; status in `workspace_product_states` (PD-04 A, ADR-014), displayed in every collection |
| §12.11 Pain Point Clusters | `pain_point_clusters` (+ snapshots for history, PRD §13.3) |
| §12.12 Pain Point Evidence (`feedback_id`, `saas_id`, `source_id`, `evidence_url`, `published_at`) | `pain_point_evidence` → `feedback_problems` → `customer_feedback` → snapshot/record; all PRD fields are returned by the cluster-evidence DTO (`GET W/clusters/{id}/evidence`) |
| §12.13 Generated Opportunities (`cluster_id`, `competitors`, `*_score`, `verdict`) | `generated_opportunities` + link tables; scores and verdict come from the latest completed `opportunity_analyses` row whose subject is the opportunity |
| §12.14 Validation Experiments | `validation_experiments` (Phase 3 per PRD §18) |

------------------------------------------------------------------------

# 3. Supabase migrations

## 3.0 Conventions

-   Timestamped files under `supabase/migrations/`; the timestamp is
    assigned when the file is created. The order below is the dependency
    order. Never edit an applied migration; add a new one.
-   **Every migration that creates a table enables RLS, revokes default
    privileges from `anon` and `authenticated`, and grants exactly the
    required operations, in the same file.** No table ever exists without
    RLS, even between two migrations.
-   No `FOR ALL` policies. One policy per operation, always `TO
    authenticated` (or no policy at all for server-only tables).
-   User-editable columns are restricted with column-level `UPDATE`
    grants; immutable columns (`workspace_id`, `created_by`, ...) are never
    granted for update.
-   Helper functions live in `private`, use `SET search_path = ''`, fully
    qualified names, and are created **after** the tables they read.
    `LANGUAGE sql` function bodies are validated at creation time
    (verified with PostgreSQL 16 during the consolidation: creating such
    a function before its table fails with `relation does not exist`).
-   RPC functions callable through the Data API live in `public` and have
    `EXECUTE` revoked from `public`, `anon` and `authenticated`, then
    granted explicitly (most only to `service_role`).
-   Supabase may grant privileges on new objects in `public` to API roles
    by default **[ASSUMPTION: verify in Sprint 1]**; explicit per-object
    revokes are therefore mandatory and pgTAP-tested.
-   The reference SQL below has not been executed. Sprint 1 applies it to
    a clean local database; any defect found is fixed in the migration
    and in this document together.

Migration order and owning sprint (sprint numbers follow §15, whose order
is **[ACCEPTED: PD-13, approved 4 Nov 2026]**):

| # | File (suffix) | Content | Sprint |
|---|---|---|---|
| M1 | `_foundation.sql` | schemas, shared enums, shared trigger functions | S1 |
| M2 | `_catalog_evidence.sql` | catalog, identifiers, sources, snapshots, evidence, provenance, feedback, exclusion assessments | S1 |
| M3 | `_workspaces_platform.sql` | workspaces, members, settings, collections, saved searches, states, tags, reports, operators, audit, rate limits, helpers, bootstrap RPC | S1 |
| M4 | `_reference_data.sql` | categories, sources registry, exclusion rules mirror, platform limits | S1 |
| M5 | `_jobs.sql` | job executions, agent steps, provider usage, queue, job RPCs | S3 |
| M6 | `_pain_points.sql` | feedback problems, embeddings, pain runs, clusters, generated opportunities | S4 |
| M7 | `_analyses.sql` | opportunity analyses, subjects, evidence index, scores, findings | S5 |
| M8 | `_discovery.sql` | discovery runs, candidates | S6 |
| M9 | `_validation_experiments.sql` | validation experiments (PRD Phase 3) | Phase 3 |

## M1 --- foundation

``` sql
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Defence in depth for objects created by the migration role.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

create type public.company_type as enum ('independent','subsidiary','public_company','unknown');
create type public.funding_status as enum ('bootstrapped','externally_funded','unknown');
create type public.product_status as enum ('active','beta','discontinued','unknown');
create type public.record_status as enum ('candidate','active','needs_review','archived','merged');
create type public.exclusion_status as enum ('unassessed','eligible','excluded','needs_review');
create type public.customer_type as enum ('b2b','b2c','b2b_b2c','unknown');
-- PRD §4.2.F values; an empty array means "unknown".
create type public.billing_model as enum (
  'monthly_subscription','annual_subscription','freemium','free_trial',
  'usage_based','per_user','volume_based','license','other'
);
create type public.pricing_status as enum ('free','paid','freemium','custom','unknown');
create type public.maturity_stage as enum ('new','launching','established','growing','mature','unknown');
create type public.presence_status as enum ('present','not_observed','unknown');
create type public.technology_tag as enum (
  'web_app','mobile_app','api','ai_native','no_code_low_code','browser_extension'
);
create type public.integration_category as enum (
  'crm','ecommerce','marketing','analytics','communication','payments','other'
);
create type public.fact_status as enum ('confirmed','estimated','declared','unknown');
create type public.verification_status as enum (
  'unverified','verified','needs_review','rejected','stale'
);
create type public.source_type as enum (
  'official_website','review_platform','directory','community','social',
  'company_database','search_provider','manual_entry','user_import','other'
);
create type public.source_access_method as enum (
  'official_api','contract','public_feed','official_website_fetch',
  'manual_entry','user_import'
);
create type public.source_integration_status as enum (
  'planned','in_development','integrated','disabled','blocked'
);
create type public.fetch_status as enum (
  'ok','blocked','unavailable','not_supported','rate_limited','error'
);
create type public.content_storage_status as enum (
  'stored_full','stored_excerpt','reference_only','removed'
);
create type public.evidence_type as enum (
  'official_statement','customer_review','pricing_evidence',
  'customer_case_study','public_metric','technical_evidence',
  'market_evidence','third_party_report','user_declared','inference'
);
create type public.claim_type as enum (
  'product_exists','product_description','category','pricing',
  'paid_customer_signal','customer_identity','employee_count',
  'founding_year','headquarters','customer_country','market_presence',
  'language','platform','feature','integration','maturity',
  'company_profile','traction_signal','customer_feedback','customer_pain','market_size',
  'market_trend','competitor_relation','localization','funding',
  'traffic','other'
);
create type public.extraction_method as enum (
  'official_api','structured_parse','llm_extraction','manual_entry','user_import'
);
-- WTP / monetization evidence categories (CLAUDE.md §10).
create type public.monetization_signal as enum (
  'payment_confirmed','customer_verified','paid_plan_available',
  'purchase_intent','problem_signal','unknown'
);
create type public.feature_availability as enum (
  'available','beta','planned','removed','not_observed','unknown'
);
create type public.competitor_relationship as enum (
  'direct','indirect','alternative','substitute','adjacent'
);
create type public.review_sentiment as enum ('positive','neutral','negative','mixed','unknown');
-- PRD §4.2.N complaint categories (+ reliability, other).
create type public.problem_category as enum (
  'pricing','ux','missing_features','bugs','support','integrations',
  'performance','documentation','customization','complexity',
  'reliability','other'
);
create type public.resolution_status as enum ('resolved','unresolved','unknown');
create type public.workspace_role as enum ('owner','admin','member','viewer');
-- PRD §10.3 statuses.
create type public.opportunity_status as enum (
  'discovered','to_research','analyzing','validate','validated','rejected','building'
);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.valid_country_codes(p text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(c ~ '^[A-Z]{2}$'), true) from unnest(p) as c;
$$;
```

## M2 --- global catalog and evidence

``` sql
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 200),
  legal_name text,
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,220}$'),
  website_url text check (website_url is null or website_url ~* '^https?://'),
  primary_domain text,
  country_code char(2) check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  city text,
  founded_year integer check (founded_year is null or founded_year between 1800 and 2100),
  employee_min integer check (employee_min is null or employee_min >= 0),
  employee_max integer check (employee_max is null or employee_max >= 0),
  company_type public.company_type not null default 'unknown',
  founder_led boolean,
  funding_status public.funding_status not null default 'unknown',
  linkedin_url text check (linkedin_url is null or linkedin_url ~* '^https?://'),
  description text,
  verification_status public.verification_status not null default 'unverified',
  merged_into_company_id uuid references public.companies(id),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (employee_min is null or employee_max is null or employee_min <= employee_max),
  check (merged_into_company_id is null or merged_into_company_id <> id)
);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique check (source_key ~ '^[a-z0-9_]{2,60}$'),
  name text not null unique,
  source_type public.source_type not null,
  access_method public.source_access_method not null,
  base_url text,
  terms_url text,
  terms_reviewed_at timestamptz,
  terms_review_notes text,
  integration_status public.source_integration_status not null default 'planned',
  default_reliability_level smallint not null check (default_reliability_level between 1 and 4),
  rate_limit_per_minute integer check (rate_limit_per_minute is null or rate_limit_per_minute > 0),
  quota_per_day integer check (quota_per_day is null or quota_per_day > 0),
  is_enabled boolean not null default false,
  last_sync_at timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- PRD §6.3: a source is not usable until its connector is integrated.
  check (is_enabled = false or integration_status = 'integrated')
);

create table public.saas_products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  name text not null check (length(name) between 1 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,220}$'),
  website_url text check (website_url is null or website_url ~* '^https?://'),
  primary_domain text,                 -- not unique: one company may host several products on one domain
  tagline text check (tagline is null or length(tagline) <= 300),
  short_description text check (short_description is null or length(short_description) <= 300),
  description text,
  problem_solved text,                 -- PRD §5.4 (evidence via catalog_field_provenance)
  value_proposition text,
  use_cases text[] not null default '{}',
  compatibilities text[] not null default '{}',
  customer_type public.customer_type not null default 'unknown',
  billing_models public.billing_model[] not null default '{}',
  pricing_status public.pricing_status not null default 'unknown',
  launch_year integer check (launch_year is null or launch_year between 1900 and 2100),
  product_status public.product_status not null default 'unknown',
  maturity_stage public.maturity_stage not null default 'unknown',
  languages text[] not null default '{}',
  technology_tags public.technology_tag[] not null default '{}',
  served_countries text[] not null default '{}' check (private.valid_country_codes(served_countries)),
  customer_countries text[] not null default '{}' check (private.valid_country_codes(customer_countries)),
  france_presence public.presence_status not null default 'unknown',
  europe_presence public.presence_status not null default 'unknown',
  french_version public.presence_status not null default 'unknown',
  complexity_level text not null default 'unknown'
    check (complexity_level in ('low','medium','high','unknown')),
  documentation_url text check (documentation_url is null or documentation_url ~* '^https?://'),
  record_status public.record_status not null default 'candidate',
  exclusion_status public.exclusion_status not null default 'unassessed',
  merged_into_product_id uuid references public.saas_products(id),
  discovery_source_id uuid references public.sources(id),
  first_discovered_at timestamptz not null default now(),
  verification_status public.verification_status not null default 'unverified',
  last_verified_at timestamptz,
  search_vector tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (merged_into_product_id is null or merged_into_product_id <> id),
  check ((record_status = 'merged') = (merged_into_product_id is not null)),
  -- An active product must have passed the exclusion classifier.
  check (record_status <> 'active' or exclusion_status <> 'unassessed')
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete restrict,
  name text not null,
  -- Child slugs are prefixed by the parent slug, so the same name may
  -- appear under two parents (PRD: "Conversion Optimization", "Monitoring").
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,120}$'),
  description text,
  is_active boolean not null default true,
  is_user_visible boolean not null default true,
  is_permanently_excluded boolean not null default false,
  priority_weight integer not null default 0 check (priority_weight between -100 and 100),
  created_at timestamptz not null default now(),
  unique (parent_id, name),
  check (not is_permanently_excluded or not is_user_visible)
);

create table public.product_categories (
  product_id uuid not null references public.saas_products(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  is_primary boolean not null default false,
  confidence numeric(5,2) check (confidence between 0 and 100),
  primary key (product_id, category_id)
);
create unique index product_one_primary_category
  on public.product_categories(product_id) where is_primary;

create table public.source_records (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete restrict,
  canonical_url text not null check (canonical_url ~* '^https?://'),
  external_id text,
  title text,
  first_seen_at timestamptz not null default now(),
  unique (source_id, canonical_url)
);

-- One row per distinct content version: history is never overwritten.
create table public.source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_record_id uuid not null references public.source_records(id) on delete restrict,
  content_hash text not null check (length(content_hash) >= 16),
  fetch_status public.fetch_status not null,
  http_status integer,
  published_at timestamptz,
  retrieved_at timestamptz not null default now(),
  last_retrieved_at timestamptz not null default now(),
  storage_status public.content_storage_status not null default 'reference_only',
  raw_content_location text,           -- private Storage path, only when terms permit
  extracted_metadata jsonb not null default '{}'::jsonb,
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending','completed','failed','blocked','not_applicable')),
  unique (source_record_id, content_hash),
  check (storage_status in ('stored_full','stored_excerpt') or raw_content_location is null)
);

create table public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.saas_products(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  category_id uuid references public.categories(id) on delete restrict,
  source_snapshot_id uuid not null references public.source_snapshots(id) on delete restrict,
  claim_type public.claim_type not null,
  claim_text text not null check (length(claim_text) between 1 and 5000),
  claim_value jsonb,
  evidence_type public.evidence_type not null,
  fact_status public.fact_status not null,
  monetization_signal public.monetization_signal,
  reliability_level smallint not null check (reliability_level between 1 and 4),
  confidence numeric(5,2) check (confidence between 0 and 100),
  verification_status public.verification_status not null default 'unverified',
  verified_at timestamptz,
  published_at timestamptz,
  observed_at timestamptz not null default now(),
  expires_at timestamptz,
  extraction_method public.extraction_method not null,
  extracted_by_step_id uuid,           -- FK added in M5
  created_at timestamptz not null default now(),
  -- Scope: product, company, category, or market-level claim.
  check (product_id is not null or company_id is not null or category_id is not null
         or claim_type in ('market_size','market_trend')),
  check (claim_type <> 'paid_customer_signal' or monetization_signal is not null),
  -- PRD §13.2: levels 3–4 are never direct proof of monetization.
  check (monetization_signal not in ('payment_confirmed','customer_verified')
         or reliability_level <= 2),
  check (claim_type <> 'traffic' or fact_status = 'estimated'),
  check (verification_status <> 'verified' or verified_at is not null)
);

-- PRD §5.3 founders and public professional profiles. Only public,
-- professional information with evidence; no private contact data.
create table public.company_people (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name text not null check (length(full_name) between 1 and 200),
  role text not null check (role in ('founder','co_founder','executive','other')),
  public_profile_url text check (public_profile_url is null or public_profile_url ~* '^https?://'),
  evidence_id uuid not null references public.evidence_items(id) on delete restrict,
  fact_status public.fact_status not null,
  created_at timestamptz not null default now(),
  unique (company_id, full_name, role)
);

create table public.entity_identifiers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.saas_products(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  identifier_type text not null
    check (identifier_type in ('canonical_url','domain','external_id','alias_name')),
  value_normalized text not null check (length(value_normalized) between 1 and 500),
  source_id uuid references public.sources(id),
  is_primary boolean not null default false,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  evidence_id uuid references public.evidence_items(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((product_id is null) <> (company_id is null)),
  check (identifier_type <> 'external_id' or source_id is not null),
  check (valid_to is null or valid_to > valid_from)
);
create unique index identifiers_active_product_canonical_url
  on public.entity_identifiers(value_normalized)
  where identifier_type = 'canonical_url' and product_id is not null and valid_to is null;
create unique index identifiers_active_external_id
  on public.entity_identifiers(source_id, value_normalized)
  where identifier_type = 'external_id' and valid_to is null;
create index identifiers_lookup on public.entity_identifiers(identifier_type, value_normalized);

create table public.catalog_field_provenance (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.saas_products(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  field_key text not null check (field_key ~ '^[a-z_]{2,60}$'),
  evidence_id uuid not null references public.evidence_items(id) on delete restrict,
  fact_status public.fact_status not null,
  is_current boolean not null default true,
  selected_at timestamptz not null default now(),
  check ((product_id is null) <> (company_id is null))
);
create unique index provenance_current_product
  on public.catalog_field_provenance(product_id, field_key) where is_current and product_id is not null;
create unique index provenance_current_company
  on public.catalog_field_provenance(company_id, field_key) where is_current and company_id is not null;

create table public.evidence_conflicts (
  id uuid primary key default gen_random_uuid(),
  evidence_a_id uuid not null references public.evidence_items(id) on delete cascade,
  evidence_b_id uuid not null references public.evidence_items(id) on delete cascade,
  product_id uuid references public.saas_products(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  field_key text not null,
  status text not null default 'open'
    check (status in ('open','resolved_a','resolved_b','both_valid','dismissed')),
  note text,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (evidence_a_id < evidence_b_id),
  unique (evidence_a_id, evidence_b_id, field_key)
);

create table public.product_features (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.saas_products(id) on delete cascade,
  name text not null check (length(name) between 1 and 160),
  description text,
  feature_category text,
  is_primary boolean not null default false,   -- PRD §5.4 main vs secondary
  availability public.feature_availability not null default 'unknown',
  evidence_id uuid references public.evidence_items(id) on delete restrict,
  confidence numeric(5,2) check (confidence between 0 and 100),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (product_id, name),
  -- Any positive or negative availability claim needs evidence; a feature
  -- that was simply not found is 'not_observed' (CLAUDE.md §9).
  check (availability in ('not_observed','unknown') or evidence_id is not null)
);

create table public.product_integrations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.saas_products(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  integration_category public.integration_category not null default 'other',
  availability public.feature_availability not null default 'unknown',
  evidence_id uuid references public.evidence_items(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (product_id, name),
  check (availability in ('not_observed','unknown') or evidence_id is not null)
);

create table public.pricing_plans (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.saas_products(id) on delete cascade,
  plan_name text not null check (length(plan_name) between 1 and 120),
  billing_period text not null default 'unknown'
    check (billing_period in ('month','year','usage','one_time','custom','unknown')),
  price_amount numeric(12,2) check (price_amount is null or price_amount >= 0),
  currency char(3) check (currency is null or currency ~ '^[A-Z]{3}$'),
  price_per_user boolean,
  minimum_seats integer check (minimum_seats is null or minimum_seats > 0),
  has_free_trial boolean,
  has_free_plan boolean,
  custom_pricing boolean,
  is_entry_plan boolean not null default false,
  is_enterprise_plan boolean not null default false,
  evidence_id uuid not null references public.evidence_items(id) on delete restrict,
  checked_at timestamptz not null default now(),
  superseded_at timestamptz,
  check (price_amount is null or currency is not null)
);

create table public.company_signals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  product_id uuid references public.saas_products(id) on delete cascade,
  signal_type text not null check (signal_type in (
    'review_count','review_rating','testimonial','case_study','customer_logo',
    'commercial_reference','product_hunt_presence','founder_activity',
    'headcount_change','launch_or_update','traffic_estimate',
    'funding_announcement','commercial_activity')),
  signal_value jsonb not null,
  signal_date date,
  evidence_id uuid not null references public.evidence_items(id) on delete restrict,
  fact_status public.fact_status not null,
  confidence numeric(5,2) check (confidence between 0 and 100),
  verification_status public.verification_status not null default 'unverified',
  created_at timestamptz not null default now(),
  check (product_id is not null or company_id is not null),
  -- PRD §5.6: traffic estimates are never measured visits.
  check (signal_type <> 'traffic_estimate' or fact_status = 'estimated')
);

create table public.customer_feedback (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.saas_products(id) on delete cascade,
  source_snapshot_id uuid not null references public.source_snapshots(id) on delete restrict,
  evidence_item_id uuid not null unique references public.evidence_items(id) on delete restrict,
  external_review_id text,
  published_at timestamptz,
  rating numeric(4,2) check (rating is null or rating >= 0),
  rating_scale_max numeric(4,2) check (rating_scale_max is null or rating_scale_max > 0),
  original_text text,                  -- only when source terms permit (PRD §12.5)
  summarized_text text,
  language text,
  sentiment public.review_sentiment not null default 'unknown',
  content_storage_status public.content_storage_status not null,
  author_reference_hash text,          -- salted hash, only when permitted
  author_company_reference text,       -- only when stated by the source
  deduplication_hash text not null,
  is_near_duplicate_of uuid references public.customer_feedback(id),
  created_at timestamptz not null default now(),
  check (content_storage_status <> 'stored_full' or original_text is not null),
  check (content_storage_status not in ('reference_only','removed') or original_text is null),
  check (rating is null or rating_scale_max is null or rating <= rating_scale_max)
);
create unique index customer_feedback_dedupe
  on public.customer_feedback(product_id, deduplication_hash);

-- Direction: competitor_product_id competes for product_id's buyers.
-- The relationship is not assumed symmetric.
create table public.competitor_links (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.saas_products(id) on delete cascade,
  competitor_product_id uuid not null references public.saas_products(id) on delete cascade,
  relationship_type public.competitor_relationship not null,
  similarity_score numeric(5,2) check (similarity_score between 0 and 100),
  explanation text,
  evidence_id uuid references public.evidence_items(id) on delete set null,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  check (product_id <> competitor_product_id),
  unique (product_id, competitor_product_id)
);

create table public.product_exclusion_assessments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.saas_products(id) on delete cascade,
  status public.exclusion_status not null check (status <> 'unassessed'),
  rule_set_version text not null,
  matched_rules jsonb not null default '[]'::jsonb,
  incidental_mentions jsonb not null default '[]'::jsonb,
  decided_by text not null check (decided_by in ('rule_engine','platform_operator')),
  operator_user_id uuid references auth.users(id),
  reason text,
  created_at timestamptz not null default now(),
  check ((decided_by = 'platform_operator') = (operator_user_id is not null)),
  check (decided_by <> 'platform_operator' or reason is not null)
);

create table public.fx_rates (
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  rate_date date not null,
  rate_to_eur numeric(18,8) not null check (rate_to_eur > 0),
  source_key text not null,
  primary key (currency, rate_date)
);

-- Indexes (every RLS predicate and filter column)
create index companies_country_idx on public.companies(country_code);
create index companies_employee_range_idx on public.companies(employee_min, employee_max);
create index products_company_idx on public.saas_products(company_id);
create index products_visibility_idx on public.saas_products(record_status, exclusion_status);
create index products_created_idx on public.saas_products(created_at desc, id);
create index products_verified_idx on public.saas_products(last_verified_at desc);
create index products_domain_idx on public.saas_products(primary_domain);
create index products_billing_models_idx on public.saas_products using gin(billing_models);
create index products_technology_idx on public.saas_products using gin(technology_tags);
create index products_served_countries_idx on public.saas_products using gin(served_countries);
create index product_categories_category_idx on public.product_categories(category_id, product_id);
create index snapshots_record_idx on public.source_snapshots(source_record_id, retrieved_at desc);
create index evidence_product_claim_idx on public.evidence_items(product_id, claim_type);
create index evidence_company_claim_idx on public.evidence_items(company_id, claim_type);
create index evidence_snapshot_idx on public.evidence_items(source_snapshot_id);
create index feedback_product_date_idx on public.customer_feedback(product_id, published_at desc);
create index competitors_product_idx on public.competitor_links(product_id);
create index pricing_product_idx on public.pricing_plans(product_id) where superseded_at is null;
create index features_product_idx on public.product_features(product_id);
create index integrations_product_idx on public.product_integrations(product_id);
create index signals_product_idx on public.company_signals(product_id, signal_type);
create index signals_company_idx on public.company_signals(company_id, signal_type);
create index exclusion_assessments_product_idx on public.product_exclusion_assessments(product_id, created_at desc);

-- Search vector (config isolated in one function; French-query behaviour
-- is tested in Sprint 2).
create or replace function private.refresh_product_search_vector()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.name,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.tagline,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.short_description,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.description,'')), 'C');
  return new;
end;
$$;
create trigger saas_products_search_vector
before insert or update of name, tagline, short_description, description
on public.saas_products
for each row execute function private.refresh_product_search_vector();
create index products_search_vector_idx on public.saas_products using gin(search_vector);

create trigger companies_updated_at before update on public.companies
for each row execute function private.set_updated_at();
create trigger products_updated_at before update on public.saas_products
for each row execute function private.set_updated_at();
create trigger sources_updated_at before update on public.sources
for each row execute function private.set_updated_at();

-- Integrity: evidence attached to a catalog row must belong to the same
-- product (or to the product's company).
create or replace function private.assert_evidence_for_product(p_evidence_id uuid, p_product_id uuid)
returns void language plpgsql stable set search_path = ''
as $$
declare ok boolean;
begin
  if p_evidence_id is null then return; end if;
  select exists (
    select 1
    from public.evidence_items e
    left join public.saas_products p on p.id = p_product_id
    where e.id = p_evidence_id
      and (e.product_id = p_product_id
           or (e.product_id is null and e.company_id is not null and e.company_id = p.company_id))
  ) into ok;
  if not ok then
    raise exception 'EVIDENCE_SCOPE_VIOLATION: evidence % does not belong to product %',
      p_evidence_id, p_product_id using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function private.trg_evidence_scope_product()
returns trigger language plpgsql set search_path = ''
as $$
begin
  perform private.assert_evidence_for_product(new.evidence_id, new.product_id);
  return new;
end;
$$;

create trigger product_features_evidence_scope before insert or update of evidence_id, product_id
on public.product_features for each row execute function private.trg_evidence_scope_product();
create trigger product_integrations_evidence_scope before insert or update of evidence_id, product_id
on public.product_integrations for each row execute function private.trg_evidence_scope_product();
create trigger pricing_plans_evidence_scope before insert or update of evidence_id, product_id
on public.pricing_plans for each row execute function private.trg_evidence_scope_product();

create or replace function private.trg_competitor_evidence_scope()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.evidence_id is not null and not exists (
    select 1 from public.evidence_items e
    where e.id = new.evidence_id
      and e.product_id in (new.product_id, new.competitor_product_id)
  ) then
    raise exception 'EVIDENCE_SCOPE_VIOLATION' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger competitor_links_evidence_scope before insert or update of evidence_id
on public.competitor_links for each row execute function private.trg_competitor_evidence_scope();

create or replace function private.trg_evidence_entity_consistency()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.product_id is not null and new.company_id is not null and not exists (
    select 1 from public.saas_products p
    where p.id = new.product_id and p.company_id = new.company_id
  ) then
    raise exception 'EVIDENCE_SCOPE_VIOLATION: product/company mismatch' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger evidence_entity_consistency before insert or update of product_id, company_id
on public.evidence_items for each row execute function private.trg_evidence_entity_consistency();

create or replace function private.trg_feedback_evidence_consistency()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.evidence_items e
    where e.id = new.evidence_item_id
      and e.product_id = new.product_id
      and e.source_snapshot_id = new.source_snapshot_id
      and e.claim_type = 'customer_feedback'
      and e.evidence_type = 'customer_review'
  ) then
    raise exception 'EVIDENCE_SCOPE_VIOLATION: feedback evidence mismatch' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger customer_feedback_evidence_consistency before insert or update
on public.customer_feedback for each row execute function private.trg_feedback_evidence_consistency();

create or replace function private.trg_provenance_scope()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.product_id is not null then
    perform private.assert_evidence_for_product(new.evidence_id, new.product_id);
  elsif not exists (
    select 1 from public.evidence_items e
    where e.id = new.evidence_id and e.company_id = new.company_id
  ) then
    raise exception 'EVIDENCE_SCOPE_VIOLATION' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger provenance_scope before insert or update
on public.catalog_field_provenance for each row execute function private.trg_provenance_scope();

-- Exclusion guard: an operator cannot make a product eligible while one
-- of its primary categories is permanently excluded.
create or replace function private.trg_exclusion_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.exclusion_status = 'eligible' and exists (
    select 1 from public.product_categories pc
    join public.categories c on c.id = pc.category_id
    where pc.product_id = new.id and pc.is_primary and c.is_permanently_excluded
  ) then
    raise exception 'EXCLUDED_CATEGORY: product % has a permanently excluded primary category', new.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger saas_products_exclusion_guard before insert or update of exclusion_status
on public.saas_products for each row execute function private.trg_exclusion_guard();

-- Symmetric guard: an eligible product cannot receive a permanently
-- excluded primary category without first being re-classified.
create or replace function private.trg_category_exclusion_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.is_primary
     and exists (select 1 from public.categories c where c.id = new.category_id and c.is_permanently_excluded)
     and exists (select 1 from public.saas_products p where p.id = new.product_id and p.exclusion_status = 'eligible') then
    raise exception 'EXCLUDED_CATEGORY: re-classify product % before assigning an excluded category', new.product_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger product_categories_exclusion_guard before insert or update
on public.product_categories for each row execute function private.trg_category_exclusion_guard();

-- Visibility helpers (created after the tables they read).
create or replace function private.is_visible_product(p_product_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.saas_products p
    where p.id = p_product_id
      and p.record_status = 'active'
      and p.exclusion_status = 'eligible'
  );
$$;

create or replace function private.is_visible_company(p_company_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.saas_products p
    where p.company_id = p_company_id
      and p.record_status = 'active'
      and p.exclusion_status = 'eligible'
  );
$$;

create or replace function private.is_visible_evidence(p_evidence_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.evidence_items e
    where e.id = p_evidence_id
      and (
        (e.product_id is not null and private.is_visible_product(e.product_id))
        or (e.product_id is null and e.company_id is not null and private.is_visible_company(e.company_id))
        or (e.product_id is null and e.company_id is null
            and (e.category_id is null
                 or exists (select 1 from public.categories c
                            where c.id = e.category_id and c.is_user_visible)))
      )
  );
$$;

revoke all on function private.is_visible_product(uuid) from public;
revoke all on function private.is_visible_company(uuid) from public;
revoke all on function private.is_visible_evidence(uuid) from public;
grant execute on function private.is_visible_product(uuid) to authenticated;
grant execute on function private.is_visible_company(uuid) to authenticated;
grant execute on function private.is_visible_evidence(uuid) to authenticated;

-- RLS and grants (same migration as the tables).
do $$
declare t text;
begin
  foreach t in array array[
    'companies','sources','saas_products','categories','product_categories',
    'source_records','source_snapshots','evidence_items','entity_identifiers',
    'catalog_field_provenance','evidence_conflicts','product_features',
    'product_integrations','pricing_plans','company_signals','customer_feedback',
    'competitor_links','product_exclusion_assessments','fx_rates','company_people'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Read-only for authenticated users, restricted to visible products.
grant select on public.companies, public.sources, public.saas_products,
  public.categories, public.product_categories, public.source_records,
  public.source_snapshots, public.evidence_items, public.catalog_field_provenance,
  public.evidence_conflicts, public.product_features, public.product_integrations,
  public.pricing_plans, public.company_signals, public.customer_feedback,
  public.competitor_links, public.fx_rates, public.company_people
to authenticated;
-- entity_identifiers and product_exclusion_assessments: server-only (no grant).

create policy saas_products_read on public.saas_products for select to authenticated
  using (record_status = 'active' and exclusion_status = 'eligible');
create policy companies_read on public.companies for select to authenticated
  using (private.is_visible_company(id));
create policy sources_read on public.sources for select to authenticated using (true);
create policy categories_read on public.categories for select to authenticated
  using (is_user_visible and is_active);
create policy fx_rates_read on public.fx_rates for select to authenticated using (true);

create policy product_categories_read on public.product_categories for select to authenticated
  using (private.is_visible_product(product_id));
create policy product_features_read on public.product_features for select to authenticated
  using (private.is_visible_product(product_id));
create policy product_integrations_read on public.product_integrations for select to authenticated
  using (private.is_visible_product(product_id));
create policy pricing_plans_read on public.pricing_plans for select to authenticated
  using (private.is_visible_product(product_id));
create policy customer_feedback_read on public.customer_feedback for select to authenticated
  using (private.is_visible_product(product_id));
create policy competitor_links_read on public.competitor_links for select to authenticated
  using (private.is_visible_product(product_id) and private.is_visible_product(competitor_product_id));
create policy company_signals_read on public.company_signals for select to authenticated
  using ((product_id is not null and private.is_visible_product(product_id))
      or (product_id is null and private.is_visible_company(company_id)));
create policy company_people_read on public.company_people for select to authenticated
  using (private.is_visible_company(company_id));
create policy evidence_items_read on public.evidence_items for select to authenticated
  using (private.is_visible_evidence(id));
create policy provenance_read on public.catalog_field_provenance for select to authenticated
  using ((product_id is not null and private.is_visible_product(product_id))
      or (company_id is not null and private.is_visible_company(company_id)));
create policy evidence_conflicts_read on public.evidence_conflicts for select to authenticated
  using (private.is_visible_evidence(evidence_a_id) and private.is_visible_evidence(evidence_b_id));
create policy source_snapshots_read on public.source_snapshots for select to authenticated
  using (exists (select 1 from public.evidence_items e
                 where e.source_snapshot_id = source_snapshots.id and private.is_visible_evidence(e.id)));
create policy source_records_read on public.source_records for select to authenticated
  using (exists (select 1 from public.source_snapshots s
                 join public.evidence_items e on e.source_snapshot_id = s.id
                 where s.source_record_id = source_records.id and private.is_visible_evidence(e.id)));
```

## M3 --- workspaces, platform and helpers

``` sql
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ownership lives only here (no owner_id column on workspaces).
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'member',
  invited_by uuid references auth.users(id),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create unique index workspace_single_owner on public.workspace_members(workspace_id) where role = 'owner';
create index workspace_members_user_idx on public.workspace_members(user_id);

create table public.workspace_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  research_preferences jsonb not null default '{}'::jsonb,   -- PRD §14.1, validated by ResearchPreferencesSchema
  ai_preferences jsonb not null default '{}'::jsonb,         -- PRD §14.2, validated by AiPreferencesSchema
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.platform_operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  note text
);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  description text check (description is null or length(description) <= 1000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name),
  unique (id, workspace_id)
);

-- Status column intentionally absent: per-workspace status lives in
-- workspace_product_states [ACCEPTED: PD-04 / ADR-014, approved 4 Nov 2026].
create table public.collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null,
  workspace_id uuid not null,
  product_id uuid not null references public.saas_products(id) on delete cascade,   -- nullable from M6
  notes text check (notes is null or length(notes) <= 5000),
  added_by uuid not null references auth.users(id),
  added_at timestamptz not null default now(),
  foreign key (collection_id, workspace_id)
    references public.collections(id, workspace_id) on delete cascade
);
create unique index collection_items_product_uniq on public.collection_items(collection_id, product_id)
  where product_id is not null;

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  kind text not null default 'catalog' check (kind in ('catalog','discovery')),  -- PRD §4.3 and §6.4
  search_text text check (search_text is null or length(search_text) <= 2000), -- discovery: the prompt
  filters jsonb not null default '{}'::jsonb,   -- validated by CatalogFiltersSchema (§4.3)
  sort_key text not null default 'relevance',
  is_pinned boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_product_states (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_id uuid not null references public.saas_products(id) on delete cascade,
  status public.opportunity_status not null default 'discovered',
  is_favorite boolean not null default false,
  is_hidden boolean not null default false,          -- PRD §3.4 "Masquer le SaaS"
  personal_notes text check (personal_notes is null or length(personal_notes) <= 10000),
  last_viewed_at timestamptz,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, product_id)
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, name),
  unique (id, workspace_id)
);

-- generated_opportunity_id is added in M6.
create table public.tag_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  tag_id uuid not null,
  product_id uuid not null references public.saas_products(id) on delete cascade,
  assigned_by uuid not null references auth.users(id),
  assigned_at timestamptz not null default now(),
  foreign key (tag_id, workspace_id) references public.tags(id, workspace_id) on delete cascade
);
create unique index tag_assignments_product_uniq on public.tag_assignments(tag_id, product_id)
  where product_id is not null;

create table public.catalog_correction_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_id uuid not null references public.saas_products(id) on delete cascade,
  reported_by uuid not null references auth.users(id),
  report_type text not null check (report_type in (
    'wrong_category','incorrect_information','suspected_excluded_category',
    'duplicate','other')),
  field_key text,
  message text not null check (length(message) between 1 and 2000),
  status text not null default 'open' check (status in ('open','accepted','rejected')),
  resolved_by uuid references auth.users(id),
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_kind text not null check (actor_kind in ('user','platform_operator','server','worker')),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  request_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.rate_limit_counters (
  bucket_key text not null,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (bucket_key, window_start)
);

create index collections_workspace_idx on public.collections(workspace_id);
create index collection_items_workspace_idx on public.collection_items(workspace_id);
create index saved_searches_workspace_idx on public.saved_searches(workspace_id, created_at desc);
create index product_states_product_idx on public.workspace_product_states(product_id);
create index tag_assignments_workspace_idx on public.tag_assignments(workspace_id);
create index correction_reports_status_idx on public.catalog_correction_reports(status, created_at);
create index audit_logs_workspace_idx on public.audit_logs(workspace_id, created_at desc);

create trigger workspaces_updated_at before update on public.workspaces
for each row execute function private.set_updated_at();
create trigger collections_updated_at before update on public.collections
for each row execute function private.set_updated_at();
create trigger saved_searches_updated_at before update on public.saved_searches
for each row execute function private.set_updated_at();
create trigger product_states_updated_at before update on public.workspace_product_states
for each row execute function private.set_updated_at();
create trigger workspace_settings_updated_at before update on public.workspace_settings
for each row execute function private.set_updated_at();

-- Membership helpers: created after workspace_members exists.
-- No user-id parameter: the acting user is always auth.uid().
create or replace function private.is_workspace_member(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id and wm.user_id = auth.uid()
  );
$$;

create or replace function private.has_workspace_role(
  p_workspace_id uuid, p_roles public.workspace_role[])
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role = any(p_roles)
  );
$$;

create or replace function private.can_edit(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.has_workspace_role(p_workspace_id, array['owner','admin','member']::public.workspace_role[]);
$$;

create or replace function private.can_admin(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.has_workspace_role(p_workspace_id, array['owner','admin']::public.workspace_role[]);
$$;

revoke all on function private.is_workspace_member(uuid) from public;
revoke all on function private.has_workspace_role(uuid, public.workspace_role[]) from public;
revoke all on function private.can_edit(uuid) from public;
revoke all on function private.can_admin(uuid) from public;
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.has_workspace_role(uuid, public.workspace_role[]) to authenticated;
grant execute on function private.can_edit(uuid) to authenticated;
grant execute on function private.can_admin(uuid) to authenticated;

-- collection_items.workspace_id must match the collection (enforced by the
-- composite FK); tag_assignments likewise via (tag_id, workspace_id).

-- Atomic workspace bootstrap (callable by an authenticated user for
-- themselves only).
create or replace function public.create_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_max integer;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  if p_name is null or length(trim(p_name)) not between 1 and 120 then
    raise exception 'VALIDATION_ERROR: name' using errcode = '22023';
  end if;
  select (value #>> '{}')::integer into v_max
    from public.platform_limits where key = 'max_owned_workspaces_per_user';
  if (select count(*) from public.workspace_members
      where user_id = v_user and role = 'owner') >= coalesce(v_max, 5) then
    raise exception 'LIMIT_EXCEEDED: workspaces' using errcode = '54000';
  end if;

  insert into public.workspaces(name, created_by) values (trim(p_name), v_user) returning id into v_id;
  insert into public.workspace_members(workspace_id, user_id, role) values (v_id, v_user, 'owner');
  insert into public.workspace_settings(workspace_id, updated_by) values (v_id, v_user);
  insert into public.audit_logs(workspace_id, actor_user_id, actor_kind, action, resource_type, resource_id)
    values (v_id, v_user, 'user', 'workspace.create', 'workspace', v_id);
  return v_id;
end;
$$;
revoke all on function public.create_workspace(text) from public, anon;
grant execute on function public.create_workspace(text) to authenticated;
-- Note: platform_limits is created in M4; plpgsql bodies are resolved at
-- call time, so this function may be created in M3.

-- Ownership transfer: server-only (called by the API after authorization).
create or replace function public.sor_transfer_ownership(
  p_workspace_id uuid, p_current_owner uuid, p_new_owner uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.workspace_members
                 where workspace_id = p_workspace_id and user_id = p_current_owner and role = 'owner') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (select 1 from public.workspace_members
                 where workspace_id = p_workspace_id and user_id = p_new_owner) then
    raise exception 'NOT_FOUND: new owner is not a member' using errcode = '22023';
  end if;
  update public.workspace_members set role = 'admin'
    where workspace_id = p_workspace_id and user_id = p_current_owner;
  update public.workspace_members set role = 'owner'
    where workspace_id = p_workspace_id and user_id = p_new_owner;
  insert into public.audit_logs(workspace_id, actor_user_id, actor_kind, action, resource_type, resource_id, metadata)
    values (p_workspace_id, p_current_owner, 'user', 'workspace.transfer_ownership', 'workspace',
            p_workspace_id, jsonb_build_object('new_owner', p_new_owner));
end;
$$;
revoke all on function public.sor_transfer_ownership(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.sor_transfer_ownership(uuid, uuid, uuid) to service_role;

-- RLS and grants
do $$
declare t text;
begin
  foreach t in array array[
    'workspaces','workspace_members','workspace_settings','platform_operators',
    'collections','collection_items','saved_searches','workspace_product_states',
    'tags','tag_assignments','catalog_correction_reports','audit_logs','rate_limit_counters'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;
-- platform_operators, audit_logs, rate_limit_counters: server-only (no grants).

-- workspaces: read by members; rename by owner; creation only via create_workspace().
grant select on public.workspaces to authenticated;
grant update (name) on public.workspaces to authenticated;
create policy workspaces_select on public.workspaces for select to authenticated
  using (private.is_workspace_member(id));
create policy workspaces_update on public.workspaces for update to authenticated
  using (private.has_workspace_role(id, array['owner']::public.workspace_role[]))
  with check (private.has_workspace_role(id, array['owner']::public.workspace_role[]));

-- workspace_members: owner/admin manage non-owner members; nobody changes
-- their own role; owner rows change only through sor_transfer_ownership().
grant select, insert, delete on public.workspace_members to authenticated;
grant update (role) on public.workspace_members to authenticated;
create policy members_select on public.workspace_members for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy members_insert on public.workspace_members for insert to authenticated
  with check (private.can_admin(workspace_id) and role <> 'owner' and user_id <> auth.uid());
create policy members_update on public.workspace_members for update to authenticated
  using (private.can_admin(workspace_id) and role <> 'owner' and user_id <> auth.uid())
  with check (role <> 'owner');
create policy members_delete on public.workspace_members for delete to authenticated
  using (role <> 'owner'
         and (private.can_admin(workspace_id) or user_id = auth.uid()));

-- workspace_settings: members read; owner/admin update.
grant select on public.workspace_settings to authenticated;
grant update (research_preferences, ai_preferences, updated_by) on public.workspace_settings to authenticated;
create policy settings_select on public.workspace_settings for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy settings_update on public.workspace_settings for update to authenticated
  using (private.can_admin(workspace_id))
  with check (private.can_admin(workspace_id) and updated_by = auth.uid());

-- collections
grant select, insert, delete on public.collections to authenticated;
grant update (name, description) on public.collections to authenticated;
create policy collections_select on public.collections for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy collections_insert on public.collections for insert to authenticated
  with check (private.can_edit(workspace_id) and created_by = auth.uid());
create policy collections_update on public.collections for update to authenticated
  using (private.can_edit(workspace_id)) with check (private.can_edit(workspace_id));
create policy collections_delete on public.collections for delete to authenticated
  using (private.can_admin(workspace_id));

-- collection_items
grant select, insert, delete on public.collection_items to authenticated;
grant update (notes) on public.collection_items to authenticated;
create policy collection_items_select on public.collection_items for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy collection_items_insert on public.collection_items for insert to authenticated
  with check (private.can_edit(workspace_id) and added_by = auth.uid()
              and private.is_visible_product(product_id));
create policy collection_items_update on public.collection_items for update to authenticated
  using (private.can_edit(workspace_id)) with check (private.can_edit(workspace_id));
create policy collection_items_delete on public.collection_items for delete to authenticated
  using (private.can_edit(workspace_id));

-- saved_searches (viewers can read only; fixes v1.0 FOR ALL delete hole)
grant select, insert, delete on public.saved_searches to authenticated;
grant update (name, search_text, filters, sort_key, is_pinned) on public.saved_searches to authenticated;
create policy saved_searches_select on public.saved_searches for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy saved_searches_insert on public.saved_searches for insert to authenticated
  with check (private.can_edit(workspace_id) and created_by = auth.uid());
create policy saved_searches_update on public.saved_searches for update to authenticated
  using ((private.can_edit(workspace_id) and created_by = auth.uid()) or private.can_admin(workspace_id))
  with check ((private.can_edit(workspace_id) and created_by = auth.uid()) or private.can_admin(workspace_id));
create policy saved_searches_delete on public.saved_searches for delete to authenticated
  using ((private.can_edit(workspace_id) and created_by = auth.uid()) or private.can_admin(workspace_id));

-- workspace_product_states
grant select, insert, delete on public.workspace_product_states to authenticated;
grant update (status, is_favorite, is_hidden, personal_notes, last_viewed_at, updated_by)
  on public.workspace_product_states to authenticated;
create policy product_states_select on public.workspace_product_states for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy product_states_insert on public.workspace_product_states for insert to authenticated
  with check (private.can_edit(workspace_id) and updated_by = auth.uid()
              and private.is_visible_product(product_id));
create policy product_states_update on public.workspace_product_states for update to authenticated
  using (private.can_edit(workspace_id))
  with check (private.can_edit(workspace_id) and updated_by = auth.uid());
create policy product_states_delete on public.workspace_product_states for delete to authenticated
  using (private.can_admin(workspace_id));

-- tags and tag_assignments
grant select, insert, delete on public.tags to authenticated;
grant update (name, color) on public.tags to authenticated;
create policy tags_select on public.tags for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy tags_insert on public.tags for insert to authenticated
  with check (private.can_edit(workspace_id) and created_by = auth.uid());
create policy tags_update on public.tags for update to authenticated
  using (private.can_edit(workspace_id)) with check (private.can_edit(workspace_id));
create policy tags_delete on public.tags for delete to authenticated
  using (private.can_edit(workspace_id));

grant select, insert, delete on public.tag_assignments to authenticated;
create policy tag_assignments_select on public.tag_assignments for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy tag_assignments_insert on public.tag_assignments for insert to authenticated
  with check (private.can_edit(workspace_id) and assigned_by = auth.uid()
              and (product_id is null or private.is_visible_product(product_id)));
create policy tag_assignments_delete on public.tag_assignments for delete to authenticated
  using (private.can_edit(workspace_id));

-- catalog_correction_reports: members create; only operators resolve (server).
grant select on public.catalog_correction_reports to authenticated;
grant insert (workspace_id, product_id, reported_by, report_type, field_key, message)
  on public.catalog_correction_reports to authenticated;
create policy correction_reports_select on public.catalog_correction_reports for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy correction_reports_insert on public.catalog_correction_reports for insert to authenticated
  with check (private.can_edit(workspace_id) and reported_by = auth.uid()
              and private.is_visible_product(product_id));
```

Note: a product hidden from Discover because it became `needs_review`
or `excluded` after being saved stays in `collection_items` (history is
kept) but is rendered as "Unavailable (under review / excluded)"; it is
never analysable.

## M4 --- reference data

Seed only stable reference data (`CLAUDE.md` §15 Sprint 1). Development
fixtures go to `supabase/seed.sql` (local only) and are labelled as
fixtures.

``` sql
create table public.platform_limits (
  key text primary key check (key ~ '^[a-z_]{3,80}$'),
  value jsonb not null,
  description text not null,
  updated_at timestamptz not null default now()
);
alter table public.platform_limits enable row level security;
revoke all on table public.platform_limits from anon, authenticated;   -- server-only

create table public.exclusion_rules (
  id uuid primary key default gen_random_uuid(),
  rule_set_version text not null,
  rule_key text not null,
  rule_kind text not null check (rule_kind in ('excluded_category','core_purpose_phrase','review_phrase')),
  pattern text not null,
  outcome text not null check (outcome in ('excluded','needs_review','flag_only')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (rule_set_version, rule_key)
);
alter table public.exclusion_rules enable row level security;
revoke all on table public.exclusion_rules from anon, authenticated;   -- server-only, audit mirror

-- Non-AI defaults. AI budget defaults are inserted once the PD-08 benchmark
-- has fixed them (PD-24, pending).
insert into public.platform_limits(key, value, description) values
  ('max_owned_workspaces_per_user', '5', 'Workspaces a user may own'),
  ('max_concurrent_jobs_per_workspace', '3', 'Running jobs per workspace'),
  ('job_max_attempts', '5', 'Attempts before dead letter'),
  ('job_lease_seconds', '120', 'Lease and visibility timeout per heartbeat cycle'),
  ('job_heartbeat_seconds', '30', 'Heartbeat interval'),
  ('discovery_max_candidates', '100', 'Candidates per discovery run'),
  ('discovery_max_source_requests', '200', 'External requests per discovery run'),
  ('fetch_max_bytes', '5242880', 'Safe fetcher response limit (5 MiB)'),
  ('fetch_timeout_ms', '15000', 'Safe fetcher timeout'),
  ('fetch_max_redirects', '5', 'Safe fetcher redirect limit'),
  ('api_rate_limit_job_posts_per_hour', '30', 'Job-creating POSTs per user per hour');

-- Taxonomy (PRD §4.2.E). Child slugs are prefixed by the parent slug.
-- Developer Tools gets a negative priority weight (PRD: less prioritized
-- in default recommendations, still available through filters).
with parents(name, slug, weight) as (values
  ('Marketing & Growth','marketing-growth',10),
  ('Sales & CRM','sales-crm',0),
  ('Data & Analytics','data-analytics',5),
  ('Automation & AI','automation-ai',0),
  ('Business Operations','business-operations',0),
  ('E-commerce','ecommerce',0),
  ('Developer Tools','developer-tools',-50))
insert into public.categories(name, slug, priority_weight)
select name, slug, weight from parents;

with children(parent_slug, name, suffix) as (values
  ('marketing-growth','Marketing Automation','marketing-automation'),
  ('marketing-growth','Campaign Management','campaign-management'),
  ('marketing-growth','Marketing Analytics','marketing-analytics'),
  ('marketing-growth','Attribution','attribution'),
  ('marketing-growth','Conversion Optimization','conversion-optimization'),
  ('marketing-growth','Lead Generation','lead-generation'),
  ('marketing-growth','Lead Management','lead-management'),
  ('marketing-growth','Email Marketing','email-marketing'),
  ('marketing-growth','Social Media Management','social-media-management'),
  ('marketing-growth','SEO','seo'),
  ('marketing-growth','Content Marketing','content-marketing'),
  ('marketing-growth','Advertising Management','advertising-management'),
  ('marketing-growth','Marketing Intelligence','marketing-intelligence'),
  ('sales-crm','CRM','crm'),
  ('sales-crm','Sales Automation','sales-automation'),
  ('sales-crm','Sales Intelligence','sales-intelligence'),
  ('sales-crm','Lead Qualification','lead-qualification'),
  ('sales-crm','Customer Relationship Management','customer-relationship-management'),
  ('sales-crm','Sales Engagement','sales-engagement'),
  ('data-analytics','Business Intelligence','business-intelligence'),
  ('data-analytics','Data Analytics','data-analytics'),
  ('data-analytics','Reporting','reporting'),
  ('data-analytics','Dashboarding','dashboarding'),
  ('data-analytics','Data Integration','data-integration'),
  ('data-analytics','Data Visualization','data-visualization'),
  ('data-analytics','Monitoring','monitoring'),
  ('automation-ai','Workflow Automation','workflow-automation'),
  ('automation-ai','AI Agents','ai-agents'),
  ('automation-ai','AI Productivity','ai-productivity'),
  ('automation-ai','Business Process Automation','business-process-automation'),
  ('automation-ai','AI Analytics','ai-analytics'),
  ('business-operations','Project Management','project-management'),
  ('business-operations','Finance Operations','finance-operations'),
  ('business-operations','Customer Support','customer-support'),
  ('business-operations','Document Automation','document-automation'),
  ('business-operations','Business Management','business-management'),
  ('ecommerce','Store Management','store-management'),
  ('ecommerce','Conversion Optimization','conversion-optimization'),
  ('ecommerce','Customer Experience','customer-experience'),
  ('ecommerce','E-commerce Analytics','ecommerce-analytics'),
  ('ecommerce','Inventory Management','inventory-management'),
  ('developer-tools','API Platforms','api-platforms'),
  ('developer-tools','Developer Productivity','developer-productivity'),
  ('developer-tools','Monitoring','monitoring'),
  ('developer-tools','Infrastructure','infrastructure'))
insert into public.categories(parent_id, name, slug)
select p.id, c.name, c.parent_slug || '-' || c.suffix
from children c join public.categories p on p.slug = c.parent_slug;
-- e.g. 'data-analytics-data-analytics', 'ecommerce-conversion-optimization'.

-- Hidden, permanently excluded categories (PRD §1.3, §4.2.O; ADR-010).
-- Used only by the server-side classifier; never user-visible.
insert into public.categories(name, slug, is_user_visible, is_permanently_excluded, priority_weight) values
  ('Excluded: Affiliate Marketing','excluded-affiliate-marketing', false, true, -100),
  ('Excluded: Affiliate Networks','excluded-affiliate-networks', false, true, -100),
  ('Excluded: Partner Programs & Partner Management','excluded-partner-management', false, true, -100),
  ('Excluded: Partner Marketplaces','excluded-partner-marketplaces', false, true, -100),
  ('Excluded: Partner / Affiliate Attribution','excluded-partner-attribution', false, true, -100),
  ('Excluded: Partner / Affiliate Commissions & Payouts','excluded-partner-commissions-payouts', false, true, -100),
  ('Excluded: Referral / Affiliate Networks','excluded-referral-affiliate-networks', false, true, -100);

-- Source registry: every source starts as 'planned' and disabled. The
-- migration that ships a tested connector sets it to 'integrated'.
insert into public.sources(source_key, name, source_type, access_method, default_reliability_level) values
  ('manual_entry','Manual entry','manual_entry','manual_entry',4),
  ('user_import','User CSV import','user_import','user_import',4),
  ('official_website','Official website','official_website','official_website_fetch',1);
-- Third-party sources (Product Hunt, G2, Capterra, Reddit, X, LinkedIn,
-- Crunchbase, AlternativeTo, BuiltWith/Wappalyzer, Similarweb; PRD §13.1)
-- are inserted only after their terms review (PD-14 A; G2 first, pending
-- approval PD-26; Discovery search sources PD-28; ADR-013).

-- exclusion_rules mirrors packages/domain/src/exclusion (rule set 'excl-1');
-- §5.4 is the authoritative list. The code is the executor; this table is
-- the audit mirror and a pgTAP test checks both are in sync.
insert into public.exclusion_rules(rule_set_version, rule_key, rule_kind, pattern, outcome) values
  ('excl-1','R1','excluded_category','categories.is_permanently_excluded','excluded'),
  ('excl-1','R2','core_purpose_phrase','affiliate marketing|affiliate programs?|affiliate networks?|affiliate management|affiliate tracking|affiliate software|affiliate platform|affiliate attribution|affiliate commissions?|affiliate payouts?','excluded'),
  ('excl-1','R3','core_purpose_phrase','partner programs?|partner management|partner relationship management|PRM|partner ecosystem|partner marketplace|partner portal|channel partners?|partner attribution|partner commissions?|partner payouts?|partnership management|partnerships platform','excluded'),
  ('excl-1','R4','core_purpose_phrase','referral networks?|affiliate and referral|referral and affiliate','excluded'),
  ('excl-1','R5','core_purpose_phrase','(commission|payout) WITH (affiliate|partner) in the same core text','excluded'),
  ('excl-1','R6','review_phrase','commission management|sales commissions?|referral programs?|referral marketing|customer referrals?','flag_only'),  -- PD-11 A
  ('excl-1','R7','review_phrase','standalone affiliate (core texts) | standalone partners? (primary use case only)','needs_review'),
  ('excl-1','R8','review_phrase','R2-R5 phrases in description only','needs_review'),
  ('excl-1','R10','review_phrase','LLM core_purpose_flag = affiliate_or_partner','needs_review');
-- R9 (feature-only mention -> eligible + incidental flag) has no exclusion outcome.
```

Reliability note: manual entry and user import are reliability level 4
by default and produce `fact_status = 'declared'` evidence (PRD §13.2: a
declaration is not a verified fact). The importer may set level 1 only
for rows that reference an official source URL that the official-website
connector subsequently fetches and verifies.

## M5 --- jobs, agent steps, provider usage, queue

``` sql
create type public.job_kind as enum (
  'product_enrichment','product_refresh','source_sync','catalog_import',
  'feedback_import','discovery_run','pain_point_run','opportunity_analysis',
  'report_export','data_export'
);
create type public.job_state as enum (
  'queued','running','retrying','completed','partial','failed','cancelled','dead_letter'
);
create type public.terminal_reason as enum (
  'completed','partial','failed','cancelled','dead_letter','budget_exhausted'
);
create type public.run_status as enum (
  'queued','running','completed','partial','failed','cancelled','needs_review'
);

create table public.job_executions (
  id uuid primary key default gen_random_uuid(),
  job_kind public.job_kind not null,
  workspace_id uuid references public.workspaces(id) on delete cascade,  -- keeps the scoped idempotency index valid
  requested_by uuid references auth.users(id) on delete set null,
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  request_hash text not null check (length(request_hash) = 64),   -- sha256 hex of canonical payload
  payload jsonb not null default '{}'::jsonb,
  state public.job_state not null default 'queued',
  terminal_reason public.terminal_reason,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  queue_message_id bigint,
  lease_owner text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  next_attempt_at timestamptz,
  cancel_requested_at timestamptz,
  budget jsonb not null default '{}'::jsonb,
  usage jsonb not null default '{}'::jsonb,
  last_error_code text,
  last_error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((state in ('completed','partial','failed','cancelled','dead_letter')) = (terminal_reason is not null)),
  check (state <> 'running' or (lease_owner is not null and lease_expires_at is not null))
);
-- Idempotency is scoped to the workspace and the requester (fixes the
-- v1.0 global unique key, which could return another user's job).
create unique index job_idempotency_ws on public.job_executions(workspace_id, requested_by, job_kind, idempotency_key)
  where workspace_id is not null;
create unique index job_idempotency_system on public.job_executions(job_kind, idempotency_key)
  where workspace_id is null;
create index job_state_idx on public.job_executions(state, next_attempt_at);
create index job_lease_idx on public.job_executions(lease_expires_at) where state = 'running';

create table public.agent_step_runs (
  id uuid primary key default gen_random_uuid(),
  job_execution_id uuid not null references public.job_executions(id) on delete cascade,
  agent_key text not null,
  step_key text not null,
  contract_version text not null,
  prompt_version text,                 -- null only for deterministic steps
  state text not null default 'queued'
    check (state in ('queued','running','completed','failed','skipped')),
  attempt integer not null default 1,
  input_hash text,
  output_json jsonb,
  output_hash text,
  warnings jsonb not null default '[]'::jsonb,
  evidence_ids uuid[] not null default '{}',   -- trace only; authoritative links live in join tables
  provider text,
  model text,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(12,6),
  latency_ms integer,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (job_execution_id, agent_key, step_key),
  check (state <> 'completed' or output_json is not null)
);

alter table public.evidence_items
  add constraint evidence_extracted_by_step_fk
  foreign key (extracted_by_step_id) references public.agent_step_runs(id) on delete set null;

create table public.provider_usage (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  job_execution_id uuid references public.job_executions(id) on delete set null,
  agent_step_run_id uuid references public.agent_step_runs(id) on delete set null,
  provider text not null,
  model text not null,
  operation text not null check (operation in ('structured_output','embedding','repair')),
  input_tokens integer,
  output_tokens integer,
  estimated_cost_usd numeric(12,6),
  reported_cost_usd numeric(12,6),
  latency_ms integer,
  outcome text not null check (outcome in ('ok','schema_invalid','timeout','provider_error','budget_refused')),
  created_at timestamptz not null default now()
);

create index agent_step_job_idx on public.agent_step_runs(job_execution_id);
create index provider_usage_workspace_idx on public.provider_usage(workspace_id, created_at desc);
create index provider_usage_job_idx on public.provider_usage(job_execution_id);

do $$
declare t text;
begin
  foreach t in array array['job_executions','agent_step_runs','provider_usage'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;
-- Server-only: no grants to anon/authenticated. Progress is exposed through
-- API DTOs built from these tables and the run/analysis rows.
```

Queue setup (Sprint 3, after the PGMQ verification gate):

-   Enable the Supabase Queues / PGMQ extension through the supported
    Dashboard or CLI workflow for the target project and confirm the
    installed version and function signatures. Do not hand-create PGMQ
    tables.
-   Create one durable queue named `sor_jobs`.
-   Do not expose `pgmq_public` (or any queue function) to `anon` or
    `authenticated`.

Job RPCs (all `SECURITY DEFINER`, `SET search_path = ''`, `EXECUTE`
granted only to `service_role`). Signatures are normative; bodies are
implemented in Sprint 3 using the verified PGMQ API:

| Function | Behaviour |
|---|---|
| `private.create_job(p_kind, p_workspace_id, p_requested_by, p_idempotency_key, p_request_hash, p_payload) returns (job_id uuid, created boolean)` | Inserts with `on conflict do nothing`; on conflict returns the existing job if `request_hash` matches, otherwise raises `IDEMPOTENCY_CONFLICT` (mapped to HTTP 409). Enforces `max_concurrent_jobs_per_workspace` (raises `LIMIT_EXCEEDED`, HTTP 429). Sends `{schema_version:'job.v1', kind, job_execution_id}` to `sor_jobs` in the same transaction and stores the message ID. Internal: called by the domain request RPCs below. |
| `public.sor_request_*` (one per job kind, defined in the migration that owns the domain row) | Validates the domain rules that the database can check (visibility, exclusion status, workspace consistency), inserts the domain row (run/analysis) and calls `private.create_job` in one transaction. |
| `public.sor_worker_read(p_qty int, p_vt_seconds int)` | Reads messages from `sor_jobs` with a visibility timeout. |
| `public.sor_worker_claim(p_job_id uuid, p_worker_id text, p_lease_seconds int)` | Claims when state is `queued`/`retrying` and `next_attempt_at` has passed, or when `running` with an expired lease (stale recovery). Increments `attempt_count`; if it exceeds `max_attempts`, sets `dead_letter` and archives the message instead. Returns the job row or nothing. |
| `public.sor_worker_heartbeat(p_job_id, p_worker_id, p_lease_seconds, p_message_id)` | Extends the lease and the message visibility; returns `cancel_requested` so the worker can stop. |
| `public.sor_worker_retry(p_job_id, p_worker_id, p_delay_seconds, p_error_code, p_error_message)` | Sets `retrying`, `next_attempt_at`, clears the lease, delays the message visibility. |
| `public.sor_worker_finish(p_job_id, p_worker_id, p_state, p_terminal_reason, p_error_code, p_error_message)` | Terminal transition; archives the message; updates the owning run/analysis status in the same transaction. |
| `public.sor_worker_requeue_orphans(p_older_than_seconds int)` | Re-sends a message for `queued`/`retrying` jobs whose message is missing (outbox safety net). |
| `public.sor_worker_finish_poison(p_message_id bigint, p_reason text)` | Archives a message whose envelope fails `JobEnvelopeSchema` and writes an audit log; never retried. |
| `public.sor_request_job(p_kind, p_workspace_id, p_requested_by, p_idempotency_key, p_request_hash, p_payload jsonb)` | Generic request RPC for kinds without a domain row: `product_enrichment`, `product_refresh`, `catalog_import`, `feedback_import`, `report_export`, `data_export`, `source_sync`. Validates the payload references (visible product, analysis of the same workspace, uploaded file of the same workspace) and calls `private.create_job`. |
| `public.sor_manual_add_product(p_workspace_id, p_requested_by, p_entry jsonb, p_exclusion jsonb)` | Sprint 2. In one transaction: normalizes the URL, checks identifiers (returns the existing product on a match), creates the product, a `manual_entry` snapshot and `user_declared` evidence (`fact_status = 'declared'`), stores the exclusion assessment computed by the API with §5.4, and sets `record_status = 'active'` only if the outcome is `eligible`. |

## M6 --- Pain Point Intelligence

``` sql
create extension if not exists vector with schema extensions;   -- verify availability (Sprint 4)

create type public.frequency_label as enum ('isolated','recurring','widespread','unknown');
create type public.switching_intent as enum ('stated','not_stated','unknown');
create type public.cluster_review_status as enum ('machine_proposed','user_confirmed','user_corrected','rejected');
create type public.count_status as enum ('verified','estimated','unknown');
create type public.pain_scope_type as enum ('product','product_set','category');

-- Global, server-only: structured problems extracted from feedback.
create table public.feedback_problems (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.customer_feedback(id) on delete cascade,
  product_id uuid not null references public.saas_products(id) on delete cascade,
  is_primary boolean not null default false,
  problem_statement text not null check (length(problem_statement) between 1 and 1000),
  problem_category public.problem_category not null,
  feature_concerned text,
  user_profile text,
  severity smallint check (severity is null or severity between 1 and 5),
  declared_frequency text,
  operational_consequence text,
  workaround text,
  desired_solution text,
  switching_intent public.switching_intent not null default 'unknown',
  vendor_response text,
  resolution_status public.resolution_status not null default 'unknown',
  confidence numeric(5,2) not null check (confidence between 0 and 100),
  extractor_contract_version text not null,
  extractor_prompt_version text not null,
  agent_step_run_id uuid references public.agent_step_runs(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index feedback_one_primary_problem on public.feedback_problems(feedback_id) where is_primary;
create index feedback_problems_product_idx on public.feedback_problems(product_id, problem_category);

create or replace function private.trg_problem_product_consistency()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from public.customer_feedback f
                 where f.id = new.feedback_id and f.product_id = new.product_id) then
    raise exception 'EVIDENCE_SCOPE_VIOLATION: problem/product mismatch' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger feedback_problems_consistency before insert or update
on public.feedback_problems for each row execute function private.trg_problem_product_consistency();

-- Embedding dimensions depend on the model (PD-24); no ANN index until
-- the model is fixed. MVP volumes allow exact search.
create table public.feedback_problem_embeddings (
  problem_id uuid not null references public.feedback_problems(id) on delete cascade,
  embedding_model text not null,
  dimensions integer not null check (dimensions > 0),
  embedding extensions.vector not null,
  created_at timestamptz not null default now(),
  primary key (problem_id, embedding_model),
  check (extensions.vector_dims(embedding) = dimensions)
);

create table public.pain_point_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  title text not null check (length(title) between 1 and 200),
  scope_type public.pain_scope_type not null,
  scope_category_id uuid references public.categories(id),
  parameters jsonb not null default '{}'::jsonb,
  status public.run_status not null default 'queued',
  feedback_considered integer not null default 0,
  problems_extracted integer not null default 0,
  clusters_created integer not null default 0,
  opportunities_generated integer not null default 0,
  algorithm_version text,
  sources_report jsonb not null default '[]'::jsonb,
  limitations jsonb not null default '[]'::jsonb,
  error_summary text,
  job_execution_id uuid references public.job_executions(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  check ((scope_type = 'category') = (scope_category_id is not null))
);

-- Products in scope, frozen at request time.
create table public.pain_point_run_products (
  run_id uuid not null references public.pain_point_runs(id) on delete cascade,
  product_id uuid not null references public.saas_products(id) on delete restrict,
  total_known_review_count integer check (total_known_review_count is null or total_known_review_count >= 0),
  primary key (run_id, product_id)
);

create table public.pain_point_clusters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  run_id uuid not null,
  name text not null check (length(name) between 1 and 200),
  description text not null check (length(description) between 1 and 3000),
  problem_category public.problem_category not null,
  target_persona text,
  severity_score numeric(3,2) check (severity_score is null or severity_score between 1 and 5),
  frequency_label public.frequency_label not null default 'unknown',
  recurrence_score numeric(5,2) check (recurrence_score is null or recurrence_score between 0 and 100),
  feedback_count integer not null default 0 check (feedback_count >= 0),       -- raw volume
  distinct_author_count integer check (distinct_author_count is null or distinct_author_count >= 0),
  distinct_author_count_status public.count_status not null default 'unknown',
  distinct_company_count integer check (distinct_company_count is null or distinct_company_count >= 0),
  distinct_company_count_status public.count_status not null default 'unknown',
  affected_product_count integer not null default 0 check (affected_product_count >= 0),
  product_distribution jsonb not null default '[]'::jsonb,   -- [{product_id, count, relative_frequency|null}]
  resolution_breakdown jsonb not null default '{}'::jsonb,   -- {resolved, unresolved, unknown}
  existing_solutions jsonb not null default '[]'::jsonb,     -- evidence-linked summaries
  first_detected_at timestamptz not null default now(),
  last_observed_at timestamptz,
  confidence_score numeric(5,2) not null check (confidence_score between 0 and 100),
  review_status public.cluster_review_status not null default 'machine_proposed',
  algorithm_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (run_id, workspace_id) references public.pain_point_runs(id, workspace_id) on delete cascade,
  check ((distinct_author_count is null) = (distinct_author_count_status = 'unknown')),
  check ((distinct_company_count is null) = (distinct_company_count_status = 'unknown'))
);

create table public.pain_point_evidence (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.pain_point_clusters(id) on delete cascade,
  feedback_problem_id uuid not null references public.feedback_problems(id) on delete restrict,
  relevance_score numeric(5,2) check (relevance_score between 0 and 100),
  membership_confidence numeric(5,2) check (membership_confidence between 0 and 100),
  membership_source text not null check (membership_source in ('algorithm','verifier','user_correction')),
  removed_at timestamptz,
  removed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (cluster_id, feedback_problem_id)
);

-- A problem may only join a cluster whose run scope contains its product.
create or replace function private.trg_pain_evidence_scope()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.pain_point_clusters c
    join public.pain_point_run_products rp on rp.run_id = c.run_id
    join public.feedback_problems fp on fp.product_id = rp.product_id
    where c.id = new.cluster_id and fp.id = new.feedback_problem_id
  ) then
    raise exception 'EVIDENCE_SCOPE_VIOLATION: problem outside run scope' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger pain_point_evidence_scope before insert or update
on public.pain_point_evidence for each row execute function private.trg_pain_evidence_scope();

-- History (PRD §13.3).
create table public.pain_point_cluster_snapshots (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.pain_point_clusters(id) on delete cascade,
  observed_at timestamptz not null default now(),
  feedback_count integer not null,
  affected_product_count integer not null,
  distinct_author_count integer,
  distinct_company_count integer,
  resolution_breakdown jsonb not null
);

-- P8 output: market gaps (PRD §7.3.D.D, report "Market Gap Analysis").
create table public.market_gaps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  run_id uuid not null,
  title text not null check (length(title) between 1 and 200),
  gap_type text not null check (gap_type in ('shared_problem','requested_feature','manual_workflow',
                                             'user_workaround','switching_driver','unsatisfied_need')),
  description text not null,
  existing_solutions_observed jsonb not null default '[]'::jsonb,
  confidence numeric(5,2) not null check (confidence between 0 and 100),
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (run_id, workspace_id) references public.pain_point_runs(id, workspace_id) on delete cascade
);

create table public.market_gap_clusters (
  gap_id uuid not null,
  cluster_id uuid not null,
  workspace_id uuid not null,
  primary key (gap_id, cluster_id),
  foreign key (gap_id, workspace_id) references public.market_gaps(id, workspace_id) on delete cascade,
  foreign key (cluster_id, workspace_id) references public.pain_point_clusters(id, workspace_id) on delete cascade
);

create table public.market_gap_evidence (
  gap_id uuid not null references public.market_gaps(id) on delete cascade,
  evidence_item_id uuid not null references public.evidence_items(id) on delete restrict,
  support_type text not null default 'supports' check (support_type in ('supports','contradicts','context')),
  primary key (gap_id, evidence_item_id)
);

-- Gap evidence must concern a product of the run scope (or be market-level).
create or replace function private.trg_gap_evidence_scope()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.market_gaps g
    join public.evidence_items e on e.id = new.evidence_item_id
    where g.id = new.gap_id
      and e.verification_status <> 'rejected'
      and (e.product_id in (select rp.product_id from public.pain_point_run_products rp where rp.run_id = g.run_id)
           or (e.product_id is null and e.company_id is null and e.category_id is null)
           or (e.product_id is null and e.company_id is null
               and exists (select 1 from public.categories c where c.id = e.category_id and c.is_user_visible)
               and (e.category_id = (select r2.scope_category_id from public.pain_point_runs r2 where r2.id = g.run_id)
                    or e.category_id in (select pc.category_id from public.pain_point_run_products rp
                                         join public.product_categories pc on pc.product_id = rp.product_id
                                         where rp.run_id = g.run_id))))
  ) then
    raise exception 'EVIDENCE_SCOPE_VIOLATION: gap evidence outside run scope' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger market_gap_evidence_scope before insert or update
on public.market_gap_evidence for each row execute function private.trg_gap_evidence_scope();

create table public.generated_opportunities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_from_run_id uuid references public.pain_point_runs(id) on delete set null,
  name text not null check (length(name) between 1 and 200),
  description text not null,
  problem_statement text not null,
  target_persona text not null,
  proposed_solution text not null,
  value_proposition text not null,
  differentiation text not null,
  business_model_hypothesis text,
  pricing_hypothesis text,
  technical_feasibility_notes text,
  distribution_hypothesis text,
  validation_needed text not null,
  is_hypothesis boolean not null default true check (is_hypothesis),
  exclusion_status public.exclusion_status not null,
  status public.opportunity_status not null default 'discovered',
  is_favorite boolean not null default false,
  notes text check (notes is null or length(notes) <= 10000),
  generator_contract_version text not null,
  generator_prompt_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  check (exclusion_status in ('eligible','needs_review'))   -- excluded hypotheses are never stored
);

create table public.generated_opportunity_clusters (
  opportunity_id uuid not null,
  cluster_id uuid not null,
  workspace_id uuid not null,
  primary key (opportunity_id, cluster_id),
  foreign key (opportunity_id, workspace_id) references public.generated_opportunities(id, workspace_id) on delete cascade,
  foreign key (cluster_id, workspace_id) references public.pain_point_clusters(id, workspace_id) on delete cascade
);

create table public.generated_opportunity_products (
  opportunity_id uuid not null references public.generated_opportunities(id) on delete cascade,
  product_id uuid not null references public.saas_products(id) on delete restrict,
  role text not null check (role in ('evidence_source','existing_competitor')),
  primary key (opportunity_id, product_id, role)
);

alter table public.tag_assignments
  alter column product_id drop not null,
  add column generated_opportunity_id uuid,
  add constraint tag_assignment_opportunity_fk foreign key (generated_opportunity_id, workspace_id)
    references public.generated_opportunities(id, workspace_id) on delete cascade,
  add constraint tag_assignment_one_target check ((product_id is null) <> (generated_opportunity_id is null));
create unique index tag_assignments_opportunity_uniq on public.tag_assignments(tag_id, generated_opportunity_id)
  where generated_opportunity_id is not null;

-- PRD §19 "Les opportunités indépendantes peuvent être sauvegardées":
-- collections may hold generated opportunities too.
alter table public.collection_items
  alter column product_id drop not null,
  add column generated_opportunity_id uuid,
  add constraint collection_item_opportunity_fk foreign key (generated_opportunity_id, workspace_id)
    references public.generated_opportunities(id, workspace_id) on delete cascade,
  add constraint collection_item_one_target check ((product_id is null) <> (generated_opportunity_id is null));
create unique index collection_items_opportunity_uniq on public.collection_items(collection_id, generated_opportunity_id)
  where generated_opportunity_id is not null;
drop policy collection_items_insert on public.collection_items;
create policy collection_items_insert on public.collection_items for insert to authenticated
  with check (private.can_edit(workspace_id) and added_by = auth.uid()
              and (product_id is null or private.is_visible_product(product_id)));

create index pain_runs_workspace_idx on public.pain_point_runs(workspace_id, created_at desc);
create index clusters_workspace_idx on public.pain_point_clusters(workspace_id, run_id);
create index pain_evidence_cluster_idx on public.pain_point_evidence(cluster_id) where removed_at is null;
create index generated_opps_workspace_idx on public.generated_opportunities(workspace_id, created_at desc);
create trigger clusters_updated_at before update on public.pain_point_clusters
for each row execute function private.set_updated_at();
create trigger generated_opps_updated_at before update on public.generated_opportunities
for each row execute function private.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array[
    'feedback_problems','feedback_problem_embeddings','pain_point_runs','pain_point_run_products',
    'pain_point_clusters','pain_point_evidence','pain_point_cluster_snapshots',
    'market_gaps','market_gap_clusters','market_gap_evidence',
    'generated_opportunities','generated_opportunity_clusters','generated_opportunity_products'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;
-- feedback_problems, feedback_problem_embeddings: server-only.

grant select on public.pain_point_runs, public.pain_point_run_products, public.pain_point_clusters,
  public.pain_point_evidence, public.pain_point_cluster_snapshots, public.market_gaps,
  public.market_gap_clusters, public.market_gap_evidence, public.generated_opportunities,
  public.generated_opportunity_clusters, public.generated_opportunity_products to authenticated;
-- Users change only status and notes of generated opportunities directly;
-- cluster corrections go through the API (server recomputes counters).
grant update (status, is_favorite, notes) on public.generated_opportunities to authenticated;

create policy pain_runs_select on public.pain_point_runs for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy pain_run_products_select on public.pain_point_run_products for select to authenticated
  using (exists (select 1 from public.pain_point_runs r
                 where r.id = run_id and private.is_workspace_member(r.workspace_id)));
create policy clusters_select on public.pain_point_clusters for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy pain_evidence_select on public.pain_point_evidence for select to authenticated
  using (exists (select 1 from public.pain_point_clusters c
                 where c.id = cluster_id and private.is_workspace_member(c.workspace_id)));
create policy cluster_snapshots_select on public.pain_point_cluster_snapshots for select to authenticated
  using (exists (select 1 from public.pain_point_clusters c
                 where c.id = cluster_id and private.is_workspace_member(c.workspace_id)));
create policy market_gaps_select on public.market_gaps for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy market_gap_clusters_select on public.market_gap_clusters for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy market_gap_evidence_select on public.market_gap_evidence for select to authenticated
  using (exists (select 1 from public.market_gaps g
                 where g.id = gap_id and private.is_workspace_member(g.workspace_id)));
create policy generated_opps_select on public.generated_opportunities for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy generated_opps_update on public.generated_opportunities for update to authenticated
  using (private.can_edit(workspace_id)) with check (private.can_edit(workspace_id));
create policy generated_opp_clusters_select on public.generated_opportunity_clusters for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy generated_opp_products_select on public.generated_opportunity_products for select to authenticated
  using (exists (select 1 from public.generated_opportunities o
                 where o.id = opportunity_id and private.is_workspace_member(o.workspace_id)));

-- public.sor_request_pain_point_run(p_workspace_id, p_requested_by, p_idempotency_key,
--   p_request_hash, p_title, p_scope_type, p_product_ids uuid[], p_category_id, p_parameters)
-- service_role only: rejects non-visible products (EXCLUDED_SUBJECT / NOT_FOUND), a
-- category that is not user-visible or is permanently excluded (EXCLUDED_SUBJECT) and an
-- empty scope (VALIDATION_ERROR),
-- freezes pain_point_run_products, inserts the run, calls private.create_job.
```

## M7 --- opportunity analyses

``` sql
create type public.analysis_type as enum ('opportunity','comparison');
create type public.analysis_subject_type as enum (
  'product','product_set','category','pain_point_cluster','generated_opportunity'
);
create type public.analysis_verdict as enum ('build_candidate','validate_first','reject');
create type public.decision_band as enum ('reject','low_potential','to_investigate','interesting','priority');
create type public.assessment_status as enum ('assessed','insufficient_evidence');
create type public.dimension_key as enum (
  'customer_demand','willingness_to_pay','product_gap',
  'market_attractiveness','competitive_differentiation','feasibility_distribution'
);
create type public.finding_type as enum (
  'pain_point','opportunity','risk','competitor_gap','recommendation','kill_criterion'
);
create type public.kill_severity as enum ('critical','major','minor');

create table public.opportunity_analyses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  analysis_type public.analysis_type not null default 'opportunity',
  subject_type public.analysis_subject_type not null,
  subject_product_id uuid references public.saas_products(id) on delete restrict,
  subject_category_id uuid references public.categories(id) on delete restrict,
  subject_cluster_id uuid,
  subject_generated_opportunity_id uuid,
  subject_snapshot jsonb not null,          -- frozen description of the subject at request time
  analysis_version text not null,           -- orchestrator version
  scoring_rules_version text not null,
  analysis_depth text not null default 'deep' check (analysis_depth in ('quick','standard','deep')),
  target_market char(2) not null default 'FR' check (target_market ~ '^[A-Z]{2}$'),
  user_context jsonb not null default '{}'::jsonb,
  status public.run_status not null default 'queued',
  score_total numeric(5,2) check (score_total between 0 and 100),
  provisional_points numeric(5,2) check (provisional_points between 0 and 100),
  score_coverage numeric(5,2) check (score_coverage between 0 and 100),
  willingness_to_pay_score numeric(4,2) check (willingness_to_pay_score between 0 and 15),
  confidence_score numeric(5,2) check (confidence_score between 0 and 100),
  decision_band public.decision_band,
  verdict public.analysis_verdict,
  verdict_reasons jsonb not null default '[]'::jsonb,   -- ordered gate results
  executive_summary text,
  report_json jsonb,
  limitations jsonb not null default '[]'::jsonb,
  terminal_reason public.terminal_reason,
  job_execution_id uuid references public.job_executions(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (subject_cluster_id, workspace_id)
    references public.pain_point_clusters(id, workspace_id) on delete restrict,
  foreign key (subject_generated_opportunity_id, workspace_id)
    references public.generated_opportunities(id, workspace_id) on delete restrict,
  -- Exactly one subject shape.
  check (
    (subject_type = 'product' and subject_product_id is not null and subject_category_id is null
       and subject_cluster_id is null and subject_generated_opportunity_id is null)
    or (subject_type = 'product_set' and subject_product_id is null and subject_category_id is null
       and subject_cluster_id is null and subject_generated_opportunity_id is null)
    or (subject_type = 'category' and subject_category_id is not null and subject_product_id is null
       and subject_cluster_id is null and subject_generated_opportunity_id is null)
    or (subject_type = 'pain_point_cluster' and subject_cluster_id is not null and subject_product_id is null
       and subject_category_id is null and subject_generated_opportunity_id is null)
    or (subject_type = 'generated_opportunity' and subject_generated_opportunity_id is not null
       and subject_product_id is null and subject_category_id is null and subject_cluster_id is null)
  ),
  check (analysis_type <> 'comparison' or subject_type = 'product_set'),
  -- A final score exists only at full coverage, never normalised.
  check (score_total is null or score_coverage = 100),
  check (status <> 'completed' or report_json is not null),
  -- Opportunity analyses end with a verdict; comparisons (PRD §11, Phase 2)
  -- rank the set with evidence and carry no verdict or score.
  check (analysis_type <> 'opportunity' or status <> 'completed' or verdict is not null),
  check (analysis_type <> 'comparison' or (verdict is null and score_total is null)),
  -- Defence in depth for the BUILD CANDIDATE gate.
  check (verdict is distinct from 'build_candidate'
         or (score_total is not null and willingness_to_pay_score is not null
             and score_total >= 75 and willingness_to_pay_score >= 10)),
  check (decision_band is null or score_total is not null)
);

create table public.analysis_subject_products (
  analysis_id uuid not null references public.opportunity_analyses(id) on delete cascade,
  product_id uuid not null references public.saas_products(id) on delete restrict,
  role text not null check (role in ('subject','set_member','category_member','cluster_product',
                                     'opportunity_source','competitor')),
  primary key (analysis_id, product_id, role)
);

-- Evidence index of the analysis (report "Evidence index").
create table public.analysis_evidence (
  analysis_id uuid not null references public.opportunity_analyses(id) on delete cascade,
  evidence_item_id uuid not null references public.evidence_items(id) on delete restrict,
  added_by_step_id uuid references public.agent_step_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (analysis_id, evidence_item_id)
);

create or replace function private.trg_analysis_evidence_scope()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.evidence_items e
    where e.id = new.evidence_item_id
      and e.verification_status <> 'rejected'
      and (
        e.product_id in (select sp.product_id from public.analysis_subject_products sp
                         where sp.analysis_id = new.analysis_id)
        or (e.product_id is null and e.company_id in (
              select p.company_id from public.analysis_subject_products sp
              join public.saas_products p on p.id = sp.product_id
              where sp.analysis_id = new.analysis_id))
        or (e.product_id is null and e.company_id is null and e.category_id is null)   -- market-level
        or (e.product_id is null and e.company_id is null and e.category_id is not null  -- category-level
            and exists (select 1 from public.categories c where c.id = e.category_id and c.is_user_visible)
            and (e.category_id = (select a.subject_category_id from public.opportunity_analyses a
                                  where a.id = new.analysis_id)
                 or e.category_id in (select pc.category_id from public.analysis_subject_products sp
                                      join public.product_categories pc on pc.product_id = sp.product_id
                                      where sp.analysis_id = new.analysis_id)))
      )
  ) then
    raise exception 'EVIDENCE_SCOPE_VIOLATION: evidence % outside analysis % scope',
      new.evidence_item_id, new.analysis_id using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger analysis_evidence_scope before insert or update
on public.analysis_evidence for each row execute function private.trg_analysis_evidence_scope();

create table public.analysis_dimension_scores (
  analysis_id uuid not null references public.opportunity_analyses(id) on delete cascade,
  dimension_key public.dimension_key not null,
  weight smallint not null,
  assessment_status public.assessment_status not null,
  rating smallint check (rating between 0 and 5),   -- integer per PD-05
  weighted_points numeric(5,2) generated always as (rating * weight / 5.0) stored,
  explanation text not null check (length(explanation) between 1 and 3000),
  missing_information jsonb not null default '[]'::jsonb,
  proposed_by_step_id uuid references public.agent_step_runs(id) on delete set null,
  primary key (analysis_id, dimension_key),
  check (weight = case dimension_key
                    when 'customer_demand' then 20
                    when 'product_gap' then 20
                    else 15 end),
  -- Not assessed means no rating (never a silent zero).
  check ((assessment_status = 'assessed') = (rating is not null))
);

create table public.dimension_score_evidence (
  analysis_id uuid not null,
  dimension_key public.dimension_key not null,
  evidence_item_id uuid not null,
  support_type text not null default 'supports' check (support_type in ('supports','contradicts','context')),
  primary key (analysis_id, dimension_key, evidence_item_id),
  foreign key (analysis_id, dimension_key)
    references public.analysis_dimension_scores(analysis_id, dimension_key) on delete cascade,
  foreign key (analysis_id, evidence_item_id)
    references public.analysis_evidence(analysis_id, evidence_item_id) on delete restrict
);

-- An assessed dimension needs at least one supporting evidence item
-- (checked at commit).
create or replace function private.trg_dimension_requires_evidence()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.assessment_status = 'assessed' and not exists (
    select 1 from public.dimension_score_evidence d
    where d.analysis_id = new.analysis_id and d.dimension_key = new.dimension_key
      and d.support_type = 'supports'
  ) then
    raise exception 'EVIDENCE_REQUIRED: dimension % assessed without evidence', new.dimension_key
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;
create constraint trigger dimension_requires_evidence
after insert or update on public.analysis_dimension_scores
deferrable initially deferred
for each row execute function private.trg_dimension_requires_evidence();

create table public.analysis_findings (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.opportunity_analyses(id) on delete cascade,
  finding_type public.finding_type not null,
  title text not null check (length(title) between 1 and 200),
  description text not null check (length(description) between 1 and 3000),
  priority smallint check (priority between 1 and 5),
  confidence numeric(5,2) check (confidence between 0 and 100),
  is_hypothesis boolean not null,
  severity public.kill_severity,
  is_substantiated boolean,                 -- computed by the server for kill criteria
  dimension_key public.dimension_key,
  source_agent text not null,
  recommendation text,
  created_at timestamptz not null default now(),
  unique (id, analysis_id),
  check ((finding_type = 'kill_criterion') = (severity is not null)),
  check ((finding_type = 'kill_criterion') = (is_substantiated is not null))
);

create table public.finding_evidence (
  finding_id uuid not null,
  analysis_id uuid not null,
  evidence_item_id uuid not null,
  support_type text not null default 'supports' check (support_type in ('supports','contradicts','context')),
  relevance_score numeric(5,2) check (relevance_score between 0 and 100),
  primary key (finding_id, evidence_item_id),
  foreign key (finding_id, analysis_id) references public.analysis_findings(id, analysis_id) on delete cascade,
  foreign key (analysis_id, evidence_item_id)
    references public.analysis_evidence(analysis_id, evidence_item_id) on delete restrict
);

-- A non-hypothesis finding needs at least one evidence item (checked at commit).
create or replace function private.trg_finding_requires_evidence()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not new.is_hypothesis and not exists (
    select 1 from public.finding_evidence fe
    where fe.finding_id = new.id and fe.support_type = 'supports'
  ) then
    raise exception 'EVIDENCE_REQUIRED: finding % is not a hypothesis and has no evidence', new.id
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;
create constraint trigger finding_requires_evidence
after insert or update on public.analysis_findings
deferrable initially deferred
for each row execute function private.trg_finding_requires_evidence();

create index analyses_workspace_idx on public.opportunity_analyses(workspace_id, created_at desc);
create index analyses_product_idx on public.opportunity_analyses(subject_product_id, created_at desc);
create index analyses_cluster_idx on public.opportunity_analyses(subject_cluster_id);
create index analyses_generated_opp_idx on public.opportunity_analyses(subject_generated_opportunity_id);
create index analysis_subject_products_product_idx on public.analysis_subject_products(product_id);
create index findings_analysis_idx on public.analysis_findings(analysis_id);

do $$
declare t text;
begin
  foreach t in array array[
    'opportunity_analyses','analysis_subject_products','analysis_evidence',
    'analysis_dimension_scores','dimension_score_evidence','analysis_findings','finding_evidence'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
  end loop;
end $$;
-- No INSERT/UPDATE/DELETE grants for authenticated: analyses are created
-- through POST /analyses -> public.sor_request_analysis (service_role) and
-- written only by the worker. This removes the v1.0 hole that let a
-- browser insert a "completed" analysis with an arbitrary score.

create policy analyses_select on public.opportunity_analyses for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy analysis_subject_products_select on public.analysis_subject_products for select to authenticated
  using (exists (select 1 from public.opportunity_analyses a
                 where a.id = analysis_id and private.is_workspace_member(a.workspace_id)));
create policy analysis_evidence_select on public.analysis_evidence for select to authenticated
  using (exists (select 1 from public.opportunity_analyses a
                 where a.id = analysis_id and private.is_workspace_member(a.workspace_id)));
create policy dimension_scores_select on public.analysis_dimension_scores for select to authenticated
  using (exists (select 1 from public.opportunity_analyses a
                 where a.id = analysis_id and private.is_workspace_member(a.workspace_id)));
create policy dimension_evidence_select on public.dimension_score_evidence for select to authenticated
  using (exists (select 1 from public.opportunity_analyses a
                 where a.id = analysis_id and private.is_workspace_member(a.workspace_id)));
create policy findings_select on public.analysis_findings for select to authenticated
  using (exists (select 1 from public.opportunity_analyses a
                 where a.id = analysis_id and private.is_workspace_member(a.workspace_id)));
create policy finding_evidence_select on public.finding_evidence for select to authenticated
  using (exists (select 1 from public.opportunity_analyses a
                 where a.id = analysis_id and private.is_workspace_member(a.workspace_id)));

-- Analysis deletion (PRD §14.4, owner/admin) goes through the API with the
-- server client after authorization, and is audit-logged.

-- public.sor_request_analysis(p_workspace_id, p_requested_by, p_idempotency_key,
--   p_request_hash, p_analysis_type, p_subject jsonb, p_request jsonb)
-- service_role only. In one transaction it:
--   1. resolves the subject and its scope products (see §8.1),
--   2. rejects any scope product that is not visible (EXCLUDED_SUBJECT / NOT_FOUND),
--      a category subject that is not user-visible or is permanently excluded
--      (EXCLUDED_SUBJECT), and an empty scope (VALIDATION_ERROR),
--   3. rejects a cluster or generated opportunity from another workspace,
--   4. rejects a generated opportunity whose exclusion_status <> 'eligible',
--   5. inserts opportunity_analyses (+ subject_snapshot) and analysis_subject_products,
--   6. calls private.create_job('opportunity_analysis', ...).
```

## M8 --- discovery

``` sql
create table public.discovery_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  title text not null check (length(title) between 1 and 200),       -- PRD §6.4 "Intitulé"
  prompt text not null check (length(prompt) between 3 and 2000),
  explicit_filters jsonb not null default '{}'::jsonb,
  interpreted_filters jsonb,
  status public.run_status not null default 'queued',
  candidates_found integer not null default 0 check (candidates_found >= 0),
  duplicates_removed integer not null default 0 check (duplicates_removed >= 0),
  candidates_retained integer not null default 0 check (candidates_retained >= 0),
  candidates_rejected integer not null default 0 check (candidates_rejected >= 0),
  candidates_needs_review integer not null default 0 check (candidates_needs_review >= 0),
  sources_report jsonb not null default '[]'::jsonb,   -- per source: consulted/unavailable/limits/errors
  limitations jsonb not null default '[]'::jsonb,
  error_summary text,
  rerun_of_run_id uuid references public.discovery_runs(id) on delete set null,
  job_execution_id uuid references public.job_executions(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.discovery_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.discovery_runs(id) on delete cascade,
  product_id uuid not null references public.saas_products(id) on delete cascade,
  identity_decision text not null check (identity_decision in ('matched_existing','new','needs_review')),
  possible_duplicate_of_product_id uuid references public.saas_products(id),
  is_new_to_catalog boolean not null,                 -- PRD §6.5 new vs already known
  exclusion_status_at_run public.exclusion_status not null,
  fit_score numeric(5,2) check (fit_score between 0 and 100),     -- deterministic (§6.8)
  fit_coverage numeric(5,2) check (fit_coverage between 0 and 100), -- share of requested groups with known values
  fit_breakdown jsonb not null default '{}'::jsonb,
  confidence_score numeric(5,2) check (confidence_score between 0 and 100),
  recommendation_reason text,
  missing_information jsonb not null default '[]'::jsonb,
  review_status text not null default 'pending'
    check (review_status in ('pending','accepted','rejected','needs_review')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  unique (run_id, product_id),
  -- Only eligible candidates may carry a fit score or be accepted.
  check (exclusion_status_at_run = 'eligible' or (fit_score is null and review_status <> 'accepted'))
);

create table public.discovery_candidate_evidence (
  candidate_id uuid not null references public.discovery_candidates(id) on delete cascade,
  evidence_item_id uuid not null references public.evidence_items(id) on delete restrict,
  primary key (candidate_id, evidence_item_id)
);

create or replace function private.trg_candidate_evidence_scope()
returns trigger language plpgsql set search_path = ''
as $$
begin
  perform private.assert_evidence_for_product(
    new.evidence_item_id,
    (select c.product_id from public.discovery_candidates c where c.id = new.candidate_id));
  return new;
end;
$$;
create trigger candidate_evidence_scope before insert or update
on public.discovery_candidate_evidence for each row execute function private.trg_candidate_evidence_scope();

create index discovery_workspace_created_idx on public.discovery_runs(workspace_id, created_at desc);
create index discovery_candidates_run_idx on public.discovery_candidates(run_id, fit_score desc);

do $$
declare t text;
begin
  foreach t in array array['discovery_runs','discovery_candidates','discovery_candidate_evidence'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
  end loop;
end $$;

create policy discovery_runs_select on public.discovery_runs for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy discovery_candidates_select on public.discovery_candidates for select to authenticated
  using (exists (select 1 from public.discovery_runs r
                 where r.id = run_id and private.is_workspace_member(r.workspace_id)));
create policy discovery_candidate_evidence_select on public.discovery_candidate_evidence for select to authenticated
  using (exists (select 1 from public.discovery_candidates c
                 join public.discovery_runs r on r.id = c.run_id
                 where c.id = candidate_id and private.is_workspace_member(r.workspace_id)));
-- Candidate products themselves (record_status 'candidate') are not
-- readable through catalog RLS; the API returns them as DTOs to members of
-- the run's workspace. Candidate review (accept/reject) goes through the API.

-- public.sor_request_discovery_run(...) service_role only: inserts the run
-- and calls private.create_job('discovery_run', ...).
```

## M9 --- validation experiments (PRD Phase 3)

``` sql
create table public.validation_experiments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  generated_opportunity_id uuid,
  product_id uuid references public.saas_products(id) on delete restrict,
  analysis_id uuid,
  experiment_type text not null check (experiment_type in (
    'user_interviews','landing_page','demo','presale','pricing_test','paid_pilot','other')),
  target_persona text,
  hypothesis text not null,
  success_criteria text not null,
  failure_criteria text not null,
  sample_size integer check (sample_size is null or sample_size >= 0),
  participants_count integer check (participants_count is null or participants_count >= 0),
  positive_responses integer check (positive_responses is null or positive_responses >= 0),
  qualified_interviews integer check (qualified_interviews is null or qualified_interviews >= 0),
  pilots_started integer check (pilots_started is null or pilots_started >= 0),
  paying_customers integer check (paying_customers is null or paying_customers >= 0),
  revenue_generated numeric(12,2) check (revenue_generated is null or revenue_generated >= 0),
  revenue_currency char(3) check (revenue_currency is null or revenue_currency ~ '^[A-Z]{3}$'),
  result text not null default 'pending' check (result in ('pending','success','failure','inconclusive')),
  evidence_url text check (evidence_url is null or evidence_url ~* '^https?://'),
  proof_storage_path text,               -- PD-21: invoice / payment record (private bucket)
  proof_verified_by uuid references auth.users(id),   -- server/operator only
  proof_verified_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((proof_verified_by is null) = (proof_verified_at is null)),
  check (proof_verified_by is null or proof_storage_path is not null),
  foreign key (generated_opportunity_id, workspace_id)
    references public.generated_opportunities(id, workspace_id) on delete cascade,
  -- Same-workspace analysis only; SET NULL on the analysis column only (PostgreSQL 15+).
  foreign key (analysis_id, workspace_id)
    references public.opportunity_analyses(id, workspace_id) on delete set null (analysis_id),
  check ((generated_opportunity_id is null) <> (product_id is null)),
  check (revenue_generated is null or revenue_currency is not null)
);
alter table public.validation_experiments enable row level security;
revoke all on table public.validation_experiments from anon, authenticated;
grant select, delete on public.validation_experiments to authenticated;
grant insert (workspace_id, generated_opportunity_id, product_id, analysis_id, experiment_type,
  target_persona, hypothesis, success_criteria, failure_criteria, sample_size, participants_count,
  positive_responses, qualified_interviews, pilots_started, paying_customers, revenue_generated,
  revenue_currency, result, evidence_url, proof_storage_path, created_by, completed_at)
  on public.validation_experiments to authenticated;   -- proof_verified_* are server-only
-- workspace_id, created_by and the experiment's subject are immutable.
grant update (experiment_type, target_persona, hypothesis, success_criteria, failure_criteria,
  sample_size, participants_count, positive_responses, qualified_interviews, pilots_started,
  paying_customers, revenue_generated, revenue_currency, result, evidence_url, proof_storage_path,
  completed_at)
  on public.validation_experiments to authenticated;
create policy experiments_select on public.validation_experiments for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy experiments_insert on public.validation_experiments for insert to authenticated
  with check (private.can_edit(workspace_id) and created_by = auth.uid()
              and (product_id is null or private.is_visible_product(product_id)));
create policy experiments_update on public.validation_experiments for update to authenticated
  using (private.can_edit(workspace_id)) with check (private.can_edit(workspace_id));
create policy experiments_delete on public.validation_experiments for delete to authenticated
  using (private.can_admin(workspace_id));
```

Experiments are user-entered records (intentions, positive responses,
qualified interviews, pilots and payments are separate columns, PRD
§12.14). A paid experiment result is user-declared evidence; it can feed
a later analysis only through an evidence item of type `user_declared`.
**[ACCEPTED: PD-21 A, approved 4 Nov 2026]** A recorded payment counts
toward the paying-customer gate of §9 only with a proof document
(`proof_storage_path`, private bucket) checked by the platform operator
(`proof_verified_by`, `proof_verified_at`, set by the server only). It is
then recorded with `monetization_signal = 'payment_confirmed'`,
reliability level 2 (first-party record with proof), `fact_status =
'confirmed'` and `verification_status = 'verified'`. Without a checked
proof, it stays `declared` at reliability level 4 and cannot satisfy the
gate.

------------------------------------------------------------------------

# 4. Zod contracts --- canonical source of truth

Create these files under `packages/contracts/src`. Use `.strict()`
objects for every external input and every AI output.

## 4.0 Version-agnostic conventions

The latest Zod major is used **[ACCEPTED: PD-01]**; the exact version is
pinned in Sprint 0. Behaviour differences between majors could not be verified
from official documentation during consolidation (network policy), so
the contracts avoid constructs whose semantics are version-sensitive:

1.  **Object defaults use a factory that returns an already-parsed
    value**: `.default(() => Inner.parse({}))`, never `.default({})` on an
    object whose fields have their own defaults.
2.  **No `z.record()` keyed by an enum.** Use an explicit `z.object()`
    with optional keys.
3.  **URLs**: `HttpUrlSchema` restricts the protocol to `http:`/`https:`
    (plain `.url()` would accept `javascript:` and other schemes).
4.  **Query parameters** are strings; numeric query fields use
    `z.coerce.number()`.
5.  Sprint 0 adds a contract test suite that pins these behaviours
    (defaults applied, unknown keys rejected, non-http URLs rejected), so
    a Zod upgrade cannot silently change them.

**Verified in Sprint 0 on Zod 4.6.7**
(`packages/contracts/src/__tests__/zod-conventions.test.ts`):
`.default({})` does not apply inner defaults; `z.record(z.enum(...))`
requires every key; `z.coerce.number("")` returns `0`; `z.string().url()`
accepts `javascript:` URLs. The conventions above are therefore required,
not only precautionary.

## 4.1 `common.ts`

``` ts
import { z } from "zod";

export const UUIDSchema = z.string().uuid();
export const ISODateTimeSchema = z.string().datetime({ offset: true });
export const CountryCodeSchema = z.string().regex(/^[A-Za-z]{2}$/).transform(v => v.toUpperCase());
export const CurrencyCodeSchema = z.string().regex(/^[A-Za-z]{3}$/).transform(v => v.toUpperCase());
export const ConfidenceSchema = z.number().min(0).max(100);
export const SlugSchema = z.string().regex(/^[a-z0-9-]{1,220}$/);

export const HttpUrlSchema = z.string().max(2048).url().refine(u => {
  try { const p = new URL(u).protocol; return p === "http:" || p === "https:"; }
  catch { return false; }
}, { message: "Only http(s) URLs are allowed" });

export const FactStatusSchema = z.enum(["confirmed", "estimated", "declared", "unknown"]);
export const VerificationStatusSchema = z.enum([
  "unverified", "verified", "needs_review", "rejected", "stale"
]);
export const ReliabilityLevelSchema = z.number().int().min(1).max(4);

export const CursorPaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().max(1000).optional()          // opaque, signed by the server
}).strict();

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.object({}).passthrough().optional(),
    request_id: UUIDSchema
  }).strict()
}).strict();

/** Agents cite only identifiers they were given. */
export const EvidenceRefSchema = z.object({
  evidence_id: UUIDSchema,
  support_type: z.enum(["supports", "contradicts", "context"]).default("supports"),
  relevance_score: ConfidenceSchema.optional()
}).strict();

export const SnapshotRefSchema = z.object({
  source_snapshot_id: UUIDSchema,
  quote_or_locator: z.string().max(500).nullable()   // short locator, not a long copy
}).strict();
```

## 4.2 `catalog.ts`

``` ts
import { z } from "zod";
import { UUIDSchema, CountryCodeSchema, CurrencyCodeSchema, ConfidenceSchema,
         HttpUrlSchema, SlugSchema, ISODateTimeSchema } from "./common";

export const CompanyTypeSchema = z.enum(["independent", "subsidiary", "public_company", "unknown"]);
export const FundingStatusSchema = z.enum(["bootstrapped", "externally_funded", "unknown"]);
export const CustomerTypeSchema = z.enum(["b2b", "b2c", "b2b_b2c", "unknown"]);
// PRD §4.2.F; an empty array means unknown.
export const BillingModelSchema = z.enum([
  "monthly_subscription", "annual_subscription", "freemium", "free_trial",
  "usage_based", "per_user", "volume_based", "license", "other"
]);
export const PricingStatusSchema = z.enum(["free", "paid", "freemium", "custom", "unknown"]);
export const ProductStatusSchema = z.enum(["active", "beta", "discontinued", "unknown"]);
export const MaturityStageSchema = z.enum(["new", "launching", "established", "growing", "mature", "unknown"]);
export const PresenceStatusSchema = z.enum(["present", "not_observed", "unknown"]);
export const TechnologyTagSchema = z.enum([
  "web_app", "mobile_app", "api", "ai_native", "no_code_low_code", "browser_extension"
]);
export const IntegrationCategorySchema = z.enum([
  "crm", "ecommerce", "marketing", "analytics", "communication", "payments", "other"
]);
export const FeatureAvailabilitySchema = z.enum([
  "available", "beta", "planned", "removed", "not_observed", "unknown"
]);
export const RecordStatusSchema = z.enum(["candidate", "active", "needs_review", "archived", "merged"]);
export const ExclusionStatusSchema = z.enum(["unassessed", "eligible", "excluded", "needs_review"]);

/** Manual product entry (PRD §18 "Ajout manuel d'un SaaS"). User-declared. */
export const ManualProductEntrySchema = z.object({
  name: z.string().trim().min(1).max(200),
  website_url: HttpUrlSchema,
  company_name: z.string().trim().max(200).nullable().default(null),
  category_slugs: z.array(SlugSchema).max(5).default([]),
  short_description: z.string().trim().max(300).nullable().default(null),
  note: z.string().max(2000).nullable().default(null)
}).strict();

/** CSV cells: an empty cell is unknown (null), never 0. */
export const CsvNullableInt = z.preprocess(
  v => (v === "" || v === null || v === undefined) ? null : Number(v),
  z.number().int().min(0).nullable());
export const CsvNullableNumber = z.preprocess(
  v => (v === "" || v === null || v === undefined) ? null : Number(v),
  z.number().min(0).nullable());

/** One CSV row of a product import (PRD §18 "Import de données"). */
export const ProductImportRowSchema = z.object({
  name: z.string().trim().min(1).max(200),
  website_url: HttpUrlSchema,
  company_name: z.string().trim().max(200).nullable(),
  country_code: CountryCodeSchema.nullable(),
  employee_min: CsvNullableInt,
  employee_max: CsvNullableInt,
  category_slugs: z.array(SlugSchema).max(5),
  source_url: HttpUrlSchema.nullable()      // where the importer found the data
}).strict().superRefine((v, ctx) => {
  if (v.employee_min !== null && v.employee_max !== null && v.employee_min > v.employee_max) {
    ctx.addIssue({ code: "custom", path: ["employee_max"], message: "employee_max must be >= employee_min" });
  }
});

/** Server-internal write models (used by repositories; never accepted from browsers). */
export const ProductFeatureWriteSchema = z.object({
  product_id: UUIDSchema,
  name: z.string().min(1).max(160),
  description: z.string().max(3000).nullable(),
  feature_category: z.string().max(100).nullable(),
  is_primary: z.boolean(),
  availability: FeatureAvailabilitySchema,
  evidence_id: UUIDSchema.nullable(),
  confidence: ConfidenceSchema.nullable()
}).strict().refine(v => ["not_observed", "unknown"].includes(v.availability) || v.evidence_id !== null,
  { message: "Availability claims require evidence" });

export const PricingPlanWriteSchema = z.object({
  product_id: UUIDSchema,
  plan_name: z.string().min(1).max(120),
  billing_period: z.enum(["month", "year", "usage", "one_time", "custom", "unknown"]),
  price_amount: z.number().nonnegative().nullable(),
  currency: CurrencyCodeSchema.nullable(),
  price_per_user: z.boolean().nullable(),
  minimum_seats: z.number().int().positive().nullable(),
  has_free_trial: z.boolean().nullable(),
  has_free_plan: z.boolean().nullable(),
  custom_pricing: z.boolean().nullable(),
  is_entry_plan: z.boolean(),
  is_enterprise_plan: z.boolean(),
  evidence_id: UUIDSchema,
  checked_at: ISODateTimeSchema
}).strict().refine(v => v.price_amount === null || v.currency !== null,
  { message: "Currency required when price is known", path: ["currency"] });
```

Catalog DTOs (`api.ts`) expose, for every displayed field, its value,
`fact_status`, `verified_at` and the evidence IDs behind it (PRD §5.3
"Chaque donnée doit posséder une source et une date de vérification").
Unknown values are serialised as `null` with `fact_status: "unknown"`.

## 4.3 `filters.ts` --- catalog search and filters

Semantics (PRD §4.3): AND between groups, OR inside a group, permanent
exclusions always applied server-side, and **unknown handling chosen per
group** (`include_unknown`). Unknown is never treated as a match or a
non-match by default; the UI states which choice is active.

``` ts
import { z } from "zod";
import { CountryCodeSchema, SlugSchema } from "./common";
import { CustomerTypeSchema, BillingModelSchema, MaturityStageSchema,
         TechnologyTagSchema, IntegrationCategorySchema } from "./catalog";

const UnknownToggle = z.boolean().default(false);

const RangeSchema = z.object({
  min: z.number().int().min(0).optional(),
  max: z.number().int().min(0).optional()
}).strict().refine(r => r.min === undefined || r.max === undefined || r.min <= r.max,
  { message: "min must be <= max" });

export const TeamSizePresetSchema = z.enum(["1-5", "1-10", "1-20", "20-50", "50-100", "100+"]);
export const AgeBucketSchema = z.enum(["lt_1", "1_2", "2_5", "5_10", "gt_10"]);
// PRD §4.2.G bands, monthly entry price converted to EUR for filtering only.
export const PriceBandSchema = z.enum(["free", "lt_10", "10_30", "30_100", "100_500", "gt_500", "custom"]);
export const CommercialValidationSchema = z.enum([
  "paying_customers_confirmed", "customer_reviews", "testimonials", "case_studies",
  "paid_subscriptions", "traction_signals", "monetization_unverified", "insufficient_data"
]);
export const CompanyProfileSchema = z.enum([
  "founder_led", "indie_saas", "small_team", "independent", "funded",
  "bootstrapped", "subsidiary_or_group", "unknown"
]);
export const OpportunityFilterSchema = z.enum([
  "score_lt_50", "score_50_64", "score_65_74", "score_75_84", "score_85_100",
  "wtp_gte_10", "low_differentiation", "exploitable_competitive_weakness", "french_adaptation_potential"
]);
export const CommercialGeographySchema = z.enum([
  "present_us", "low_presence_europe", "low_presence_france", "no_french_version",
  "limited_french_competition", "french_adaptation_interesting"
]);
export const ComplaintCategorySchema = z.enum([
  "pricing", "ux", "missing_features", "bugs", "support", "integrations",
  "performance", "documentation", "customization", "complexity"
]);
// PRD §4.2.O configurable exclusions. Permanent exclusions are NOT
// representable here: they are a server-side domain constant.
export const ConfigurableExclusionSchema = z.enum([
  "b2c_only", "groups_and_large_companies", "free_without_monetization",
  "no_identifiable_activity", "too_recent_without_demand_proof",
  "very_technical_devtools", "already_analyzed_and_rejected"
]);

export const CatalogFiltersSchema = z.object({
  text: z.string().trim().max(500).optional(),
  customer_types: z.object({ values: z.array(CustomerTypeSchema.exclude(["unknown"])).max(3),
                             include_unknown: UnknownToggle }).strict().optional(),
  team_size: z.object({ presets: z.array(TeamSizePresetSchema).max(6).default([]),
                        custom: RangeSchema.optional(),
                        include_unknown: UnknownToggle }).strict().optional(),
  hq_countries: z.object({ values: z.array(CountryCodeSchema).max(50),
                           include_unknown: UnknownToggle }).strict().optional(),
  customer_countries: z.object({ values: z.array(CountryCodeSchema).max(50),
                                 include_unknown: UnknownToggle }).strict().optional(),
  france_presence: z.object({ value: z.enum(["present", "not_observed"]),
                              include_unknown: UnknownToggle }).strict().optional(),
  international_presence: z.object({ value: z.boolean(), include_unknown: UnknownToggle }).strict().optional(),
  age: z.object({ buckets: z.array(AgeBucketSchema).max(5).default([]),
                  founded_year: RangeSchema.optional(),
                  include_unknown: UnknownToggle }).strict().optional(),
  categories: z.object({ slugs: z.array(SlugSchema).min(1).max(50) }).strict().optional(),
  billing_models: z.object({ values: z.array(BillingModelSchema).max(9),
                             include_unknown: UnknownToggle }).strict().optional(),
  price_bands: z.object({ values: z.array(PriceBandSchema).max(7),
                          include_unknown: UnknownToggle }).strict().optional(),
  maturity: z.object({ values: z.array(MaturityStageSchema.exclude(["unknown"])).max(5),
                       include_unknown: UnknownToggle }).strict().optional(),
  commercial_validation: z.array(CommercialValidationSchema).max(8).optional(),
  company_profile: z.object({ values: z.array(CompanyProfileSchema).max(8),
                              include_unknown: UnknownToggle }).strict().optional(),
  opportunity: z.array(OpportunityFilterSchema).max(9).optional(),       // only analysed products match
  commercial_geography: z.array(CommercialGeographySchema).max(6).optional(),
  technology: z.object({ tags: z.array(TechnologyTagSchema).max(6).default([]),
                         integration_categories: z.array(IntegrationCategorySchema).max(7).default([])
                       }).strict().optional(),
  complaints: z.array(ComplaintCategorySchema).max(10).optional(),       // only products with feedback match
  configurable_exclusions: z.array(ConfigurableExclusionSchema).max(7).default([]),
  include_hidden: z.boolean().default(false)
}).strict();

export const CatalogSortSchema = z.enum([
  "newest", "recently_added", "relevance", "best_monetization_evidence", "smallest_team",
  "oldest", "most_recent_activity", "least_analyzed", "random", "ai_potential"
]);

export const CatalogQuerySchema = z.object({
  filters: CatalogFiltersSchema.default(() => CatalogFiltersSchema.parse({})),
  sort: CatalogSortSchema.default("relevance"),
  random_seed: z.number().int().min(0).max(2_147_483_647).optional(),  // stable pagination for "random"
  limit: z.number().int().min(1).max(100).default(30),
  cursor: z.string().max(1000).optional()
}).strict();
```

Deterministic definitions used by the filter engine
(`packages/domain/src/filters`):

| Filter value | Definition | Status |
|---|---|---|
| `small_team` | `employee_max <= 20` (PRD default range 1--20) | ACCEPTED: PRD §4.2.B, §21 |
| `independent` | `company_type = 'independent'` | ACCEPTED |
| `funded` / `bootstrapped` | `funding_status = 'externally_funded'` / `'bootstrapped'` | ACCEPTED |
| `subsidiary_or_group` | `company_type in ('subsidiary','public_company')` | ACCEPTED |
| `indie_saas` | `independent` AND `employee_max <= 20` AND `funding_status <> 'externally_funded'` | ACCEPTED: PD-17 A |
| `maturity` | Stored value set only from evidence-backed enrichment; no derivation rule | ACCEPTED: PD-17 A |
| `paying_customers_confirmed` | ≥1 visible evidence item with `monetization_signal in ('payment_confirmed','customer_verified')` and `verification_status = 'verified'` | ACCEPTED: PRD §4.2.I |
| `paid_subscriptions` | ≥1 current pricing plan with `price_amount > 0` (= paid plan offered, **not** proof of customers; label states this) | ACCEPTED: PRD §4.2.I |
| `monetization_unverified` | paid plan offered and no confirmed/verified monetization evidence | ACCEPTED |
| price bands | lowest current non-free monthly-equivalent price converted with the latest `fx_rates` row (indicative, PRD §4.2.G); `custom` = custom pricing only; currencies not covered stay unconverted | ACCEPTED: PD-20 A (ECB daily reference rates) |
| opportunity filters | latest completed analysis of the product in the workspace | ACCEPTED: PRD §4.2.K (organising only, not proof) |
| result count before applying | `GET .../products/count` with the same query | ACCEPTED: PRD §4.3 |

The set of filters shipped in the MVP ("filtres fondamentaux", PRD §18)
is **[ACCEPTED: PD-16 A + J, approved 4 Nov 2026]**: A, B, C
(headquarters country), D, E, F, G, I, J, O. Groups H, K, L, M, N remain
in the contract and ship in Phase 2.

## 4.4 `evidence.ts`

``` ts
import { z } from "zod";
import { UUIDSchema, ConfidenceSchema, ISODateTimeSchema, HttpUrlSchema,
         FactStatusSchema, VerificationStatusSchema, ReliabilityLevelSchema } from "./common";
import { CsvNullableNumber } from "./catalog";

export const ClaimTypeSchema = z.enum([
  "product_exists", "product_description", "category", "pricing", "paid_customer_signal",
  "customer_identity", "employee_count", "founding_year", "headquarters", "customer_country",
  "market_presence", "language", "platform", "feature", "integration", "maturity",
  "company_profile", "traction_signal", "customer_feedback", "customer_pain", "market_size",
  "market_trend", "competitor_relation", "localization", "funding", "traffic", "other"
]);

export const EvidenceTypeSchema = z.enum([
  "official_statement", "customer_review", "pricing_evidence", "customer_case_study",
  "public_metric", "technical_evidence", "market_evidence", "third_party_report",
  "user_declared", "inference"
]);

export const MonetizationSignalSchema = z.enum([
  "payment_confirmed", "customer_verified", "paid_plan_available",
  "purchase_intent", "problem_signal", "unknown"
]);

export const FetchStatusSchema = z.enum(["ok", "blocked", "unavailable", "not_supported", "rate_limited", "error"]);

/** Normalized output of every connector (never written by connectors themselves). */
export const SourceDocumentSchema = z.object({
  source_key: z.string().regex(/^[a-z0-9_]{2,60}$/),
  canonical_url: HttpUrlSchema,
  external_id: z.string().max(200).nullable(),
  title: z.string().max(500).nullable(),
  text: z.string().max(100_000),
  published_at: ISODateTimeSchema.nullable(),
  retrieved_at: ISODateTimeSchema,
  content_hash: z.string().regex(/^[a-f0-9]{64}$/),       // sha256 of normalized text
  fetch_status: FetchStatusSchema,
  http_status: z.number().int().nullable(),
  storage_permitted: z.enum(["full", "excerpt", "reference_only"]),
  metadata: z.object({}).passthrough().default(() => ({}))
}).strict();

/** Server-internal evidence write model. */
export const EvidenceWriteSchema = z.object({
  product_id: UUIDSchema.nullable(),
  company_id: UUIDSchema.nullable(),
  category_id: UUIDSchema.nullable(),
  source_snapshot_id: UUIDSchema,
  claim_type: ClaimTypeSchema,
  claim_text: z.string().min(1).max(5000),
  claim_value: z.object({}).passthrough().nullable(),
  evidence_type: EvidenceTypeSchema,
  fact_status: FactStatusSchema,
  monetization_signal: MonetizationSignalSchema.nullable(),
  reliability_level: ReliabilityLevelSchema,
  confidence: ConfidenceSchema.nullable(),
  verification_status: VerificationStatusSchema,
  verified_at: ISODateTimeSchema.nullable(),
  published_at: ISODateTimeSchema.nullable(),
  observed_at: ISODateTimeSchema,
  extraction_method: z.enum(["official_api", "structured_parse", "llm_extraction", "manual_entry", "user_import"])
}).strict().superRefine((v, ctx) => {
  if (v.product_id === null && v.company_id === null && v.category_id === null
      && !["market_size", "market_trend"].includes(v.claim_type)) {
    ctx.addIssue({ code: "custom", message: "Evidence needs a product, company, category or market scope" });
  }
  if (v.claim_type === "paid_customer_signal" && v.monetization_signal === null) {
    ctx.addIssue({ code: "custom", path: ["monetization_signal"], message: "Required for paid customer signals" });
  }
  if (v.monetization_signal && ["payment_confirmed", "customer_verified"].includes(v.monetization_signal)
      && v.reliability_level > 2) {
    ctx.addIssue({ code: "custom", path: ["reliability_level"],
      message: "Community or inferred sources cannot confirm payment (PRD §13.2)" });
  }
  if (v.verification_status === "verified" && v.verified_at === null) {
    ctx.addIssue({ code: "custom", path: ["verified_at"], message: "verified_at is required when verified" });
  }
  if (v.claim_type === "traffic" && v.fact_status !== "estimated") {
    ctx.addIssue({ code: "custom", path: ["fact_status"], message: "Traffic is always an estimate" });
  }
});

/** CSV feedback import row (PRD §18 import; rights declared per import). */
export const FeedbackImportRowSchema = z.object({
  product_slug: z.string().regex(/^[a-z0-9-]{1,220}$/),
  source_url: HttpUrlSchema,
  source_name: z.string().min(1).max(120),
  published_at: ISODateTimeSchema.nullable(),
  rating: CsvNullableNumber,                                  // from catalog.ts
  rating_scale_max: CsvNullableNumber.refine(v => v === null || v > 0, { message: "must be > 0" }),
  text: z.string().min(1).max(20_000),
  author_reference: z.string().max(200).nullable(),          // hashed before storage
  author_company: z.string().max(200).nullable()
}).strict();

export const FeedbackImportRequestSchema = z.object({
  rights_declaration: z.object({
    storage: z.enum(["full", "excerpt", "reference_only"]),
    author_reference_storage_permitted: z.boolean(),
    declared_basis: z.string().min(10).max(1000)              // why the importer may use this content
  }).strict()
}).strict();
```

## 4.5 `workspace.ts`

``` ts
import { z } from "zod";
import { UUIDSchema, SlugSchema } from "./common";
import { CatalogFiltersSchema, CatalogSortSchema, ConfigurableExclusionSchema } from "./filters";
import { BillingModelSchema } from "./catalog";

export const WorkspaceRoleSchema = z.enum(["owner", "admin", "member", "viewer"]);
export const OpportunityStatusSchema = z.enum([
  "discovered", "to_research", "analyzing", "validate", "validated", "rejected", "building"
]);

export const WorkspaceCreateSchema = z.object({ name: z.string().trim().min(1).max(120) }).strict();

export const MemberInviteSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(["admin", "member", "viewer"])          // owner is never assignable
}).strict();
export const MemberRoleUpdateSchema = z.object({ role: z.enum(["admin", "member", "viewer"]) }).strict();
export const OwnershipTransferSchema = z.object({ new_owner_user_id: UUIDSchema }).strict();

export const CollectionCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).nullable().default(null)
}).strict();
export const CollectionItemCreateSchema = z.object({
  product_id: UUIDSchema.optional(),
  generated_opportunity_id: UUIDSchema.optional(),
  notes: z.string().max(5000).nullable().default(null)
}).strict().refine(v => (v.product_id === undefined) !== (v.generated_opportunity_id === undefined),
  { message: "Exactly one of product_id or generated_opportunity_id" });
export const CollectionItemUpdateSchema = z.object({ notes: z.string().max(5000).nullable() }).strict();

export const SavedSearchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["catalog", "discovery"]).default("catalog"),
  search_text: z.string().max(2000).nullable().default(null),
  filters: CatalogFiltersSchema.default(() => CatalogFiltersSchema.parse({})),
  sort_key: CatalogSortSchema.default("relevance"),
  is_pinned: z.boolean().default(false)
}).strict();

export const ProductStatePatchSchema = z.object({
  status: OpportunityStatusSchema.optional(),
  is_favorite: z.boolean().optional(),
  is_hidden: z.boolean().optional(),
  personal_notes: z.string().max(10_000).nullable().optional()
}).strict().refine(v => Object.keys(v).length > 0, { message: "Empty patch" });

export const TagCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null)
}).strict();

export const CorrectionReportSchema = z.object({
  report_type: z.enum(["wrong_category", "incorrect_information", "suspected_excluded_category", "duplicate", "other"]),
  field_key: z.string().regex(/^[a-z_]{2,60}$/).nullable().default(null),
  message: z.string().trim().min(1).max(2000)
}).strict();

// PRD §14.1 — configurable preferences. Permanent exclusions are not part
// of this schema and cannot be expressed in it.
export const ResearchPreferencesSchema = z.object({
  priority_category_slugs: z.array(SlugSchema).max(50).default([]),
  priority_countries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(50).default(["US"]),
  team_size_max: z.number().int().min(1).max(100_000).nullable().default(20),
  customer_types: z.array(z.enum(["b2b", "b2c", "b2b_b2c"])).default(["b2b"]),
  configurable_exclusions: z.array(ConfigurableExclusionSchema).max(7).default([]),
  billing_models: z.array(BillingModelSchema).max(9).default([]),
  // PRD §14.1 "Seuil de validation": may only make BUILD stricter than the
  // locked thresholds of PRD §21 [ACCEPTED: PD-23 A].
  stricter_build_thresholds: z.object({
    min_score: z.number().int().min(75).max(100).default(75),
    min_wtp: z.number().int().min(10).max(15).default(10)
  }).strict().default(() => ({ min_score: 75, min_wtp: 10 })),
  adaptation_market: z.string().regex(/^[A-Z]{2}$/).default("FR")
}).strict();

// PRD §14.2. Budgets can only lower platform limits.
export const AiPreferencesSchema = z.object({
  preferred_profile_overrides: z.object({}).passthrough().default(() => ({})),
  analysis_mode: z.enum(["quick", "standard", "deep"]).default("deep"),
  min_sources: z.number().int().min(1).max(50).default(3),
  report_language: z.enum(["fr", "en"]).default("fr"),
  max_cost_usd_per_analysis: z.number().positive().nullable().default(null)
}).strict();
```

Direct Data API writes to `workspace_settings` and `saved_searches`
bypass Zod. Therefore the server re-validates these JSON values with the
schemas above every time it reads them (invalid values are ignored in
favour of defaults and reported to the user), and budgets are always
applied as `min(platform limit, workspace preference)` at use time.
Neither value can affect permanent exclusions, which are not
representable.

The pre-filled defaults above (B2B, US, 1--20 employees, FR adaptation
market) come from PRD §1.3 and §21. `report_language` defaults to `fr`
**[ASSUMPTION: the product owner writes in French; PRD §14.2 makes it
configurable]**.

## 4.6 `discovery.ts`

``` ts
import { z } from "zod";
import { UUIDSchema, ConfidenceSchema, HttpUrlSchema, SnapshotRefSchema } from "./common";
import { CatalogFiltersSchema } from "./filters";
import { BillingModelSchema } from "./catalog";
import { MonetizationSignalSchema } from "./evidence";

export const DiscoveryRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(3).max(2000),
  // Explicit filters reuse the catalog filter contract. There is no field
  // capable of removing permanent exclusions.
  filters: CatalogFiltersSchema.default(() => CatalogFiltersSchema.parse({})),
  max_results: z.number().int().min(1).max(100).default(30),
  depth: z.enum(["standard", "deep"]).default("standard"),
  rerun_of_run_id: UUIDSchema.optional()
}).strict();

/** D3 output: candidates cite the snapshots they were extracted from. */
export const ExtractedCandidateSchema = z.object({
  name: z.string().min(1).max(200),
  official_url: HttpUrlSchema.nullable(),         // null => candidate goes to review
  tagline: z.string().max(300).nullable(),
  description: z.string().max(5000).nullable(),
  company_name: z.string().max(200).nullable(),
  country_code: z.string().regex(/^[A-Z]{2}$/).nullable(),
  employee_min: z.number().int().min(0).nullable(),
  employee_max: z.number().int().min(0).nullable(),
  founder_led: z.boolean().nullable(),
  proposed_category_slugs: z.array(z.string()).max(10),
  proposed_primary_use_case: z.string().max(300).nullable(),   // input to the exclusion classifier
  core_purpose_flag: z.enum(["affiliate_or_partner", "not_affiliate_or_partner", "unknown"]),  // R10
  billing_models: z.array(BillingModelSchema).max(9),
  monetization_signal: MonetizationSignalSchema,
  citations: z.array(SnapshotRefSchema).min(1).max(30)
}).strict();

export const CandidateExtractionOutputSchema = z.object({
  candidates: z.array(ExtractedCandidateSchema).max(50),
  ignored_mentions: z.array(z.object({
    name: z.string().max(200),
    reason: z.enum(["insufficient_identity", "not_a_product", "generic_mention", "other"])
  }).strict()).max(100),
  injection_suspected: z.boolean()                 // source text contained instructions
}).strict();

export const DiscoveryRunStatusSchema = z.enum([
  "queued", "running", "completed", "partial", "failed", "cancelled", "needs_review"
]);

export const CandidateReviewSchema = z.object({
  decision: z.enum(["accept", "reject"]),
  reason: z.string().max(1000).nullable().default(null)
}).strict();

export type DiscoveryRequest = z.infer<typeof DiscoveryRequestSchema>;
export type ExtractedCandidate = z.infer<typeof ExtractedCandidateSchema>;
```

The fit score is **not** in any AI contract: it is computed by
`packages/domain/src/fit` (§6.8). (v1.0 had `fit_score` in the LLM
candidate schema, contradicting its own §6.8.)

## 4.7 `pain-points.ts`

``` ts
import { z } from "zod";
import { UUIDSchema, ConfidenceSchema, EvidenceRefSchema } from "./common";

export const ProblemCategorySchema = z.enum([
  "pricing", "ux", "missing_features", "bugs", "support", "integrations",
  "performance", "documentation", "customization", "complexity", "reliability", "other"
]);

export const PainPointRunRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  scope: z.discriminatedUnion("type", [
    z.object({ type: z.literal("product"), product_id: UUIDSchema }).strict(),
    z.object({ type: z.literal("product_set"), product_ids: z.array(UUIDSchema).min(2).max(20) }).strict(),
    z.object({ type: z.literal("category"), category_slug: z.string().min(1) }).strict()
  ]),
  max_feedback_items: z.number().int().min(10).max(2000).default(500)
}).strict();

/** P3 output: one call per feedback item; unknown fields stay null. */
export const ProblemExtractionOutputSchema = z.object({
  feedback_id: UUIDSchema,
  problems: z.array(z.object({
    is_primary: z.boolean(),
    problem_statement: z.string().min(1).max(1000),
    problem_category: ProblemCategorySchema,
    feature_concerned: z.string().max(200).nullable(),
    user_profile: z.string().max(200).nullable(),
    severity: z.number().int().min(1).max(5).nullable(),
    declared_frequency: z.string().max(200).nullable(),
    operational_consequence: z.string().max(500).nullable(),
    workaround: z.string().max(500).nullable(),
    desired_solution: z.string().max(500).nullable(),
    switching_intent: z.enum(["stated", "not_stated", "unknown"]),
    vendor_response: z.string().max(1000).nullable(),
    resolution_status: z.enum(["resolved", "unresolved", "unknown"]),
    confidence: ConfidenceSchema
  }).strict()).max(5),                          // zero problems is valid (positive review)
  injection_suspected: z.boolean()
}).strict().refine(v => v.problems.filter(p => p.is_primary).length <= 1,
  { message: "At most one primary problem" });

/** P6 output: semantic verification of one algorithmic cluster. */
export const ClusterVerificationOutputSchema = z.object({
  cluster_ref: z.string().min(1),
  is_coherent: z.boolean(),
  proposed_name: z.string().min(1).max(200),
  proposed_description: z.string().min(1).max(3000),
  target_persona: z.string().max(200).nullable(),
  outlier_problem_ids: z.array(UUIDSchema).max(200),   // removed from the cluster, never merged elsewhere automatically
  split_proposal: z.array(z.object({
    name: z.string().max(200),
    problem_ids: z.array(UUIDSchema).min(1)
  }).strict()).max(5),
  confidence: ConfidenceSchema
}).strict();

/** P8 output: gaps across competitors, evidence-linked. */
export const MarketGapOutputSchema = z.object({
  gaps: z.array(z.object({
    title: z.string().min(1).max(200),
    gap_type: z.enum(["shared_problem", "requested_feature", "manual_workflow",
                      "user_workaround", "switching_driver", "unsatisfied_need"]),
    cluster_ids: z.array(UUIDSchema).min(1),
    description: z.string().min(1).max(3000),
    existing_solutions_observed: z.array(z.string().max(300)).max(10),
    // "No solution observed" is not evidence of no competition.
    absence_of_solution_is_verified: z.literal(false),
    evidence: z.array(EvidenceRefSchema).min(1).max(30),
    confidence: ConfidenceSchema
  }).strict()).max(20)
}).strict();

/** P9 output: independent SaaS opportunity hypotheses (unscored). */
export const OpportunityHypothesisOutputSchema = z.object({
  hypotheses: z.array(z.object({
    name: z.string().min(1).max(200),
    description: z.string().min(1).max(2000),
    problem_statement: z.string().min(1).max(2000),
    target_persona: z.string().min(1).max(300),        // ICP
    proposed_solution: z.string().min(1).max(3000),
    value_proposition: z.string().min(1).max(1000),
    differentiation: z.string().min(1).max(2000),
    existing_competitor_product_ids: z.array(UUIDSchema).max(20),
    business_model_hypothesis: z.string().max(500).nullable(),
    pricing_hypothesis: z.string().max(500).nullable(),
    technical_feasibility_notes: z.string().max(1000).nullable(),
    distribution_hypothesis: z.string().max(1000).nullable(),
    validation_needed: z.string().min(1).max(2000),
    source_cluster_ids: z.array(UUIDSchema).min(1),
    primary_use_case: z.string().min(1).max(300),      // input to the exclusion classifier
    core_purpose_flag: z.enum(["affiliate_or_partner", "not_affiliate_or_partner", "unknown"])  // R10
  }).strict()).max(10)
}).strict();

export const ClusterCorrectionSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(3000).optional(),
  review_status: z.enum(["user_confirmed", "user_corrected", "rejected"]).optional(),
  remove_problem_ids: z.array(UUIDSchema).max(500).default([]),
  move_problem_ids_to_cluster: z.object({
    target_cluster_id: UUIDSchema, problem_ids: z.array(UUIDSchema).min(1).max(500)
  }).strict().optional()
}).strict();
```

## 4.8 `analysis.ts`

``` ts
import { z } from "zod";
import { UUIDSchema, ConfidenceSchema, EvidenceRefSchema } from "./common";

export const AnalysisSubjectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("product"), product_id: UUIDSchema }).strict(),
  z.object({ type: z.literal("product_set"), product_ids: z.array(UUIDSchema).min(2).max(10) }).strict(),
  z.object({ type: z.literal("category"), category_slug: z.string().min(1) }).strict(),
  z.object({ type: z.literal("pain_point_cluster"), cluster_id: UUIDSchema }).strict(),
  z.object({ type: z.literal("generated_opportunity"), generated_opportunity_id: UUIDSchema }).strict()
]);

const AnalysisContextSchema = z.object({
  priority: z.enum(["commercial_opportunity", "product_improvement", "market_entry"]).default("commercial_opportunity"),
  preferred_customer_type: z.enum(["b2b", "b2c", "b2b_b2c"]).default("b2b"),
  target_country: z.string().regex(/^[A-Z]{2}$/).default("FR"),
  budget_note: z.string().max(300).nullable().default(null),          // PRD §7.2 "Budget"
  technical_level_note: z.string().max(300).nullable().default(null), // PRD §7.2 "Niveau technique"
  product_type_note: z.string().max(300).nullable().default(null),
  constraints: z.array(z.string().max(300)).max(20).default([])
}).strict();

const AnalysisOptionsSchema = z.object({
  analyze_competitors: z.boolean().default(true),
  analyze_customer_reviews: z.boolean().default(true),
  analyze_local_market: z.boolean().default(true),
  generate_validation_plan: z.boolean().default(true)
}).strict();

export const AnalysisRequestSchema = z.object({
  analysis_type: z.enum(["opportunity", "comparison"]).default("opportunity"),
  subject: AnalysisSubjectSchema,
  analysis_depth: z.enum(["quick", "standard", "deep"]).default("deep"),
  context: AnalysisContextSchema.default(() => AnalysisContextSchema.parse({})),
  options: AnalysisOptionsSchema.default(() => AnalysisOptionsSchema.parse({}))
}).strict().refine(v => v.analysis_type !== "comparison" || v.subject.type === "product_set",
  { message: "A comparison needs a product set" });

export const DimensionKeySchema = z.enum([
  "customer_demand", "willingness_to_pay", "product_gap",
  "market_attractiveness", "competitive_differentiation", "feasibility_distribution"
]);

/** Proposal by the scoring-input agent; validated and recomputed by the server. */
export const DimensionAssessmentProposalSchema = z.discriminatedUnion("assessment_status", [
  z.object({
    dimension_key: DimensionKeySchema,
    assessment_status: z.literal("assessed"),
    rating: z.number().int().min(0).max(5),              // integer per PD-05
    explanation: z.string().min(1).max(3000),
    evidence: z.array(EvidenceRefSchema).min(1).max(30),
    missing_information: z.array(z.string().max(500)).max(20).default([])
  }).strict(),
  z.object({
    dimension_key: DimensionKeySchema,
    assessment_status: z.literal("insufficient_evidence"),
    explanation: z.string().min(1).max(3000),
    evidence: z.array(EvidenceRefSchema).max(30).default([]),
    missing_information: z.array(z.string().max(500)).min(1).max(20)
  }).strict()
]);

export const FindingSchema = z.object({
  type: z.enum(["pain_point", "opportunity", "risk", "competitor_gap", "recommendation", "kill_criterion"]),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(3000),
  priority: z.number().int().min(1).max(5),
  confidence: ConfidenceSchema,
  is_hypothesis: z.boolean(),
  severity: z.enum(["critical", "major", "minor"]).nullable(),   // required for kill criteria
  dimension_key: DimensionKeySchema.nullable(),
  evidence: z.array(EvidenceRefSchema).max(30)
}).strict().superRefine((v, ctx) => {
  if ((v.type === "kill_criterion") !== (v.severity !== null)) {
    ctx.addIssue({ code: "custom", path: ["severity"], message: "Severity is required for kill criteria only" });
  }
  if (!v.is_hypothesis && v.evidence.filter(e => e.support_type === "supports").length === 0) {
    ctx.addIssue({ code: "custom", path: ["evidence"], message: "Non-hypothesis findings need supporting evidence" });
  }
});

export const AnalysisVerdictSchema = z.enum(["build_candidate", "validate_first", "reject"]);
export const DecisionBandSchema = z.enum(["reject", "low_potential", "to_investigate", "interesting", "priority"]);

export type AnalysisRequest = z.infer<typeof AnalysisRequestSchema>;
export type AnalysisVerdict = z.infer<typeof AnalysisVerdictSchema>;
```

## 4.9 `agents/*.ts` --- per-agent output contracts

v1.0 had one monolithic `AnalysisAgentOutputSchema`, which contradicted
the agent-by-agent design. v1.1 defines one contract per agent; each is
versioned (`contract_version`, e.g. `o1.product-analysis.v1`) and stored
with each step.

| Agent | Contract | Key fields |
|---|---|---|
| D1 Query Planner | `QueryPlanSchema` | `interpreted_intent`, `mandatory_constraints[]`, `optional_preferences[]`, `category_slugs[]`, `queries_by_source[{source_key, queries[1..10]}]`, `max_candidates` (no exclusion field: exclusions are appended by the server) |
| D3 Candidate Extractor | `CandidateExtractionOutputSchema` (§4.6) | candidates citing snapshots |
| D5 Enrichment | `EnrichmentClaimsSchema` | `claims[{field_key, claim_type, value, fact_status, citation: SnapshotRef, confidence}]`, `primary_use_case`, `core_purpose_flag` (R10) |
| D6 Evidence Verifier | `EvidenceVerificationSchema` | per evidence: `supported`, `verification_status`, `reliability_level`, `contradicts_evidence_ids[]`, `stale` |
| P3 Problem Extractor | `ProblemExtractionOutputSchema` (§4.7) | |
| P6 Cluster Verifier | `ClusterVerificationOutputSchema` (§4.7) | |
| P8 Gap Identifier | `MarketGapOutputSchema` (§4.7) | |
| P9 Opportunity Generator | `OpportunityHypothesisOutputSchema` (§4.7) | |
| O1 Product Analyst | `ProductAnalysisSchema` | `positioning`, `target_customer`, `core_jtbd`, `features_observed[]`, `features_not_observed[]`, `pricing_model`, `integrations[]`, `limitations[]` (each evidence-linked or `is_hypothesis`), `evidence_gaps[]` |
| O2 Market Analyst | `MarketAnalysisSchema` | `market_definition`, `segments[]`, `demand_signals[]`, `spend_signals[]`, `trends[{statement, as_of, evidence}]`, `competitive_intensity`, `market_size: {status: 'estimated'|'insufficient_data', value?, methodology?, evidence[]}` |
| O3 Customer Voice Analyst | `CustomerVoiceSchema` | `top_problems[≤5]` referencing cluster IDs, `relevant_source_count`, `distinct_author_count|null`, `sample_limitations`, `examples[evidence]` |
| O4 Competitor Analyst | `CompetitorAnalysisSchema` | `competitors[{product_id|null, name, website_url, relationship_type, segment_facets[] ('cheaper','more_advanced','free','french','us'), positioning, target_segment, pricing_evidence, feature_overlap, differentiators, weaknesses(evidenced), evidence, confidence}]`, `omitted_excluded_count` |
| O5 Localization Analyst | `LocalizationSchema` | `french_availability`, `french_competitors[]`, `local_needs[]`, `local_integrations[]`, `language_support_expectations`, `regulatory_notes[]`, `pricing_distribution_notes`, `unmet_need_beyond_translation: {exists: boolean|null, evidence}` |
| O6 WTP & Feasibility | `WtpFeasibilitySchema` | `wtp_evidence[{category: MonetizationSignal, evidence}]` (counts per category, never one unqualified count), `feasibility{technical_complexity, dependencies, build_effort, operating_cost, data_access_risk, distribution_access, switching_cost, support_burden}`, `assumptions[]`, `uncertainty` |
| O7 Scoring-input agent | `z.array(DimensionAssessmentProposalSchema).length(6)` | one proposal per dimension (§4.8) |
| O8 Red-Team Verifier | `RedTeamSchema` | below |
| O9 Report Composer | `AnalysisReportSchema` | sections of PRD §9; every factual sentence carries `evidence_ids[]` or `is_hypothesis: true` |

``` ts
export const RedTeamSchema = z.object({
  strongest_counterarguments: z.array(z.object({
    argument: z.string().min(1).max(1000),
    evidence: z.array(EvidenceRefSchema).max(10)
  }).strict()).min(1).max(20),                  // at least one material counterargument
  kill_criteria: z.array(z.object({
    criterion: z.string().min(1).max(300),
    severity: z.enum(["critical", "major", "minor"]),
    explanation: z.string().min(1).max(2000),
    evidence: z.array(EvidenceRefSchema).max(20)
  }).strict()).max(20),
  unresolved_assumptions: z.array(z.string().max(500)).max(30),
  recommended_verdict: z.enum(["build_candidate", "validate_first", "reject"]),   // advisory only
  confidence: ConfidenceSchema
}).strict();
```

## 4.10 `jobs.ts`

``` ts
import { z } from "zod";
import { UUIDSchema } from "./common";

const Base = { schema_version: z.literal("job.v1"), job_execution_id: UUIDSchema };

export const JobEnvelopeSchema = z.discriminatedUnion("kind", [
  z.object({ ...Base, kind: z.literal("product_enrichment") }).strict(),
  z.object({ ...Base, kind: z.literal("product_refresh") }).strict(),
  z.object({ ...Base, kind: z.literal("source_sync") }).strict(),
  z.object({ ...Base, kind: z.literal("catalog_import") }).strict(),
  z.object({ ...Base, kind: z.literal("feedback_import") }).strict(),
  z.object({ ...Base, kind: z.literal("discovery_run") }).strict(),
  z.object({ ...Base, kind: z.literal("pain_point_run") }).strict(),
  z.object({ ...Base, kind: z.literal("opportunity_analysis") }).strict(),
  z.object({ ...Base, kind: z.literal("report_export") }).strict(),
  z.object({ ...Base, kind: z.literal("data_export") }).strict()
]);
export type JobEnvelope = z.infer<typeof JobEnvelopeSchema>;
```

The envelope carries only the job ID; the handler loads the job row and
its `payload` (the entity IDs) from the database, so a queue message can
never smuggle parameters that bypass the API validation.

## 4.11 `api.ts` --- error codes

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Input failed schema validation |
| `UNAUTHENTICATED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Not a member or insufficient role |
| `NOT_FOUND` | 404 | Resource absent or not visible to the caller |
| `IDEMPOTENCY_CONFLICT` | 409 | Same `Idempotency-Key`, different payload |
| `INVALID_STATE` | 409 | e.g. cancelling a completed job |
| `EXCLUDED_SUBJECT` | 422 | Subject or scope contains a non-eligible product/hypothesis |
| `EVIDENCE_SCOPE_VIOLATION` | 422 | Evidence outside the allowed scope |
| `RATE_LIMITED` | 429 | Per-user or per-workspace limit reached |
| `LIMIT_EXCEEDED` | 429 | Concurrency or quota limit reached |
| `UPSTREAM_UNAVAILABLE` | 503 | Required dependency unavailable |
| `INTERNAL_ERROR` | 500 | Unexpected error (no details exposed) |

------------------------------------------------------------------------

# 5. TypeScript domain contracts

## 5.1 Source connector

File: `packages/data-sources/src/connector.ts`

``` ts
import type { SourceDocument } from "@sor/contracts/evidence";

export interface ConnectorCapabilities {
  search: boolean;
  fetchDocument: boolean;
  fetchReviews: boolean;
  officialSource: boolean;
  rateLimitPerMinute?: number;
  quotaPerDay?: number;
}

export type ConnectorOutcome<T> =
  | { status: "ok"; data: T }
  | { status: "blocked" | "unavailable" | "not_supported" | "rate_limited" | "error";
      reason: string; retryable: boolean; retryAfterMs?: number };

export interface SourceSearchRequest {
  query: string;
  limit: number;
  locale?: string;
  cursor?: string;
}

export interface SourceSearchResult {
  url: string;
  title: string;
  snippet?: string;
  publishedAt?: string | null;
  externalId?: string | null;
}

export interface SourceConnector {
  readonly sourceKey: string;            // matches sources.source_key
  getCapabilities(): ConnectorCapabilities;
  search(input: SourceSearchRequest, signal: AbortSignal): Promise<ConnectorOutcome<SourceSearchResult[]>>;
  fetchDocument(url: string, signal: AbortSignal): Promise<ConnectorOutcome<SourceDocument>>;
  fetchReviews?(productRef: string, signal: AbortSignal): Promise<ConnectorOutcome<SourceDocument[]>>;
}
```

Connectors must:

-   Be registered in `sources` with `integration_status = 'integrated'`
    and `is_enabled = true` before the orchestrators may call them. A
    source that is only configured is reported as `not_supported`.
-   Enforce per-source quotas and rate limits.
-   Respect terms and robots/access restrictions as applicable.
-   Return canonical URLs, retrieval timestamps and `storage_permitted`.
-   Return explicit non-`ok` outcomes rather than fabricating data.
-   Never write directly to catalog tables.
-   Use `safeFetch` for every request to an untrusted URL.

## 5.2 Safe fetcher

File: `packages/data-sources/src/safe-fetch.ts`. Normative behaviour:

1.  Accept only `http:`/`https:` URLs without credentials in the URL.
2.  Resolve DNS; reject if **any** resolved address is loopback,
    private (RFC 1918), link-local, CGNAT (100.64.0.0/10), multicast,
    unspecified, reserved, documentation ranges, IPv6 ULA (fc00::/7),
    IPv6 link-local, or IPv4-mapped IPv6 of any of these.
3.  Connect to the validated IP (pinning) with the original `Host`/SNI,
    so a second DNS answer cannot redirect the connection.
4.  Follow redirects manually, re-applying steps 1--3 on every hop, up
    to `fetch_max_redirects`.
5.  Enforce `fetch_timeout_ms`, `fetch_max_bytes` (stream and abort),
    and an allow-list of content types (`text/html`,
    `application/xhtml+xml`, `text/plain`, `application/json`; PDFs only
    after a dedicated parser is added).
6.  Send no cookies, no credentials, a neutral user agent without
    personal data; obey per-host rate limits.
7.  Return `ConnectorOutcome` (`blocked` for policy rejections).

Unit tests cover each rejected range, redirect to a private address,
DNS answers mixing public and private addresses, oversized bodies and
disallowed content types.

## 5.3 AI provider

File: `packages/ai-gateway/src/provider.ts`

``` ts
export type ModelProfile =
  | "fast_extraction"
  | "classification"
  | "research"
  | "reasoning"
  | "verification"
  | "embedding";

export interface StructuredAIRequest<TSchema> {
  agentKey: string;
  contractVersion: string;
  promptVersion: string;
  systemInstructions: string;          // states that inputs are untrusted data
  untrustedInputs: Array<{ label: string; ref: string; text: string }>;  // delimited data blocks
  trustedInput: unknown;               // IDs, filters, prior validated artifacts
  schema: TSchema;
  modelProfile: Exclude<ModelProfile, "embedding">;
  maxOutputTokens: number;
  timeoutMs: number;
  maxCostUsd: number;
  temperature?: number;
}

export interface AIUsage {
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  reportedCostUsd?: number;
  latencyMs: number;
}

export interface StructuredAIResult<T> {
  data: T;
  provider: string;
  model: string;
  usage: AIUsage;
  finishReason: "stop" | "length" | "unknown";
  repaired: boolean;                   // true if the single allowed repair call was used
}

export interface EmbeddingResult {
  provider: string;
  model: string;
  dimensions: number;
  vectors: number[][];
  usage: AIUsage;
}

export interface AIProvider {
  readonly id: string;
  generateStructured(request: StructuredAIRequest<unknown>): Promise<StructuredAIResult<unknown>>;
  embed(texts: string[], model: string, signal: AbortSignal): Promise<EmbeddingResult>;
}
```

Gateway requirements:

-   Resolve model profiles through server-side configuration.
-   Validate structured output with the supplied Zod schema; reject
    invalid results. At most one repair call per step, recorded as
    `operation = 'repair'`.
-   Validate every identifier in the output against the identifiers
    supplied in the request (snapshot IDs, evidence IDs, cluster IDs,
    product IDs); unknown identifiers fail the step.
-   Record usage, latency and outcome in `provider_usage`.
-   Enforce timeout and maximum cost before and after the call (refuse a
    call whose worst-case cost exceeds the remaining budget).
-   Never log secrets or full private prompts unnecessarily.
-   Provider fallback only for retryable provider failures; the model
    actually used is always recorded.
-   Selection method **[ACCEPTED: PD-08 A]**: one provider chosen by a
    cost/quality benchmark on the evaluation fixtures, plus a fake
    provider for tests. The concrete provider, models per profile,
    embedding model and budgets are the benchmark's outcome
    **[PENDING_USER_APPROVAL: PD-24]**; until then, tests and development
    use the fake provider.

## 5.4 Permanent exclusion classifier (all engines)

File: `packages/domain/src/exclusion/index.ts`. Rule set version
`excl-1`, mirrored in `exclusion_rules`. **[ACCEPTED: PRD §1.3, §4.2.O,
§21; CLAUDE.md §3; ADR-010]**

``` ts
export interface ExclusionInput {
  primaryCategorySlugs: string[];
  name: string;
  tagline: string | null;
  primaryUseCase: string | null;   // short, LLM-proposed (product) or generated (hypothesis)
  secondaryTexts: string[];   // description
  featureTexts: string[];     // feature and integration names
  llmCorePurposeFlag?: "affiliate_or_partner" | "not_affiliate_or_partner" | "unknown";
}

export interface ExclusionResult {
  status: "eligible" | "excluded" | "needs_review";
  ruleSetVersion: "excl-1";
  matchedRules: Array<{ ruleKey: string; field: "category" | "core" | "secondary" | "llm" }>;
  incidentalMentions: Array<{ ruleKey: string; text: string }>;
}

export function classifyExclusion(input: ExclusionInput): ExclusionResult;
```

"Core texts" = name, tagline and primary use case. Rules
(case-insensitive, word-boundary matching on normalized text):

| Rule | Applies to | Outcome |
|---|---|---|
| R1 Excluded category | any primary category with `is_permanently_excluded` | `excluded` |
| R2 Affiliate core phrases: "affiliate marketing", "affiliate program(s)", "affiliate network(s)", "affiliate management", "affiliate tracking", "affiliate software", "affiliate platform", "affiliate attribution", "affiliate commission(s)", "affiliate payout(s)" | core texts | `excluded` |
| R3 Partner core phrases: "partner program(s)", "partner management", "partner relationship management", "PRM", "partner ecosystem", "partner marketplace", "partner portal", "channel partner(s)", "partner attribution", "partner commission(s)", "partner payout(s)", "partnership management", "partnerships platform" | core texts | `excluded` |
| R4 Referral networks: "referral network(s)", "affiliate and referral", "referral and affiliate" | core texts | `excluded` |
| R5 Commission/payout with partner context: "commission" or "payout" within the same core text as "affiliate" or "partner" | core texts | `excluded` |
| R6 Boundary cases: "commission management", "sales commission(s)", "referral program(s)", "referral marketing", "customer referral(s)" (no partner/affiliate context) | core texts | `eligible` + informational boundary flag (PD-11 A: not excluded unless the core purpose is affiliate/partner) |
| R7 Ambiguous tokens: standalone "affiliate" in any core text; standalone "partner(s)" in `primaryUseCase` only (not name or tagline) | core texts | `needs_review` |
| R8 Any R2--R5 phrase in secondary texts only | description | `needs_review` |
| R9 Any R2--R7 phrase in feature texts only | features/integrations | `eligible` + `incidentalMentions` |
| R10 LLM flag `affiliate_or_partner` | --- | at least `needs_review` (an LLM can never make a product eligible) |

Precedence: `excluded` > `needs_review` > `eligible`. Golden tests cover
every rule, including products that must stay eligible (a CRM with a
referral feature, a marketing tool whose tagline says "your growth
partner" without partner-program purpose, a marketing-attribution tool
under the visible "Attribution" category, employee sales-commission
software and customer-referral-program software (PD-11 A)).

Operator resolution: a platform operator may resolve only a
`needs_review` outcome, setting the product to `eligible` or `excluded`
with a reason. An `excluded` outcome from R1--R5 cannot be overridden
(API and RPC refuse it); a false positive is fixed by correcting the
underlying data (categories, name, tagline, use case) and re-running the
classifier. Each resolution is (audit-logged in
`product_exclusion_assessments` and `audit_logs`). The database refuses
`eligible` while an excluded primary category is assigned. A new
classifier run with a new rule-set version, or a change of core texts,
re-evaluates the product; an operator decision is kept unless an R1--R5
rule now matches.

## 5.5 Agent contract

File: `packages/domain/src/agent.ts` (types only)

``` ts
export interface AgentContext {
  jobExecutionId: string;
  workspaceId?: string;
  traceId: string;
  abortSignal: AbortSignal;
  budget: {
    maxCostUsd: number;
    spentCostUsd: number;
    maxExternalRequests: number;
    externalRequestsUsed: number;
    deadlineAt: string;            // wall-clock budget
  };
}

export interface AgentResult<T> {
  output: T;
  evidenceIds: string[];
  warnings: string[];
  model?: {
    provider: string;
    name: string;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
  };
}

export interface Agent<I, O> {
  readonly key: string;
  readonly contractVersion: string;
  readonly promptVersion: string | null;   // null for deterministic agents
  run(input: I, context: AgentContext): Promise<AgentResult<O>>;
}
```

Every agent step is persisted in `agent_step_runs` with
`(job_execution_id, agent_key, step_key)` as idempotency key, its
`input_hash` and `output_hash`. A re-run with the same input hash reuses
the stored output.

------------------------------------------------------------------------

# 6. Discovery Engine implementation specification

## 6.1 Orchestrator

Input: validated `DiscoveryRequest` (§4.6).\
Output: persisted `discovery_runs` row, `discovery_candidates`, catalog
products in `candidate` state, snapshots and evidence.

State machine:

`queued → planning → searching → extracting → resolving_identity → enriching → verifying → classifying_exclusion → filtering → ranking → persisting → completed`

Failure and terminal states: `partial`, `needs_review`, `failed`,
`cancelled`.

The orchestrator persists each stage before moving to the next and is
restartable from completed step outputs (input hashes). The run's
`sources_report` records, per source: consulted / unavailable / not
supported, limits reached, errors, applicable terms (PRD §6.3 "Gestion
des sources").

## 6.2 Agent D1 --- Query Planner

Input: user prompt, explicit filters, enabled connectors, permanent
exclusion list (read-only context).

Output: `QueryPlanSchema` (§4.9).

Rules:

-   Explicit user filters outrank inferred preferences.
-   The planner cannot remove or weaken permanent exclusions: they are
    not part of its output; the server applies them after planning, and
    drops any planned query that matches an R1--R5 phrase.
-   If the request itself targets an excluded theme, the run continues
    without those themes and records a warning in `limitations`.
-   Do not infer paid customers from a paid pricing page.
-   Limit query count to the run budget.
-   Record the planner prompt version.

## 6.3 Agent D2 --- Source Search (deterministic)

Input: query plan.\
Output: source search result references and snapshots.

Rules:

-   Search integrated, enabled connectors concurrently with bounded
    concurrency.
-   Apply per-connector rate limits and quotas.
-   Store canonical URL, source identifier, retrieval timestamp, title,
    snippet and content hash in `source_records` / `source_snapshots`.
-   Do not fetch blocked pages or bypass authentication.
-   Retry 408/429/5xx with backoff; do not retry permanent 4xx.
-   Persist partial results when a connector fails.

## 6.4 Agent D3 --- Candidate Extractor

Input: source documents (as delimited untrusted data with their snapshot
IDs).\
Output: `CandidateExtractionOutputSchema` (§4.6).

Rules:

-   A candidate needs a real product name and an official product URL;
    without one, it is persisted only as `needs_review`.
-   Separate company from product.
-   Return null for unknown facts.
-   Every candidate cites at least one snapshot it was given; unknown
    snapshot IDs fail the step.
-   Do not create a candidate from a generic article mention without
    enough identity evidence.
-   Treat prompt-injection content only as data; set
    `injection_suspected` when the text contains instructions.

## 6.5 Agent D4 --- Identity Resolver (deterministic)

Normalization (`packages/domain/src/normalization`): lowercase host,
strip `www.`, IDNA to ASCII, drop default ports, fragments and tracking
parameters (`utm_*`, `gclid`, `fbclid`, `ref`), remove trailing slash;
registrable domain computed with the Public Suffix List.

Identity match sequence:

1.  Active `canonical_url` identifier equal to the candidate's normalized
    official URL → `matched_existing`.
2.  Active `external_id` for the same source → `matched_existing`.
3.  Registrable domain equal to a known product's domain **and** that
    domain maps to exactly one product **and** it is not a shared-host
    domain (app stores, marketplaces, site builders, code hosts;
    maintained list) → `matched_existing`.
4.  Company relationship (same company domain, different product path)
    → `new` product under the existing company.
5.  Name + description similarity → `needs_review` with
    `possible_duplicate_of_product_id`; never an automatic merge.

Rules: never auto-merge on name similarity alone; preserve aliases and
prior domains in `entity_identifiers`
(`valid_to` on change); handle acquisitions and renames without losing
history; persist the identity decision and its evidence.

## 6.6 Agent D5 --- Enrichment

Collect only fields supported by accessible sources: company details,
founders and their public professional profiles, product description,
problem solved, value proposition, use cases, compatibilities and features, pricing plans, integrations,
languages, platforms, public customer case studies, team-size range,
founder-led evidence, headquarters and served countries, French/European
presence, product status, traction signals.

Rules:

-   Prefer primary sources for official claims.
-   Store the snapshot and timestamp per claim (`evidence_items`) and the
    selected value per field (`catalog_field_provenance`).
-   Do not overwrite a newer verified fact with older evidence.
-   Contradictory claims are retained and recorded in
    `evidence_conflicts`.
-   A feature not found is `not_observed`, never `removed`.

## 6.7 Agent D6 --- Evidence Verifier

For each claim: check the snapshot exists and was given to the step;
confirm that the snapshot supports the claim; check publication and
retrieval dates; classify evidence type and reliability by claim type;
detect contradictions; mark `verified`, `needs_review`, `rejected` or
`stale`.

A paid pricing plan is `paid_plan_available`, not proof of a paying
customer.

## 6.8 Agent D7 --- Candidate Ranker (deterministic)

Two separate scores, never mixed with the opportunity score:

-   **SaaS Fit Score** (0--100, `packages/domain/src/fit`): share of the
    requested filter groups satisfied among the groups whose value is
    **known**, weighted equally. Groups with unknown values are excluded
    from both numerator and denominator (PRD §4.3: unknown is neither
    positive nor negative), listed in `missing_information`, and
    reflected in `fit_coverage` (share of requested groups with known
    values). A candidate with `fit_coverage` = 0 has no fit score. Research preferences from PRD §1.3 (independent,
    founder-led, small team, credible paid signals, underdeveloped) add
    bonus criteria only when the user did not set explicit filters on
    them. Only `eligible` candidates are scored.
-   **Evidence confidence** (0--100): the §9.4 confidence formula
    applied to the candidate's identity and filter-relevant evidence.

The model may suggest category relevance, but hard filters and
exclusions are evaluated in application code.

## 6.9 Discovery acceptance criteria

-   Same query and same source snapshots produce stable normalized
    candidate identities.
-   Permanent exclusions always apply (tested at D1, D3/D5, ranking,
    persistence and catalog visibility).
-   Every retained candidate has an official URL and evidence.
-   No duplicate product is inserted.
-   Unknown values remain null.
-   Source failure produces partial results rather than invented data.
-   All external requests are budgeted and logged.
-   The run shows title, prompt, interpreted filters, sources explored,
    candidates found, duplicates removed, candidates retained, duration
    and date (PRD §6.4), and can be re-run, edited or saved.

Candidate review: members accept or reject candidates through the API;
an accepted, eligible candidate becomes `record_status = 'active'` and
appears in Discover. Recurring discovery (PRD §6.5) is Phase 2: a
schedule stored per saved discovery search enqueues a `discovery_run`
through Supabase Cron; results mark `is_new_to_catalog` and detected
changes.

------------------------------------------------------------------------

# 7. Pain Point Intelligence Engine implementation specification

**[ACCEPTED: PRD §7.3 Phase D, §15, §18, §21; ADR-008]**

## 7.1 Orchestrator

Input: validated `PainPointRunRequest` (§4.7), scope frozen in
`pain_point_run_products` (only visible products).\
Output: `feedback_problems` (global), embeddings, workspace clusters,
cluster evidence and snapshots, market gaps (`market_gaps` with cluster
and evidence links), and generated opportunities.

State machine:

`queued → collecting → normalizing → extracting → embedding → clustering → verifying → computing_statistics → identifying_gaps → generating_opportunities → classifying_exclusion → persisting → completed`

Failure and terminal states: `partial`, `needs_review`, `failed`,
`cancelled`. Problems already extracted for a feedback item with the
same extractor contract/prompt version are reused across runs.

## 7.2 Agents

| Agent | Kind | Responsibility |
|---|---|---|
| P1 Feedback Collector | deterministic | Loads feedback already stored for the scope (imports, integrated connectors); optionally triggers integrated review connectors within budget; never stores text beyond `storage_permitted` |
| P2 Normalizer & Deduplicator | deterministic | Normalized text hash; near-duplicate detection (trigram similarity ≥ threshold, versioned); same `author_reference_hash` across items flagged; duplicates kept but excluded from counts |
| P3 Problem Extractor | LLM (`fast_extraction`) | `ProblemExtractionOutputSchema`; one item at a time; unknown fields stay null; zero problems allowed |
| P4 Embedder | gateway `embedding` | Embeds `problem_statement` (+ category label) into `feedback_problem_embeddings` |
| P5 Clusterer | deterministic | Average-linkage agglomerative clustering on cosine distance **within the same `problem_category`** (prevents merging different problems that share words, PRD §16.18); distance threshold and minimum size are versioned parameters (`cluster-1`) calibrated on the evaluation set; ties broken by problem ID; singletons stay "isolated complaints" |
| P6 Cluster Verifier | LLM (`verification`) | `ClusterVerificationOutputSchema`; removes outliers and proposes splits; never merges clusters (merges are user corrections) |
| P7 Cross-Competitor Statistics | deterministic | Counts and distributions (§7.3) |
| P8 Gap Identifier | LLM (`reasoning`) | `MarketGapOutputSchema`; every gap cites evidence and states that absence of an observed solution is not proof of no competition |
| P9 Opportunity Generator | LLM (`reasoning`) + exclusion classifier | `OpportunityHypothesisOutputSchema`; every hypothesis is classified (§5.4); excluded hypotheses are discarded and logged, `needs_review` ones are stored but not analysable |

## 7.3 Deterministic statistics (P7)

For each cluster:

-   `feedback_count`: active, non-duplicate members (raw volume).
-   `distinct_author_count`: distinct `author_reference_hash` values;
    status `verified` only when every member has a source-provided stable
    author identifier; `unknown` (null) when no member has one;
    `estimated` otherwise (lower bound, labelled as such). Several
    reviews by one author count once.
-   `distinct_company_count`: distinct `author_company_reference` values,
    same status rules.
-   `affected_product_count` and `product_distribution`: per product
    count and, when `total_known_review_count` is known for that product,
    `relative_frequency = count / total_known_review_count` (PRD: avoid
    over-weighting products that simply have more reviews).
-   Time evolution: monthly counts by `published_at`; first detection and
    last observation dates; a snapshot row per run (PRD §13.3).
-   `resolution_breakdown`: counts of resolved / unresolved / unknown. A
    problem is `unresolved` only when the source supports it (PRD §16.17).
-   `frequency_label` (rule set `freq-1`, thresholds versioned):
    `isolated` if one distinct author (or one feedback when authors are
    unknown); `recurring` if ≥ 3 non-duplicate feedback items from ≥ 2
    distinct authors when known; `widespread` if recurring in ≥ 2
    products **and** relative frequency ≥ 5 % in at least one product
    with a known review total; else `unknown`.
-   `severity_score`: mean of known severities (null if none).
-   `confidence_score`: §9.4 evidence-quality formula over member
    evidence, multiplied by the verifier coherence (`1.0` coherent,
    `0.6` otherwise), capped at 60 when authors are unknown.

## 7.4 Rules

-   A large number of negative reviews is never evidence of willingness
    to pay (PRD §7.3.G). The engine never produces WTP ratings or scores.
-   The engine may conclude that a problem is real but not commercially
    attractive; generated hypotheses carry `validation_needed`.
-   Every cluster links to original evidence (`pain_point_evidence` →
    `feedback_problems` → `customer_feedback` → `evidence_items` →
    snapshot).
-   Users can review and correct clusters (rename, confirm, reject,
    remove or move problems) through the API; the server recomputes the
    statistics and records `review_status` and an audit entry.
-   Review samples are not representative of all customers; every cluster
    DTO shows `sample_limitations`.

## 7.5 Acceptance criteria (PRD §19 "Pain Point Intelligence Engine")

-   Collects feedback only from authorized connectors or declared imports.
-   Distinguishes individual feedback from structured problems.
-   Extracts problems with consistent fields; unknown stays null.
-   Groups similar problems phrased differently; does not merge different
    problems that share vocabulary (evaluation fixtures).
-   Identifies the products affected by each cluster.
-   Distinguishes raw volume, distinct authors and distinct companies.
-   Links every cluster to original evidence.
-   Distinguishes resolved, unresolved and unknown problems.
-   Produces a confidence level.
-   Can conclude that a recurring problem is not an attractive
    opportunity.

------------------------------------------------------------------------

# 8. Opportunity Engine implementation specification

## 8.1 Orchestrator and subjects

State machine:

`queued → resolving_subject → building_evidence_index → product_research → market_research → customer_voice → competitor_research → localization → feasibility_wtp → dimension_assessment → scoring → red_team → verdict → report → completed`

Subject resolution (frozen in `analysis_subject_products` by
`sor_request_analysis`):

| Subject | Scope products | Analysis focus |
|---|---|---|
| `product` | the product (`subject`) + its visible competitor links (`competitor`) | Opportunity to build a better alternative to this product (PRD §7.1) |
| `product_set` | the set (`set_member`) + their visible competitors | Shared weaknesses and gaps across the set |
| `category` | visible active products of the category (`category_member`, capped by depth; selection rule recorded) | Market-level opportunity within the category |
| `pain_point_cluster` | products affected by the cluster (`cluster_product`) | Opportunity to solve the cluster's problem |
| `generated_opportunity` | `evidence_source` and `existing_competitor` products of the hypothesis | Opportunity score for this exact hypothesis (PRD §8.10) |

Building the evidence index: the orchestrator adds to `analysis_evidence`
the visible evidence of the scope products and any market or category
evidence collected during the run. Agents receive only the index (IDs +
claim text + metadata); every citation they produce must reference it.

Parallelizable stages: product, market, customer voice, competitor,
localization research.

Dependent stages: feasibility/WTP consumes earlier findings; dimension
assessment consumes all validated artifacts; scoring is deterministic;
red-team consumes scores and evidence; verdict combines gates and
red-team; the report composer consumes only validated artifacts.

## 8.2 Agent O1 --- Product Analyst

Deliver: positioning, target customer, core job-to-be-done, features,
pricing model, integrations, product limitations, evidence gaps.

No feature can be called missing merely because it was not found on the
marketing site. Mark `not_observed` unless verified absent.

## 8.3 Agent O2 --- Market Analyst

Deliver: market definition, buyer segments, problem frequency signals,
existing spend signals, market trends with dates, competitive intensity,
market-size estimates only when methodology and sources exist.

Do not invent TAM/SAM/SOM. If no credible data exists, return
`insufficient_data`. Low competition is not automatically positive (PRD
§8.5).

## 8.4 Agent O3 --- Customer Voice Analyst

Reuses the Pain Point Engine: if no pain point run covers the scope
products with current extractor versions, the orchestrator runs P1--P7
for the scope inside the analysis job (same budgets), then O3 summarises:
top-5 problems (cluster IDs), relevant source count, estimated frequency
within the sample, examples (evidence IDs), sample limitations.

Do not infer prevalence among all customers from a self-selected review
sample.

## 8.5 Agent O4 --- Competitor Analyst

Identify direct competitors, indirect competitors, substitutes, free
alternatives, cheaper and more advanced alternatives, French
alternatives, US alternatives (PRD §5.9). For each: official website,
positioning, target segment, pricing evidence, feature overlap,
differentiators, weaknesses only when evidenced, evidence IDs and
confidence. Products that are not `eligible` are omitted and counted in
`omitted_excluded_count`.

Similarity is not sufficient to call a product a direct competitor. It
must solve a materially similar customer problem for a comparable buyer.

## 8.6 Agent O5 --- Localization Analyst

Assess existing French availability, French competitors, local buyer
needs, local integrations, language and support expectations,
regulatory requirements where relevant, local pricing and distribution,
actual unmet need.

Translation alone is not a defensible opportunity.

## 8.7 Agent O6 --- WTP and Feasibility Analyst

WTP evidence categories: `payment_confirmed`, `customer_verified`,
`paid_plan_available`, `purchase_intent`, `problem_signal`, `unknown`.
Do not combine these into a single unqualified count.

Feasibility dimensions: technical complexity, API/source dependency,
estimated build effort, operating cost, data access risk, distribution
access, switching cost, support burden.

The agent must state assumptions and uncertainty. Stated intent is never
treated as a purchase (PRD §7.3 Phase H).

## 8.8 Agent O7 --- Dimension assessment and scoring

-   **O7a Dimension Assessor (LLM, `reasoning`)** proposes one
    `DimensionAssessmentProposal` per dimension (§4.8) using the PRD §8
    criteria for each dimension, including the cross-competitor criteria
    of PRD §8.1/§8.10 when the subject spans several products.
-   **O7b Scoring Engine (deterministic, `packages/domain/src/scoring`)**
    validates the proposals (§9.2) and computes points, coverage, WTP,
    confidence, decision band and gate inputs (§9).

## 8.9 Agent O8 --- Red-Team Verifier

Mission: actively disprove the opportunity.

Must challenge: Is the pain recurring and important? Are customers
already satisfied with alternatives? Is the proposed gap real? Is the
buyer reachable? Is there evidence of willingness to pay? Is the French
opportunity more than translation? Is the product technically and
legally feasible? Are source signals biased or too small? Is the market
too crowded or too small?

Output: `RedTeamSchema` (§4.9), with at least one material
counterargument. Kill criteria become `analysis_findings` of type
`kill_criterion` with severity; the server computes `is_substantiated`
(§9.5).

The server combines deterministic gates with the red-team result. The
LLM does not write the final verdict, and its recommendation can only
make the verdict stricter (§9.6).

## 8.10 Agent O9 --- Report Composer

Consumes only validated artifacts, the final scores and the verdict.
Produces `AnalysisReportSchema` with the PRD §9 sections: Executive
Summary (name, description, score /100 or provisional points with
coverage, WTP /15, confidence, decision band, verdict, three main reasons
to pursue or abandon), Market Analysis, Customer Pain Analysis,
Cross-Competitor Pain Analysis, Market Gap Analysis (including reasons the
opportunities could fail), Competitor Analysis (matrix), Opportunity Map,
Recommended Product (value proposition, initial target, positioning, MVP
features, secondary features, pricing hypothesis, main advantage),
Go-to-Market, Validation Plan (experiments with success and abandon
thresholds), Risks & Kill Criteria, Final Verdict, Evidence Index.

Every material factual statement links to evidence IDs from the index.
Hypotheses are labelled as hypotheses. The composer cannot change scores
or the verdict.

Exclusion of recommendations: before persisting, the server classifies
with §5.4 the Recommended Product, every Opportunity Map entry, every
`opportunity` finding and every competitor without a catalog
`product_id` (core texts: name/title and value proposition or primary use
case). Excluded items are removed and counted in `limitations`;
`needs_review` items are labelled. If the Recommended Product itself is
excluded or under review, the section is replaced by an explanation and
the verdict cannot be BUILD CANDIDATE (gate `EXCLUDED_RECOMMENDATION`).

## 8.11 Comparison analyses (PRD §11; Phase 2 "Comparateur avancé")

`analysis_type = 'comparison'` on a `product_set` (2--10 products, or
from Phase 2 also a set of generated opportunities, which needs a small
schema extension of the comparison subject delivered with the Phase 2
comparator) runs O1, O3, O4 per product and a comparison composer that
answers "which of these presents the best opportunity to build an
alternative?" by comparing evidence, not by picking the highest score.
It produces a ranked, evidence-linked justification and no score or
verdict of its own. The MVP "Comparaison simple" is the deterministic
side-by-side table of §10 (`GET /compare`), without AI.

------------------------------------------------------------------------

# 9. Scoring, confidence and verdict implementation

Files: `packages/domain/src/scoring`, `confidence`, `verdict`. Rules
version: `scoring-1` (stored in `opportunity_analyses.scoring_rules_version`).

## 9.1 Accepted rules

**[ACCEPTED: PRD §8; CLAUDE.md §10; ADR-005]**

-   Weights: customer demand 20, willingness to pay 15, product gap 20,
    market attractiveness 15, competitive differentiation 15,
    feasibility/distribution/adaptation 15.
-   `weighted_points = rating / 5 × weight`.
-   A dimension with insufficient evidence is not assessed; it never
    counts as zero.
-   Final score only at 100 % coverage; otherwise provisional points with
    explicit coverage, never normalised to /100.
-   WTP /15 = WTP rating × 3, derived from the WTP dimension itself.
-   Confidence is separate from the score.
-   BUILD CANDIDATE requires all gates of §9.6; a substantiated critical
    kill criterion forces REJECT; the red-team can only tighten.
-   The server writes all results; the LLM writes none.

## 9.2 Validation of dimension proposals (O7a → O7b)

The server rejects the O7a step (retryable once, then
`needs_review`) unless:

1.  Exactly six proposals with distinct `dimension_key` values.
2.  Every cited evidence ID is in the analysis evidence index.
3.  An `assessed` proposal cites ≥ 1 `supports` evidence item.
4.  WTP: a rating ≥ 4 requires ≥ 1 supporting evidence item with
    `monetization_signal in ('payment_confirmed','customer_verified')`
    and `verification_status = 'verified'`; otherwise the server caps
    the rating at 3 and records a warning (a pricing page alone cannot
    reach the WTP threshold, CLAUDE.md §4.1).
5.  Ratings are integers 0--5 **[ACCEPTED: PD-05 A]** (with
    integer ratings every score is an integer, so threshold comparisons
    are exact; v1.0 rounded a decimal score before comparing to 75).

## 9.3 Reference implementation

``` ts
export const DIMENSIONS = {
  customer_demand: 20,
  willingness_to_pay: 15,
  product_gap: 20,
  market_attractiveness: 15,
  competitive_differentiation: 15,
  feasibility_distribution: 15
} as const;
export type DimensionKey = keyof typeof DIMENSIONS;

export interface EvidenceQuality {
  evidenceId: string;
  sourceRecordId: string;
  reliabilityLevel: 1 | 2 | 3 | 4;
  verificationStatus: "verified" | "unverified" | "needs_review" | "stale";
  observedAt: string;
  publishedAt: string | null;
  monetizationSignal: string | null;
  inOpenConflict: boolean;
}

export interface ValidatedDimension {
  key: DimensionKey;
  status: "assessed" | "insufficient_evidence";
  rating: number | null;                 // integer 0..5 when assessed, else null
  supporting: EvidenceQuality[];
}

export interface ScoreResult {
  scoreTotal: number | null;             // only at 100 % coverage
  provisionalPoints: number;             // sum over assessed dimensions, NOT normalised
  coverage: number;                      // sum of assessed weights (0..100)
  wtpScore: number | null;               // 0..15
  confidence: number;                    // 0..100
  band: "reject" | "low_potential" | "to_investigate" | "interesting" | "priority" | null;
}

export function computeScore(dims: ValidatedDimension[], now: Date): ScoreResult {
  const keys = new Set(dims.map(d => d.key));
  if (dims.length !== 6 || keys.size !== 6) throw new Error("SCORING_INPUT_INVALID");

  let coverage = 0;
  let points = 0;
  for (const d of dims) {
    if (d.status !== "assessed") continue;
    if (d.rating === null || !Number.isInteger(d.rating) || d.rating < 0 || d.rating > 5) {
      throw new Error("SCORING_INPUT_INVALID");      // never a silent zero
    }
    coverage += DIMENSIONS[d.key];
    points += (d.rating / 5) * DIMENSIONS[d.key];
  }

  const complete = coverage === 100;
  const wtp = dims.find(d => d.key === "willingness_to_pay")!;
  const wtpScore = wtp.status === "assessed" ? (wtp.rating as number) * 3 : null;
  const scoreTotal = complete ? points : null;

  return {
    scoreTotal,
    provisionalPoints: points,
    coverage,
    wtpScore,
    confidence: computeConfidence(dims, now),
    band: scoreTotal === null ? null
      : scoreTotal < 50 ? "reject"
      : scoreTotal < 65 ? "low_potential"
      : scoreTotal < 75 ? "to_investigate"
      : scoreTotal < 85 ? "interesting"
      : "priority"
  };
}
```

## 9.4 Confidence formula

**[ACCEPTED: PD-07 A, approved 4 Nov 2026]** --- deterministic formula
(PRD §8.9 factors: number and quality of sources, age, confirmed vs
estimated data, missing information, disagreements):

-   Evidence quality `q(e) = r × v × f × c` where `r` = 1.0 / 0.75 / 0.5 /
    0.25 for reliability 1 / 2 / 3 / 4; `v` = 1.0 verified, 0.6 unverified,
    0.3 needs_review or stale; `f` = 1.0 if the evidence is at most 24
    months old (published, else observed), 0.7 otherwise; `c` = 0.5 if the
    evidence is in an open conflict, else 1.0.
-   Dimension quality `Q_d`: keep the best `q` per distinct source record,
    sum the top three, `Q_d = min(1, sum / 2)`; if only one distinct
    source record supports the dimension, `Q_d = min(Q_d, 0.6)`;
    `Q_d = 0` for a dimension not assessed.
-   `confidence = round(Σ weight_d × Q_d)` (0--100). Display levels: low
    < 40, medium 40--69, high ≥ 70.
-   "Adequate confidence" for BUILD CANDIDATE: `confidence ≥ 70`
    (threshold carried over from the v1.0 reference code).

The same `q(e)` is used for discovery evidence confidence (§6.8) and
cluster confidence (§7.3).

## 9.5 Kill criteria

-   A kill criterion is **substantiated** when it has ≥ 1 supporting
    evidence item from the analysis index with `verification_status =
    'verified'` and `reliability_level ≤ 3`
    **[ACCEPTED: PD-07 A]**.
-   Critical + substantiated → REJECT (fatal flaw).
-   Critical + not substantiated → an unresolved critical kill criterion:
    blocks BUILD CANDIDATE (→ VALIDATE FIRST).
-   Major or minor criteria are reported and never change the verdict by
    themselves.

## 9.6 Verdict decision table

Evaluated in order; `reasons` records every gate result.

| # | Condition | Verdict | Reason code | Status |
|---|---|---|---|---|
| 1 | A critical kill criterion is substantiated | REJECT | `FATAL_FLAW` | ACCEPTED (CLAUDE.md §10) |
| 2 | Coverage < 100 | VALIDATE FIRST | `INCOMPLETE_COVERAGE` | ACCEPTED |
| 3 | Score < 50 | REJECT | `SCORE_BELOW_REJECT_THRESHOLD` | ACCEPTED (PRD §8.8 "0--49 Rejeter"); a possible low-confidence exception is PD-25 (pending, non-blocking) |
| 4 | 50 ≤ score < 65 | VALIDATE FIRST (band "Faible potentiel") | `LOW_POTENTIAL` | ACCEPTED: PD-06 B |
| 5 | 65 ≤ score < 75 | VALIDATE FIRST | `TO_INVESTIGATE` | ACCEPTED (PRD §8.8 "À approfondir") |
| 6 | Score ≥ 75 and any gate fails: WTP < 10 (`WTP_BELOW_THRESHOLD`); no verified `payment_confirmed`/`customer_verified` evidence (`NO_PAYING_CUSTOMER_EVIDENCE`, PRD §21); confidence < 70 (`LOW_CONFIDENCE`); demand gate (`INSUFFICIENT_DEMAND_EVIDENCE`); differentiation gate (`NO_CONCRETE_DIFFERENTIATION`); unsubstantiated critical kill criterion (`UNRESOLVED_CRITICAL_KILL_CRITERION`); recommended product excluded or under review (`EXCLUDED_RECOMMENDATION`) | VALIDATE FIRST | listed codes | ACCEPTED (gates; thresholds and definitions PD-07 A) |
| 7 | Score ≥ 75 and all gates pass | BUILD CANDIDATE | `ALL_GATES_PASSED` | ACCEPTED |
| 8 | After 1--7: verdict is BUILD CANDIDATE and the red-team recommends VALIDATE FIRST or REJECT | VALIDATE FIRST | `RED_TEAM_OBJECTION` | ACCEPTED (red-team only tightens; REJECT only through rule 1) |

Workspace thresholds (PRD §14.1 "Seuil de validation"): a workspace may
only raise the BUILD thresholds above 75 / 10 (`stricter_build_thresholds`
in research preferences); the locked minimums of PRD §21 can never be
lowered **[ACCEPTED: PD-23 A]**.

Approved gate definitions (PD-07 A): **demand** = customer-demand rating
≥ 3 supported by ≥ 2 distinct source records; **differentiation** =
competitive-differentiation rating ≥ 3 and ≥ 1 non-hypothesis finding of
type `opportunity` or `competitor_gap` with supporting evidence. Whether a
complete score < 50 with low confidence (< 40) should become VALIDATE
FIRST instead of REJECT is **[PENDING_USER_APPROVAL: PD-25]**
(recommended: no exception); until decided, rule 3 applies as written.

## 9.7 Display rules

-   Complete: "68 / 100 · Band: À approfondir · WTP 9 / 15 · Confidence 54
    (medium) · VALIDATE FIRST", each element visually separate.
-   Incomplete: "Provisional: 41 points on 70 % coverage" --- never
    "/100"; missing dimensions listed with their missing information.
-   Unknown is never displayed as zero.
-   Every score element links to its evidence.
-   A "Scoring reliability" block (analysis DTO and report, PRD §8.9)
    always shows: number of sources used, their reliability-level
    distribution, age of information (oldest/median), confirmed vs
    estimated vs declared evidence counts, missing information per
    dimension, and open disagreements between sources.

------------------------------------------------------------------------

# 10. API contract

All routes use `/api/v1`. Route handlers authenticate, authorize the
workspace from the path, validate inputs with Zod (§4), apply rate limits
and return DTOs rather than raw database rows. Long work returns `202`
with `{ data: { id, status, status_url } }`. Job-creating POSTs require
`Idempotency-Key`; the same key with the same payload returns the
original job, with a different payload returns `409
IDEMPOTENCY_CONFLICT`.

Roles: **V** viewer+, **M** member+, **A** admin+, **O** owner, **P**
platform operator. `W` = `/workspaces/{workspaceId}`.

## Identity and workspaces

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/me` | auth | user, memberships, operator flag |
| GET | `/workspaces` | auth | |
| POST | `/workspaces` | auth | calls `create_workspace()` (atomic bootstrap) |
| PATCH | `W` | O | rename |
| GET / POST | `W/members` | V / A | invite: email + role (never owner) |
| PATCH / DELETE | `W/members/{userId}` | A | not the owner, not oneself (leaving: DELETE self, any non-owner role) |
| POST | `W/ownership-transfer` | O | calls `sor_transfer_ownership()` |
| GET / PATCH | `W/settings` | V / A | `ResearchPreferencesSchema`, `AiPreferencesSchema` |

## Catalog (visible products only)

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `W/products/search` | V | read-only search with a JSON body (`CatalogQuerySchema`; nested filters do not fit query strings); merges workspace states (favorite, hidden, status, analysed); hidden excluded unless `include_hidden`; no idempotency key needed |
| POST | `W/products/search/count` | V | same body, count only (PRD §4.3) |
| GET | `W/products/{id}` | V | profile header + general/product/commercial info with provenance |
| GET | `W/products/{id}/features` · `/pricing` · `/integrations` · `/signals` · `/competitors` · `/feedback` · `/evidence` · `/sources` · `/conflicts` | V | `/competitors` includes segment facets (cheaper, more advanced, free, French, US) and comparison-table data |
| GET | `W/categories` | V | user-visible taxonomy |
| POST | `W/products` | M | manual add (`ManualProductEntrySchema`) → `201` through `sor_manual_add_product`; active only if classified `eligible`; data is `declared`. From Sprint 3 the response also carries a `product_enrichment` job ID |
| POST | `W/imports/products` | M | CSV (`ProductImportRowSchema`) → `202`, `catalog_import` |
| POST | `W/imports/feedback` | M | CSV + `FeedbackImportRequestSchema` → `202`, `feedback_import` |
| GET | `W/imports/{jobId}` | V | per-row results, rejected rows with reasons |
| POST | `W/products/{id}/reports` | M | correction report (`CorrectionReportSchema`) |
| GET | `W/compare?product_ids=…` | V | MVP simple comparison table (2--10 products), deterministic |
| GET | `W/compare/opportunities?ids=…` | V | MVP simple comparison of 2--10 generated opportunities (PRD §11: problems, segments, number of SaaS, evidence quality, observed demand, WTP, competing solutions, differentiation, feasibility, scores, confidence from their latest analyses), deterministic |

## Workspace organisation

| Method | Path | Role |
|---|---|---|
| GET / PATCH | `W/products/{id}/state` | V / M |
| GET / POST | `W/collections` | V / M |
| PATCH / DELETE | `W/collections/{id}` | M / A |
| POST | `W/collections/{id}/items` | M (product or generated opportunity) |
| PATCH / DELETE | `W/collections/{id}/items/{itemId}` | M |
| GET / POST | `W/saved-searches` | V / M |
| PATCH / DELETE | `W/saved-searches/{id}` | M (creator) or A |
| POST | `W/saved-searches/{id}/duplicate` | M |
| GET / POST / PATCH / DELETE | `W/tags`, `W/tags/{id}` | V / M |
| POST / DELETE | `W/tags/{id}/assignments` | M |
| GET | `W/history` | V | analyses, runs and status changes |

## Discovery

| Method | Path | Role |
|---|---|---|
| POST | `W/discovery-runs` | M (`DiscoveryRequestSchema`, 202) |
| GET | `W/discovery-runs` · `W/discovery-runs/{id}` · `/{id}/progress` · `/{id}/results` | V |
| POST | `W/discovery-runs/{id}/cancel` · `/{id}/retry` | M |
| DELETE | `W/discovery-runs/{id}` | A (terminal runs only; audit-logged) |
| POST | `W/discovery-runs/{id}/save` | M (saves prompt + filters as a `discovery` saved search, PRD §6.4) |
| POST | `W/discovery-runs/{id}/candidates/{candidateId}/review` | M (`CandidateReviewSchema`) |

## Pain Point Intelligence

| Method | Path | Role |
|---|---|---|
| POST | `W/pain-point-runs` | M (`PainPointRunRequestSchema`, 202) |
| GET | `W/pain-point-runs` · `/{id}` · `/{id}/progress` | V |
| POST | `W/pain-point-runs/{id}/cancel` · `/{id}/retry` | M |
| DELETE | `W/pain-point-runs/{id}` | A (terminal runs only; clusters used by an analysis or a generated opportunity block deletion) |
| GET | `W/clusters` · `W/clusters/{id}` · `/{id}/evidence` · `/{id}/history` | V |
| GET | `W/pain-point-runs/{id}/gaps` | V |
| PATCH | `W/clusters/{id}` | M (`ClusterCorrectionSchema`; server recomputes statistics) |
| GET | `W/generated-opportunities` · `/{id}` | V |
| PATCH | `W/generated-opportunities/{id}` | M (status, favourite, notes) |

## Opportunity analysis

| Method | Path | Role |
|---|---|---|
| POST | `W/analyses` | M (`AnalysisRequestSchema`, 202) |
| POST | `W/products/{id}/analyses` | M (shortcut for subject `product`) |
| GET | `W/analyses` · `/{id}` · `/{id}/progress` · `/{id}/report` · `/{id}/evidence` | V |
| POST | `W/analyses/{id}/cancel` · `/{id}/retry` | M |
| DELETE | `W/analyses/{id}` | A (PRD §14.4; audit-logged) |
| POST | `W/analyses/{id}/exports` | M (`report_export`, 202; JSON + Markdown in the MVP, PDF later — PD-18 A) |

## Settings, sources, data

| Method | Path | Role |
|---|---|---|
| GET | `W/sources` | V (connector status, last sync, errors, limits, quotas; PRD §14.3) |
| GET | `W/usage` | V (job usage and quotas of the workspace, the caller's own hourly budget; PRD §14.3; S7.2; AI cost of the day, S7.3) |
| POST | `W/exports` | A (`data_export`, CSV/JSON of workspace data, 202; PRD §14.4) |
| GET | `W/exports/{jobId}` | A (short-lived signed URL) |

## Validation experiments (Phase 3)

`GET/POST W/validation-experiments`, `PATCH/DELETE
W/validation-experiments/{id}` (V/M, delete A).

## Platform operator

| Method | Path | Role |
|---|---|---|
| GET | `/operator/exclusion-reviews` | P |
| POST | `/operator/products/{id}/exclusion-decision` | P (reason required) |
| GET / POST | `/operator/correction-reports` · `/{id}/resolution` | P |
| POST | `/operator/products/{id}/merge` | P (identity merge, history kept) |

## Conventions

-   Cursor pagination: opaque, HMAC-signed cursor encoding the sort key
    values and `id`; deterministic ordering (`… , id`); `random` uses a
    seed carried in the cursor so pages never repeat (PRD §19 "La
    pagination ne crée aucun doublon").
-   Error envelope and codes: §4.11; `request_id` on every response.
-   Rate limits: fixed-window counters in `rate_limit_counters` keyed by
    user and route class; job-creating POSTs limited by
    `api_rate_limit_job_posts_per_hour`.

------------------------------------------------------------------------

# 11. Queue and worker implementation

## Queue topology

V1 durable queue: `sor_jobs`. Message envelope: `JobEnvelopeSchema`
(§4.10).

## Worker loop

``` ts
async function tick() {
  const messages = await rpc.sorWorkerRead({ qty: concurrencySlots(), vtSeconds: leaseSeconds });
  await Promise.all(messages.map(processMessage));
}

async function processMessage(message: QueueMessage) {
  const envelope = JobEnvelopeSchema.safeParse(message.payload);
  if (!envelope.success) return rpc.sorWorkerFinishPoison(message.id);   // archive + audit, never retried

  const job = await rpc.sorWorkerClaim({ jobId: envelope.data.job_execution_id, workerId, leaseSeconds });
  if (!job) return;                      // terminal, leased elsewhere or not yet due

  const heartbeat = startHeartbeat(job, message.id);   // extends lease + visibility; surfaces cancel requests
  try {
    const outcome = await handlers[job.job_kind](job, heartbeat.signal);   // durable steps, each persisted
    await rpc.sorWorkerFinish({ jobId: job.id, workerId, state: outcome.state, terminalReason: outcome.reason });
  } catch (error) {
    const c = classifyError(error);      // packages/domain/src/jobs
    if (c.retryable && job.attempt_count < job.max_attempts) {
      await rpc.sorWorkerRetry({ jobId: job.id, workerId, delaySeconds: backoffWithJitter(job.attempt_count), error: c });
    } else {
      await rpc.sorWorkerFinish({ jobId: job.id, workerId,
        state: c.retryable ? "dead_letter" : "failed", terminalReason: c.retryable ? "dead_letter" : "failed", error: c });
    }
  } finally {
    heartbeat.stop();
  }
}
```

The PGMQ client calls behind these RPCs must follow the installed
Supabase version's API. Do not invent function names; verify them in
Sprint 3 with integration tests.

## Retry classification

| Class | Examples | Behaviour |
|---|---|---|
| Transient | network timeout, HTTP 408/429/5xx, provider overload, lease lost | retry, `backoff = min(base × 2^attempt, cap) + jitter` |
| Permanent | schema-invalid input, HTTP 4xx (except 408/429), `EXCLUDED_SUBJECT`, `EVIDENCE_SCOPE_VIOLATION`, unknown cited ID after repair | `failed`, no retry |
| Budget | cost, request, time budget reached | stop gracefully; job state `partial`, terminal reason `budget_exhausted`; the owning run/analysis becomes `partial` or `needs_review` |
| Cancellation | `cancel_requested_at` set | stop between steps, keep artifacts, `cancelled` |

## Rules

-   Visibility timeout = lease = one heartbeat cycle (`job_lease_seconds`),
    never the whole analysis.
-   Steps keyed `(job_execution_id, agent_key, step_key)`; a redelivered
    message reloads completed steps instead of repeating them.
-   Save each agent artifact before acknowledging progress.
-   Archive the message only at a terminal state.
-   Stale-lease recovery through `sor_worker_claim`; orphan recovery
    through `sor_worker_requeue_orphans` on a timer.
-   Per-job budgets (cost, external requests, wall-clock) and
    per-workspace concurrency are enforced.
-   Scheduled work (Phase 2 recurring discovery, refreshes) only enqueues
    jobs.

------------------------------------------------------------------------

# 12. Permissions and authorization rules

## Roles

-   `owner`: full workspace control; one per workspace.
-   `admin`: manage workspace settings and members except ownership
    transfer; delete analyses and terminal runs.
-   `member`: create and manage searches, runs, analyses, collections,
    notes, tags, statuses, cluster corrections, correction reports.
-   `viewer`: read workspace resources only.
-   `platform operator` (outside workspaces): catalog curation through
    operator endpoints only. Holder: the product owner only **[ACCEPTED:
    PD-12 A]**, registered once in Sprint 2 by a documented server-side
    procedure (no user ID in migrations).

## Rules

1.  Workspace ID comes from the URL path and is verified against the
    session user's membership on every request; never trusted from a
    body.
2.  Every workspace resource query includes workspace authorization.
3.  A user cannot change their own role or assign `owner`.
4.  Ownership transfer is a dedicated server-only operation.
5.  Catalog, derived data, results and operations are written by the
    server only.
6.  Queue, provider usage, audit logs, agent steps, job executions and
    platform tables are server-only.
7.  A user can read only analyses, runs and clusters of workspaces they
    belong to.
8.  The Supabase secret/service key is never sent to the browser.
9.  API route handlers repeat authorization checks; hiding a UI button
    is not authorization.
10. Storage objects use private buckets and short-lived signed URLs
    after authorization.

## Database permission matrix (to be covered by pgTAP)

`anon`: no access to any table or RPC. Server role: full access (tested
for the RPCs' behaviour).

| Table group | viewer | member | admin | owner | non-member |
|---|---|---|---|---|---|
| Catalog tables (visible products) | S | S | S | S | S |
| Catalog rows of candidate / excluded / needs_review products | — | — | — | — | — |
| `entity_identifiers`, `product_exclusion_assessments`, `feedback_problems`, embeddings | — | — | — | — | — |
| `workspaces` | S | S | S | S, U(name) | — |
| `workspace_members` | S, D(self) | S, D(self) | S, I/U/D (non-owner, not self) | same as admin | — |
| `workspace_settings` | S | S | S, U | S, U | — |
| `collections` | S | S, I, U | S, I, U, D | S, I, U, D | — |
| `collection_items`, `tags` | S | S, I, U, D | S, I, U, D | S, I, U, D | — |
| `tag_assignments` | S | S, I, D | S, I, D | S, I, D | — |
| `saved_searches` | S | S, I, U(own), D(own) | S, I, U, D | S, I, U, D | — |
| `workspace_product_states` | S | S, I, U | S, I, U, D | S, I, U, D | — |
| `catalog_correction_reports` | S | S, I | S, I | S, I | — |
| Runs, candidates, clusters, analyses, scores, findings, evidence links | S | S | S | S | — |
| `generated_opportunities` | S | S, U(status, is_favorite, notes) | same as member | same as member | — |
| `validation_experiments` (Phase 3) | S | S, I, U(content columns) | S, I, U, D | S, I, U, D | — |
| Jobs, agent steps, provider usage, audit, rate limits, platform tables | — | — | — | — | — |

S = select, I = insert, U = update, D = delete. Every cell is a pgTAP
assertion for allowed **and** denied operations.

------------------------------------------------------------------------

# 13. Observability, cost controls, and reliability

## Required telemetry

Every execution records: request ID, job execution ID, workspace ID when
applicable, run/analysis ID, agent and step key, contract and prompt
version, provider and model, input/output tokens, reported/estimated
cost, latency, retry count, error code, evidence IDs produced.

Do not log credentials, access tokens, or unnecessary personal data.

## Budgets

Configurable server-side limits in `platform_limits` (workspace settings
can only lower them): max discovery candidates, max source requests per
run, max AI calls per agent, max AI cost per run and per analysis, max
wall-clock time, max retries, max concurrent jobs per workspace. AI
budget defaults: fixed after the PD-08 benchmark
**[PENDING_USER_APPROVAL: PD-24]**.

Stop gracefully when a budget is reached and return `partial` or
`needs_review`; never fabricate missing output.

## Freshness

Initial recheck targets: pricing 7--30 days; product features 30--60
days; employee estimates 60--90 days; competitor links 30--60 days;
reviews: incremental collection when available. Refresh jobs
(`product_refresh`) are enqueued by schedule in Phase 2 (PRD §13.3);
evidence past `expires_at` becomes `stale` and lowers confidence.

## Product metrics

The PRD §20 indicators (catalog size, duplicate rate, enrichment
coverage, analyses count, cost and duration per analysis, verdict
distribution, cluster counts and multi-competitor clusters, incorrect
grouping rate from user corrections, validated opportunities) are
computed by SQL views over the tables above, without new tracking
infrastructure.

------------------------------------------------------------------------

# 14. Test plan and acceptance gates

## Unit tests

Zod contracts (including the version-sensitive behaviours of §4.0);
URL/domain normalization; exclusion classifier golden set (§5.4); filter
semantics including unknown handling per group; fit score; identity
resolution; deduplication and near-duplicates; evidence validation and
scope; scoring, coverage, WTP cap, confidence, every row of the verdict
table; cluster statistics; retry classification; budgets; safe fetcher.

## Database tests (pgTAP / `supabase test db`)

Every cell of the §12 matrix for `anon`, non-member, viewer, member,
admin, owner and the server role; integrity triggers (evidence scope,
exclusion guards, feedback consistency, assessed-dimension evidence,
non-hypothesis finding evidence, BUILD CANDIDATE check); RPCs
(`create_workspace`, `sor_transfer_ownership`, `sor_request_*`, worker
RPCs); idempotency conflict; single owner.

## Integration tests

Workspace creation and owner bootstrap; job creation and enqueue in one
transaction; successful execution; provider outage and retry; connector
failure with partial result; worker crash and lease recovery; duplicate
message delivery; cancellation; evidence ID scope validation; analysis
completion and report citation integrity; permanent exclusion across
discovery, pain point runs, generated opportunities and analysis; CSV
import with rejected rows.

## E2E tests (Playwright)

1.  Sign in.
2.  Browse Discover (feed, grid, list).
3.  Apply combined filters (B2B + US + team size) and check the count.
4.  Open a product profile.
5.  Inspect pricing, sources and evidence.
6.  Save a product to a collection; favourite; hide.
7.  Start a pain point run on a product set; follow progress; open a
    cluster and its evidence; correct it.
8.  Start an opportunity analysis (product subject and cluster subject).
9.  View score, WTP, confidence, coverage and band separately.
10. Open cited evidence.
11. Confirm that incomplete evidence produces VALIDATE FIRST.
12. Start a discovery run; follow progress; open a candidate; accept it.

## AI evaluation fixtures (`evals/`)

Catalog and discovery: active SaaS with official pricing; discontinued
product; company with multiple products on one domain; similar names
belonging to different products; paid pricing without proof of
customers; contradictory public information; sparse public information;
source page containing prompt-injection text; product whose core purpose
is affiliate/partner; general product with an incidental referral
feature.

Pain point: the same problem phrased differently across products;
different problems sharing vocabulary (must not merge); several reviews
by one author; a product with many reviews versus one with few (relative
frequency); resolved versus unresolved complaints; a positive review with
no problem.

Measure: extraction precision, identity resolution precision, evidence
entailment, unsupported-claim rate, category accuracy, clustering purity
and incorrect-merge rate, score reproducibility, verdict consistency,
cost per successful run. Acceptance thresholds per agent are proposed
from the first baseline and approved by the product owner before the
agent ships **[ACCEPTED: PD-22 A, process]**.

Do not ship an agent because it returns valid JSON; ship only after
factual and evidence evaluations pass.

------------------------------------------------------------------------

# 15. Implementation sequence and Definition of Done

Order **[ACCEPTED: PD-13 A, ADR-012, approved 4 Nov 2026]**. The order puts the Pain Point and Opportunity Engines
before the Discovery Engine (PRD §18 "Priorité absolue : vérifier la
qualité de la détection des problèmes et la pertinence des opportunités
générées avant d'étendre le nombre de connecteurs"), with the catalog fed
by manual entry and imports in the meantime.

## Sprint 0 --- Repository and tooling

PD-01 approved. **Starts only on the product owner's explicit go-ahead.**

-   Create the monorepo (pnpm + Turborepo), strict TypeScript, lint,
    format, Vitest, Playwright, `.gitignore`.
-   Add CI (install, lint, typecheck, unit tests, build; a database job
    with the Supabase CLI on a Docker-capable runner).
-   Add `.env.example` and Zod environment validation (server-only
    variables never use `NEXT_PUBLIC_`).
-   Create empty packages with their boundaries; contract test suite of
    §4.0.

Done when install, lint, typecheck, unit tests and build pass locally and
in CI.

**Status (4 November 2026): implemented.** Pinned versions are in
`docs/ENVIRONMENT.md` (Node 26.13.0, pnpm 10.34.9, TypeScript 6.0.3,
Next.js 16.4.5, Zod 4.6.7, Supabase CLI 3.0.0). Local results: format,
lint, typecheck, unit tests, build and the Playwright smoke test pass.
`supabase/config.toml` was generated with signup disabled. The CI result
is recorded in the Sprint 0 report; the database job could not run in the
cloud session (no Docker daemon).

## Sprint 1 --- Database foundation and security

No pending decision (PD-04 approved).

-   M1--M4; verify Supabase version, API key model, default grants.
-   `create_workspace`, `sor_transfer_ownership`.
-   Generate Supabase types; repositories for catalog and workspace.
-   pgTAP for every M1--M4 table and RPC (§12 matrix).

Done when migrations apply on a clean database and all permission tests
pass; browser roles cannot write catalog or operational data.

**Status (4 November 2026): implemented.** M1--M4 are in
`supabase/migrations/2026110418*` (applied unchanged from §3).
`supabase/tests/` holds 7 pgTAP files with 121 assertions; in CI, on
the real Supabase stack, they pass, `supabase db lint` reports no errors
and the security advisors report no issues. Types are generated into
`packages/database/src/generated.ts`, and CI fails if they drift.
`@sor/database` provides the server and user clients, the error mapping
to §4.11 codes and the workspace repository (`createWorkspace`,
`listMemberships`). **Catalog repositories move to Sprint 2**: they are
shaped by the catalog DTOs and filters built there. Verified facts: the
local stack exposes publishable/secret keys (and the legacy anon/
service-role keys); M1's default-privilege revoke makes new `public`
tables invisible to `anon` and `authenticated` (pgTAP-tested). The
security model is documented in `docs/DATABASE_SECURITY.md`.

## Sprint 2 --- Catalog, Discover and workspace

No pending decision (PD-12, PD-15, PD-16, PD-17, PD-20 approved).

-   Catalog read APIs with filters, count, sort and cursor pagination.
-   Discover feed/grid/list; cards with every PRD §3.2 element; card
    actions (open, favourite, collection, hide, report, analyse ---
    analyse disabled with an explanation until Sprint 5).
-   SaaS profile: header, general, product, commercial, traction,
    competitors (table), feedback, sources and reliability, unknowns
    explicit.
-   Collections, notes, favourites, hidden, statuses, tags, saved
    searches (duplicate), simple comparison table.
-   Manual add through `sor_manual_add_product` (declared evidence,
    exclusion classification, active only if eligible; the enrichment job
    is added in Sprint 3).
-   Operator views for exclusion reviews and correction reports.
-   French-query search tests.

Done when a user can browse, filter, inspect, save and organise seeded
records end-to-end (labelled fixtures).

**Status (4 November 2026): implemented.** Summary of what was built and
of the decisions taken inside the approved scope:

-   **Migration** `20261105090000_catalog_search_manual_add_operator.sql`:
    `saas_products.logo_url` (PRD §12.1, missing from M2; `https` only);
    `public.catalog_search` / `public.catalog_count` (security invoker, so
    catalog and workspace RLS apply; plan keys documented in
    `private.catalog_filtered`; keyset pagination on `(sort value, id)`;
    the sort value is returned as text so JSON never rounds a cursor);
    `sor_manual_add_product`, `sor_operator_exclusion_decision`,
    `sor_operator_resolve_report`, `sor_add_member_by_email` (service
    role only) and `workspace_member_directory` (members only). pgTAP:
    `007_catalog_search`, `008_manual_add_operator`,
    `009_members_directory`.
-   **Filter engine** (`packages/domain/src/filters`): the MVP groups of
    PD-16 A + J. Groups H, K, L, M, N and the sort keys `least_analyzed`
    and `ai_potential` are rejected with `VALIDATION_ERROR` (never
    silently ignored) until their data exists (Phase 2 / Sprint 5).
    **[ASSUMPTION]** integer age buckets on `current year − founding (else
    launch) year`: `lt_1` = 0, `1_2` = 1--2, `2_5` = 3--5, `5_10` =
    6--10, `gt_10` ≥ 11. Team size = `employee_max`, else `employee_min`.
    Price bands are monthly-equivalent EUR, minimum inclusive and maximum
    exclusive. Configurable exclusions (§4.2.O) **[ASSUMPTION]**:
    `groups_and_large_companies` = subsidiary or public company, or
    `employee_min > 100`; `too_recent_without_demand_proof` = started in
    the current or previous year with no verified paying-customer
    evidence, no feedback and no review/testimonial/case-study signal;
    `very_technical_devtools` = primary category under Developer Tools;
    `no_identifiable_activity` = `product_status = 'discontinued'`;
    `already_analyzed_and_rejected` = workspace status `rejected`.
-   **French search**: the search vector stays on the English
    configuration; French words match through the stemmer (singular and
    plural share a stem) and a name-fragment fallback. Accents must be
    typed as in the source text (pgTAP-tested limitation; an `unaccent`
    configuration can be added later).
-   **Competitor facets** **[ASSUMPTION]**: `cheaper` = lower converted
    entry price (both known); `more_advanced` = more observed available
    features than the subject (subject has at least one); `free` = free
    pricing or a free plan; `French` / `US` = company country. They are
    labelled as indicators, not proof.
-   **Manual add**: the API normalises the URL (§6.5), runs the §5.4
    classifier (the one-line description is treated as the tagline, the
    note as a secondary text) and calls the RPC; the response discloses a
    product id only when the user can see the product.
-   **API**: §10 routes for identity, workspaces, members (invitation
    through Supabase Auth when the e-mail has no account), settings,
    catalog search/count, profile sections, categories, compare, manual
    add, reports, product state, collections, saved searches (duplicate),
    tags, sources and the operator endpoints. Cursors are HMAC-SHA256
    signed with a key derived from the server secret and bound to the
    query. State-changing requests must be same-origin JSON.
    **Deferred**: `/conflicts` (contradiction detection is the Evidence
    Verifier, Sprint 3), `W/history` (status-change history needs the
    analyses and runs of Sprints 5--6), rate limiting (first applied to
    job-creating POSTs in Sprint 3), `/operator/products/{id}/merge`
    (identity merges arrive with D4, Sprint 3), and ECB rate collection
    (a job, Sprint 3; until then a currency without a rate counts as
    unknown).
-   **UI**: Discover, SaaS profile, Saved, Compare, Settings, operator
    console; AI Discovery and Opportunities pages explain when they
    arrive. Demo fixtures (`apps/web/scripts/seed-demo.ts`, `.test`
    domains, badge "Donnée de démonstration") run only against a local
    stack; the E2E suite runs on them in CI.

## Sprint 3 --- Sources, evidence and job system

Blocked by the PGMQ verification gate (ADR-004). Can start with the fake
provider; the **exit gate** needs a real provider for D5/D6 (PD-24,
pending) and per-agent threshold approvals (PD-22 process).

-   AI gateway: profiles, structured output + validation, metering,
    budgets, fake provider (D5 and D6 are the first LLM agents).
-   M5; job RPCs; worker skeleton with leases, heartbeats, retries,
    cancellation, dead letter.
-   Safe fetcher; official-website connector (terms reviewed, robots
    respected); CSV product and feedback imports with rights
    declarations.
-   Snapshots with content hashes; evidence persistence; provenance;
    conflicts; normalization and identity resolution (D4); enrichment
    (D5) and verification (D6) for one product (`product_enrichment`).

Done when a controlled run produces deduplicated products with traceable
evidence and explicit unknowns, and a killed worker resumes without
duplicating work.

**Status (4 November 2026): implemented with the fake provider; exit gate
pending PD-24.**

-   **PGMQ gate passed** (ADR-004): pgmq 1.5.1 on the local stack;
    signatures recorded in ADR-004.
-   **M5** (`20261105120000_jobs_queue.sql`) as specified, plus
    `job_executions.result` (user-facing outcome: import row results,
    enrichment summary; never secrets or source text) and Sprint 3 limits
    (`enrichment_max_pages`, `enrichment_max_seconds`, `import_max_rows`,
    `evidence_max_age_days`, `ai_max_cost_usd_per_job` = 0 until PD-24).
    `sor_request_job` serves `product_enrichment`, `catalog_import` and
    `feedback_import`; `sor_cancel_job` adds cooperative cancellation.
-   **Evidence pipeline RPCs** (`20261105120100_evidence_pipeline.sql`):
    `sor_record_snapshot`, `sor_apply_enrichment` (atomic and idempotent per
    verification step; whitelisted fields; provenance; conflicts; features,
    integrations and pricing; re-classification only stricter),
    `sor_import_product_row`, `sor_import_feedback_row`. The
    official-website, manual and import sources are `integrated`.
-   **Official-website connector**: public pages of the product's own site
    (home, then up to `enrichment_max_pages − 1` same-site pages such as
    pricing, features, integrations, about), robots.txt obeyed, 2-second
    per-host interval, off-site redirects refused, snapshots stored as
    `stored_excerpt` with quotes in the evidence. **[ASSUMPTION]** the
    normalized page text is kept only in the server-only step output
    (`agent_step_runs.output_json`) so a resumed job does not refetch; a
    retention period is to be fixed with the deployment (Sprint 7).
-   **D5/D6** (`@sor/discovery-engine`): D5 proposes field claims,
    features, integrations and pricing plans, each with a quote and the
    cited snapshot; D6 combines the deterministic check (quote found in the
    cited snapshot, freshness, payment-proof rules) with the model's
    judgment, which can only make a verdict stricter. Only verified items
    become features, integrations, pricing or selected field values;
    needs-review and stale items are stored as evidence only; rejected
    items are not stored (counted in the job result). A paid plan is always
    `paid_plan_available`.
-   **Imports**: the web app sends the raw CSV (≤ 2 MB, `import_max_rows`)
    with an `Idempotency-Key`; the worker validates rows against
    `ProductImportRowSchema` / `FeedbackImportRowSchema`, resolves product
    identity with D4 (canonical URL, single-product registrable domain,
    company domain, name similarity → review), runs the §5.4 classifier and
    reports a result per row. **[ASSUMPTION]** category slugs in a CSV cell
    are separated by `|`; feedback duplicates are detected on the
    normalized text per product; with `excerpt` rights, 500 characters are
    stored.
-   **Worker**: queue loop with leases (`job_lease_seconds`), heartbeats,
    retry with backoff and jitter, dead letter, budget and cancellation
    outcomes, poison messages, orphan sweeper; steps persisted and reused
    by input hash.
-   **AI gateway**: profiles, budget refusal before a call, timeout, Zod
    validation, one recorded repair, cited-identifier check, usage in
    `provider_usage`. Only the fake provider exists (labelled `fake`, deterministic
    heuristics, zero cost).
-   **Evaluation**: `evals/enrichment` fixtures (official pricing, paid plan
    without customers, sparse site, prompt injection, affiliate core
    purpose, incidental referral feature) and a runner; the fake-provider
    baseline accepts no unsupported claim.
-   **Verified**: pgTAP 010–011 on the real stack; worker integration tests
    (enrichment, duplicate delivery, killed worker recovered after its lease
    without repeating D5, transient retry, cancellation, CSV imports); E2E
    with the worker running.
-   **Exit gate**: "deduplicated products with traceable evidence and explicit
    unknowns" and "a killed worker resumes without duplicating work" are met
    with the fake provider. **Not met:** D5/D6 on a real provider (PD-24)
    and per-agent thresholds (PD-22).
-   **Deferred**: `product_refresh` and `source_sync` (scheduled work, Phase 2);
    external-ID identity matching (no connector with external IDs yet);
    operator identity merges; rate limiting of job POSTs beyond the
    concurrency limit; ECB rate collection (no FX job yet: a currency without
    a rate stays unknown).

## Sprint 4 --- Pain Point Intelligence Engine

Blocked by PD-24 (embedding model, pending). G2 is used only if PD-26 is
approved; otherwise the sprint runs on declared CSV feedback imports.
Per-agent thresholds follow the PD-22 process.

-   Embedding support in the AI gateway (`pgvector` verified).
-   M6; agents P1--P9; deterministic clustering and statistics.
-   Pain point runs UI; cluster pages with evidence, history and
    correction; generated opportunities list with statuses and tags.
-   Evaluation fixtures and thresholds.

Done when a run over a product set produces evidence-linked clusters
that pass the clustering evaluation, distinguishes volume/authors/
companies, and generates eligible hypotheses.

**Status (5 November 2026): implemented with simulated providers; exit
gate pending PD-24a/PD-24b and PD-22.** The product owner authorised the
sprint while the Sprint 3 exit gate stays pending (ADR register, "Sprint 4
start"); no paid call was made and production keeps the fake provider.

-   **pgvector verified** on the real stack (CI applies M6 with
    `create extension vector`); the vector column has no fixed dimension
    and no ANN index until PD-24b fixes the embedding model.
-   **M6** (`20261106090000_pain_points.sql`) as specified (tables,
    triggers, RLS, grants, tag and collection targets), plus the RPCs the
    blueprint describes: `sor_request_pain_point_run` (frozen scope of
    visible products; category scope capped by `pain_scope_max_products`
    = 50), a trigger that keeps `pain_point_runs.status` in step with its
    job (cancellation, failure and dead letter included), worker writes
    (`sor_pain_save_problems` reused per extractor version,
    `sor_pain_save_embeddings`, `sor_pain_mark_duplicates`,
    `sor_pain_save_clusters` with statistics and a history snapshot,
    `sor_pain_save_insights`; deterministic ids make them idempotent),
    and user actions through the API (`sor_cluster_correction` with
    audit and optimistic concurrency, `sor_delete_pain_point_run`,
    `sor_retry_pain_point_run`). 72 pgTAP assertions.
-   **Engine** (`@sor/pain-point-engine`): the §7.1 state machine; P1–P9
    with persisted, keyed steps (a resumed job repeats no model call);
    excluded hypotheses discarded and counted, `needs_review` ones stored
    and not analysable. Deterministic rules in `@sor/domain`: `dedup-1`,
    `cluster-1`, `freq-1`, evidence quality q(e)/Q (§9.4).
-   **AI gateway**: `embed()` (embedding profile, budget refusal, timeout,
    vector shape validation, usage). The fake provider gives deterministic
    hashed embeddings (64 dimensions); fake P3/P6/P8/P9 handlers are
    labelled heuristics.
-   **API and UI**: the routes of §10 "Pain Point Intelligence"; the
    Opportunities page (new run, runs, clusters, hypotheses with status,
    favourite, notes and tags), run page (progress, cancel, retry, delete,
    limitations, gaps), cluster page (separate volume / distinct authors /
    distinct companies with their status, relative frequency, resolution,
    severity, confidence, time evolution, history, sample limitations,
    evidence with sources, corrections). Statistics after a correction are
    recomputed by the server with `@sor/domain`.
-   **Evaluation** (`evals/pain-points`): same problem phrased differently,
    different problems sharing vocabulary, one author counted once, many
    vs few reviews. Fake baseline: 0 incorrect merges, counts exact,
    grouping recall 2/3 (no synonyms without a real embedding model).
-   **[ASSUMPTION]** `dedup-1`: near duplicates by pg_trgm-style trigram
    similarity ≥ 0.85 within a product, computed in `@sor/domain` (no
    `pg_trgm` dependency); near duplicates are kept, not extracted, and
    excluded from counts. `cluster-1`: average-linkage cosine distance ≤
    0.35, minimum size 2 (provisional, to calibrate once PD-24b is
    decided). `freq-1` "recurring in ≥ 2 products" is read as recurring
    overall and present in ≥ 2 products. A verified `review_count` company
    signal `{"count": n}` gives the total known review count. P6 splits
    are applied automatically (merges stay user corrections); singletons
    and P6 outliers are isolated complaints, not clusters. The verifier's
    coherence is not stored: a corrected cluster's confidence is
    recomputed without it. P8 gaps citing evidence outside their clusters
    are dropped with a warning.
-   **Verified**: unit tests (contracts, domain, gateway, engine,
    evaluation), pgTAP 012, worker integration test (CSV import → run →
    clusters, history, hypotheses, provider usage; second run reuses
    problems; cancellation), Playwright journey (import → run → cluster →
    correction → hypothesis status; viewer read-only).
-   **Exit gate**: evidence-linked clusters, separate volume / authors /
    companies and eligible hypotheses are met with the simulated
    providers. **Not met:** clustering evaluation thresholds on a real
    embedding model (PD-24b, PD-22) and real P3/P6/P8/P9 (PD-24a).
-   **Deferred**: G2 (PD-26); ANN index (PD-24b); analyses blocking run
    deletion (M7, Sprint 5); comparison of generated opportunities
    (Sprint 5); triggering review connectors from P1 (none integrated).

## Sprint 5 --- Opportunity Engine

No blocking decision (PD-05, PD-06, PD-07, PD-10, PD-18, PD-23
approved; PD-25 is non-blocking: rule 3 applies until decided).

-   M7; agents O1--O9; deterministic scoring, confidence and verdict.
-   Analysis creation for all five subject types; progress; report UI
    with separate score/WTP/confidence/coverage/band; evidence index;
    export.
-   Evaluation fixtures and quality gates.

Done when a full analysis produces a validated, evidence-linked report
with correct coverage and verdict gates, and an incomplete analysis is
VALIDATE FIRST.

**Status (5 November 2026): implemented with simulated providers; quality
of the real agents pending PD-24a and PD-22.** Authorised by the product
owner with the three proposals of the sprint plan (no new market-evidence
collection during an analysis, comparison analyses kept for Phase 2,
depth stored and used for budgets and caps). No paid call was made and
production keeps the fake provider.

-   **Contracts** (`analysis.ts`, `agents/opportunity.ts`): §4.8 as
    written, one versioned contract per agent O1–O9 (§4.9). Statements are
    evidence-linked or labelled hypotheses; `not_observed` unless a
    feature is verified absent; no market size without methodology and
    evidence; direct competitors and weaknesses need evidence; WTP
    categories are never merged; the report contract has no score or
    verdict field. Reason code `SCORE_BELOW_BUILD_THRESHOLD` added for a
    workspace that raised the BUILD score threshold (PD-23 A).
-   **Scoring** (`@sor/domain/scoring`, rules `scoring-1`): §9.2–9.6 as
    specified, with one unit test per rule and per gate.
-   **M7** (`20261107090000_opportunity_analyses.sql`): the blueprint SQL
    as written plus `sor_request_analysis` (five subject types, visible
    competitors only and excluded ones counted, category members capped by
    depth with the selection rule recorded, BUILD thresholds frozen at
    request time), the job/analysis status sync, evidence-index writes,
    `sor_analysis_finalize` (one atomic write that recomputes coverage,
    points, WTP, band and kill-criterion substantiation and refuses a
    verdict inconsistent with §9.6 or a report citation outside the
    index), deletion (admin, audit-logged), retry, report exports.
    `20261107100000_analysis_customer_voice.sql`: the analysis-owned pain
    point run of §8.4. pgTAP 013 (76 assertions) and 014 (12).
-   **Engine** (`@sor/opportunity-engine`): the §8.1 state machine with
    keyed steps; evidence index selected deterministically (subject first,
    quality, recency; 60/150/300 items by depth); O3 reuses persisted
    Pain Point clusters (P7 counts replace the agent's numbers); O7a
    validated by the server (one retry, then `needs_review` and no
    score); the red team only tightens (no red team → at most VALIDATE
    FIRST); §8.10 exclusion of the recommended product, opportunity map,
    opportunity findings and competitors outside the catalog.
-   **Worker**: `opportunity_analysis` (customer voice: a covering pain
    point run with the current versions is reused, otherwise P1–P7 run
    inside the analysis job with the same budget) and `report_export`.
-   **API and UI**: the routes of §10 "Opportunity analysis", plus
    `GET W/analyses/{id}/exports` and `GET W/analyses/{id}/exports/{exportId}`
    to list and download exports. "Analyze Opportunity" on the SaaS
    profile, cluster and hypothesis pages; product-set and category
    analyses on Opportunities; report page with score, band, WTP,
    confidence, coverage and verdict in separate tiles, verdict rules,
    dimension table with evidence links, scoring-reliability block, PRD
    §9 sections, findings and kill criteria, evidence index, exports.
    Simulated reports carry a visible banner and `simulated: true`.
-   **Evaluation** (`evals/opportunity`): paid pricing without customers,
    unverified paying claim, sparse information, discontinued product
    (verified and unverified source), prompt injection, complete coverage
    without proof. Fake baseline: verdict consistency 1, reproducibility
    1, 0 citations outside the index.
-   **[ASSUMPTION]** O7a also returns the findings (pain_point,
    opportunity, risk, competitor_gap, recommendation) because the
    differentiation gate needs them and no other contract carries
    `FindingSchema`; kill criteria come only from O8. Counterarguments of
    O8 are stored as `risk` findings. Exports are stored in the
    server-only `report_exports` table and downloaded through an
    authenticated route (no Storage bucket in the MVP; a private bucket
    with signed URLs comes with PDF exports, PD-18). A pain point run
    "covers" an analysis when it is completed or partial, includes every
    visible scope product and uses the current clustering and extractor
    versions.
-   **Exit gate**: a full analysis produces a validated, evidence-linked
    report with correct coverage and verdict gates, and an incomplete
    analysis is VALIDATE FIRST — met with the simulated providers (unit,
    pgTAP, integration and Playwright tests). **Not met:** the quality of
    the real agents (PD-24a, PD-22); the Sprint 3 and 4 exit gates also
    remain pending.
-   **Deferred**: comparison analyses (§8.11, Phase 2); new market or
    category evidence collected during an analysis (needs search sources,
    PD-28); PDF export (PD-18); PD-25 (low-confidence exception, pending:
    rule 3 applies).

## Sprint 6 --- Discovery Engine

PD-28 approved on 6 November 2026 (`docs/DATA_SOURCES.md`): Hacker News
official API (metadata only), product CSV seeds, controlled rebound from
official websites; Product Hunt pending (PD-29); Brave deferred. No source
is enabled in production during the sprint.

**Status (6 November 2026):** S6.0 (terms review, `docs/DATA_SOURCES.md`)
and S6.1 (contracts and deterministic rules) implemented.

-   Contracts (`packages/contracts/src/discovery.ts`): request, D1
    `QueryPlanSchema` (`d1.query-plan.v1`), D2 leads, D3 extraction
    (`d3.candidate-extraction.v1`), run status and stages, source report
    entry, candidate review; `SourceStoragePolicySchema` (full /
    metadata_only / transient) in `evidence.ts`.
-   Domain (`packages/domain/src/discovery`): fit score `fit-1`,
    planner guard (§6.2), per-depth budgets.
-   **[ASSUMPTION]** decisions of S6.1:
    -   the request gains `channels` (search on/off, controlled rebound
        with optional seed products, seed URL list) for the PD-28 channels;
    -   only **explicit** filter groups known not to be satisfied act as
        hard filters; inferred groups and preferences only change the fit
        score; unknown values never reject a candidate;
    -   the research preferences (independent, founder-led, small team,
        paid offer observed) count as equal-weight criteria, only when no
        explicit or inferred filter covers them; "underdeveloped" is not
        evaluated (no deterministic definition);
    -   commercial-validation values not observed are `unknown`, never
        "not satisfied" (absence of evidence);
    -   budgets per depth: standard 5 queries/source, 300 requests/source,
        60 leads, 90 official pages, 5 rebound seeds; deep 10 / 1,000 /
        150 / 240 / 15 (3 pages and 20 leads per rebound seed).

**S6.2 (6 November 2026):** migration `20261108090000_discovery.sql` (M8)
and `supabase/tests/015_discovery.sql`.

-   M8 as specified, plus: `depth`, `max_results`, `channels`, `query_plan`,
    `stage`, `leads_found`, versions and `terminal_reason` on runs;
    `provenance`, `fit_rules_version`, reviewer fields on candidates;
    checks "fit score needs coverage > 0" and "a possible duplicate is
    never pending or accepted".
-   `sources.storage_policy`, check "an enabled source has a terms
    review", `source_usage_daily` + `sor_source_consume` (daily quota);
    `hacker_news` row planned and disabled.
-   RPCs: request, stage, plan, candidate upsert, finalize, review,
    delete, retry (service role only).
-   **[ASSUMPTION]** a candidate's primary evidence must be an
    official-website snapshot (a third-party lead is never enough); the
    database derives the candidate review status (excluded → rejected,
    exclusion or identity under review → needs review); retry is refused
    once a candidate has been reviewed (a new run is started instead);
    deleting a run keeps the catalog products it created.

**S6.3 (6 November 2026):** `@sor/data-sources` Hacker News connector
(official API only, metadata only, run budget and quota hook; tested on
synthetic responses, source not enabled), controlled rebound
(`rebound.ts`), simulated search connector, source descriptors.

**S6.4 (6 November 2026):** `@sor/discovery-engine` `runDiscovery`
(planning → searching → extracting → resolving_identity →
classifying_exclusion → filtering → ranking → persisting), D1/D3 prompts
and fake handlers, in-memory ports.

-   **[ASSUMPTION]** the run's "enriching/verifying" stages are the D3
    extraction from the lead's official site plus deterministic checks
    (cited snapshot given to the step, name present in the page, official
    URL on the fetched site); full D5/D6 enrichment of a candidate stays
    the existing `product_enrichment` job.
-   Evidence confidence of a candidate = §9.4 aggregate quality of its
    official-site evidence and search leads (nothing is verified during a
    run); the fit score stays separate.
-   Ranking: fit score, then confidence, then name; eligible pending
    candidates beyond `max_results` are rejected with `beyond_max_results`.

**S6.5 (6 November 2026):** `discovery_run` worker handler
(`apps/worker/src/handlers/discovery.ts`) on the database ports; search
connectors built only for sources the registry reports integrated and
enabled; integration tests `apps/worker/test/integration/discovery.int.test.ts`
(synthetic pages, no network).

**S6.6 (6 November 2026):** §10 discovery routes, AI Discovery page and run
page (PRD §6.4), candidate review, Settings > Sources (storage policy,
today's usage, terms-review state), labelled demo discovery run in
`seed-demo.ts`, Playwright journey `apps/web/e2e/discovery.e2e.ts`.

-   **[ASSUMPTION]** "Relancer / modifier" (PRD §6.4) opens the form
    prefilled from a run and starts a new run with `rerun_of_run_id`;
    "Reprendre" (retry) reuses the same run only while no candidate has
    been reviewed.
-   The E2E journey never fetches a site: a live run uses only the search
    channel (Hacker News disabled → reported, no request); candidate
    review is exercised on a labelled demo run on `.test` sites.

Scope delivered: M8; agents D1, D2, D3, D7 (D4--D6 from Sprint 3);
exclusion at every boundary (planner guard, lead hosts, classifier on the
candidate's official site, fit/ranking, database upsert and review); AI
Discovery UI (run page per PRD §6.4, candidate review).

**Exit gate** ("natural-language discovery returns relevant, deduplicated,
evidence-backed candidates and respects all hard constraints"):

-   **Met with simulated providers and synthetic pages**: deduplication,
    evidence (official-site snapshot per candidate), hard constraints and
    permanent exclusions are enforced by deterministic code and tested at
    unit, pgTAP, integration and E2E levels.
-   **Not met for real use**: (1) relevance and extraction quality need a
    real provider for D1/D3 (PD-24a, thresholds PD-22); (2) the only
    approved search source, Hacker News, stays disabled until the Y
    Combinator terms page is read (blocked by the network policy) and the
    product owner enables it; (3) Product Hunt awaits written permission
    (PD-29). Until then discovery works from seed URLs and the controlled
    rebound, which fetch real official sites only when a member runs them.
-   **Deferred**: recurring discovery (PRD §6.5, Phase 2); Product Hunt
    (PD-29); Brave or another web-search API (deferred, no spending);
    full D5/D6 enrichment inside a run (the `product_enrichment` job
    covers it per product).

## Sprint 7 --- Reliability and production readiness

PD-27 approved on 6 November 2026: Render Background Worker in Frankfurt
(plan `0.5c-512mb`); Supabase projects to be created in Frankfurt. No
deployment, paid service or spending without a further approval.

**S7.1 (6 November 2026) — worker deployability:** `apps/worker/Dockerfile`
(self-contained bundle, Node.js 26.13.0 slim, non-root), `.dockerignore`,
`render.yaml` (staging worker, not applied), SIGTERM drain with lease
release (`sor_worker_release`, migration `20261109090000_worker_release.sql`,
pgTAP 016), steps never stored as completed when produced during a job
abort, watchdog (blocked event loop / stalled progress) and fatal-error
exits, periodic memory logs; CI runs the E2E worker from the image limited
to 512 MB and checks a clean SIGTERM exit. Runbook: `docs/DEPLOYMENT.md`.
Memory measured: idle ≈ 110 MB RSS; deep discovery (80 pages) ≈ +72 MB.

Validated by CI run 59 (all jobs green): image built, E2E against the
worker container, cgroup `memory.peak` 72.5 MiB of 512 MiB, SIGTERM exit 0.

**S7.2 (6 November 2026) — job quotas and rate limits:** migration
`20261110090000_job_quotas.sql` enforces, in `private.create_job` (every
job-creating RPC), the concurrency limit (M5), a daily job quota per
workspace (`workspace_max_jobs_per_day`, 200 per UTC day) and the per-user
hourly limit on job requests (`api_rate_limit_job_posts_per_hour`, fixed
windows in `rate_limit_counters`, as specified in §10); refusals are 429
`LIMIT_EXCEEDED` / `RATE_LIMITED` with the limit kind and `Retry-After`;
idempotent replays are answered without consuming; `sor_workspace_usage`,
`GET W/usage` and Settings > Quotas show usage (PRD §14.3). pgTAP 017,
unit, integration and E2E tests.

Validated by CI run 61 (all jobs green).

**S7.3 (7 November 2026) — monitoring, alerts, cost tracking:** migration
`20261111090000_ops_monitoring.sql` (`sor_ops_snapshot`: queue, stuck jobs
— lease expired past a grace period and not recovered, due job never
picked up —, 24 h outcomes, recent failures, provider errors over 1 h, AI
cost today / 7 days / per provider / per workspace, thresholds from
`platform_limits`; `ops_alerts` + `sor_ops_sync_alerts` with open /
refresh / resolve transitions; workspace AI cost of the day). Alert rules
are deterministic (`@sor/domain` `evaluateOpsAlerts`, `ops-alerts-1`): the
five alerts of Technical Blueprint §15 plus stuck jobs and failure rate.
The worker runs a monitoring cycle (`WORKER_MONITOR_INTERVAL_SECONDS`) and
logs `ops snapshot`, `alert opened`, `alert resolved`; the operator console
and `GET /api/v1/operator/health` show health and history; alert runbook in
`docs/DEPLOYMENT.md` §6. No external monitoring service (none approved).

**S7.4 (7 November 2026) — security and RLS review:** read-only audit
reported in `docs/SECURITY_REVIEW.md` (no critical or high finding; five
medium, five low). Decisions PD-30 to PD-33 (operator MFA AAL2, passwords ≥
12, migration order enforced in CI, CSP Report-Only then enforced) and
secret scanning approved on 7 Nov 2026. **S7.4a:** private-function grants
migration, pgTAP 019 privilege manifest, CI job "Security" (gitleaks over the
whole history, migration order, `pnpm audit`), Dependabot; a worker
leaves a job kind it cannot handle to another worker instead of failing it.
**S7.4b–c:** static security headers, per-request CSP with nonce
(Report-Only validated by the E2E suite with no violation, then enforced),
CSP report endpoint, E2E CSP guard, API route guard test with a role
manifest. **S7.4d:** action rate limits (`sor_consume_rate_limit`:
invitations per workspace, manual additions and correction reports per
user), invitation links from `SITE_URL` (required in staging and
production), passwords ≥ 12 with letters and digits and secure password
change (PD-31). **S7.4e:** the operator console and API require an
MFA-verified session (AAL2, TOTP; PD-30): enrolment and challenge screens,
`requireOperator` checks verified JWT claims, 403 `mfa_required` on the API.
All review findings are fixed or accepted (`docs/SECURITY_REVIEW.md`).


**S7.5 (7 November 2026) — failure-mode and load tests:** plan approved
(reproducible simulations on the local stack; correctness always blocking,
performance blocking only on major regressions; real PostgreSQL restart;
catalog benchmarks at 2K / 10K / 50K products; future bulk sources PD-34).
**S7.5a:** resilience harness and CI job, provider faults (F1–F3), queue
and worker faults (F6–F8), concurrent requests (F10–F11). **S7.5b:** atomic
agent-step start (`sor_step_start`, closes the S7.5a window), API outage
(F4), real PostgreSQL restart (F5), source faults (F9, with the fix: a
transient source failure on the last attempt gives `partial` instead of a
dead letter), SIGTERM under load in a real process (F13), API isolation
sweep over every workspace route (F12). Next: load tests and report (S7.5c).

Remaining Sprint 7 after S7.5: backups and restore drill; staging
deployment; operational runbooks.

-   **[ASSUMPTION]** Render plan IDs follow the Blueprint reference
    (`0.5c-512mb` = former "Starter"); to verify when the service is created.

-   **[ASSUMPTION]** `workspace_max_jobs_per_day` = 200: a safety ceiling,
    not a product limit; to tune on staging. Per-workspace AI cost caps wait
    for the PD-24 budgets (AI cost is 0 with the fake provider).

-   **[ASSUMPTION]** Alert thresholds (`ops_*` keys in `platform_limits`,
    e.g. 5 USD of AI cost per day) are starting values to tune on staging
    and with the PD-24 budgets. Host-side log alerts (Render) are to be
    configured by the product owner once staging exists.

-   Remaining: security and RLS review; load and failure-mode tests;
    backups and restore drill; staging deployment; operational runbooks.

Done when the application handles retries, source/provider outages,
worker restarts, duplicate requests and workspace isolation predictably.

## Later phases (PRD §18)

Phase 2: more sources, regular synchronisation and refresh, recurring
discovery, change detection, advanced comparator (comparison analyses),
catalog semantic search (vector), match scores, alerts, cluster
enrichment and history tracking, better distinct user/company detection.
Phase 3: autonomous candidate discovery, automatic competitor analysis,
new-opportunity detection, portfolio comparison, personalised
recommendations, market evolution history, weakening-product detection,
automatic market-gap detection, autonomous multi-cluster opportunity
generation, validation experiment tracking (M9).

## Definition of Done (every feature)

Behaviour matches the PRD; contracts validated; authorization and RLS
correct and tested; database changes delivered as migrations; empty,
loading, error, partial and stale states handled; tests cover normal and
failure paths; lint, typecheck and relevant tests pass; no secrets in
client code or logs; factual claims traceable; documentation updated;
limitations disclosed.

------------------------------------------------------------------------

# 16. Required documentation and ADRs

Maintained now: `docs/PRODUCT_REQUIREMENTS.md`,
`docs/TECHNICAL_BLUEPRINT.md`, `docs/IMPLEMENTATION_BLUEPRINT.md`,
`docs/ADR/` (ADR-000 to ADR-014 and the pending-decision register).

Created when the corresponding sprint starts (not before, to avoid
duplicating this blueprint): `docs/DATABASE_SECURITY.md` (created in S1,
from the pgTAP matrix), `docs/JOB_SYSTEM.md` (S3, verified PGMQ API),
`docs/DATA_SOURCES.md` (S3, per-connector terms review),
`docs/ENVIRONMENT.md` (created in S0), `docs/TESTING.md` (created in S0), `evals/README.md`
(S4). v1.0's list of eight further documents (architecture, database,
API, engines, gateway, scoring) is covered by the Technical Blueprint
and this document; split them out only if these become too large.

------------------------------------------------------------------------

# 17. Claude Code execution instructions

Use this document as the implementation contract.

## Required behavior

1.  Inspect the existing repository before changing files.
2.  Do not overwrite existing architecture or user work without
    inspection.
3.  Implement in the sprint order of §15 once approved; never implement a
    `PENDING_USER_APPROVAL` item before approval.
4.  Create small, reversible commits.
5.  Generate Supabase types after migrations.
6.  Never invent undocumented Supabase PGMQ function names; verify
    installed extension/API behaviour.
7.  Do not place service-role/secret keys in client bundles.
8.  Do not bypass RLS to make a test pass.
9.  Add tests with every schema, permission, API, or agent change.
10. Keep migrations, Zod schemas, TypeScript types, and docs
    synchronized.
11. Do not implement all agents in one giant prompt. Implement and
    evaluate each agent independently.
12. When a source connector is unavailable or unauthorized, mark it
    unavailable and continue with other sources.
13. Do not use mock data in production paths. Clearly label fixtures and
    demo records.
14. Do not claim an analysis is complete until all required stages are
    complete or explicitly marked partial.
15. At the end of each sprint, report changed files, migrations, tests
    run, failures, risks, and next tasks.
16. The reference SQL in §3 has not been executed: apply it, fix it, and
    update this document in the same change.

## Next task for Claude Code

The repository audit (4 November 2026) and the documentation
consolidation are complete, PD-01 to PD-23 were arbitrated, and Sprint 0
and Sprint 1 were implemented on 4 November 2026. The next task is
**Sprint 2** (catalog, Discover and workspace), on the product owner's
go-ahead. Do not start with AI agents.

------------------------------------------------------------------------

# 18. Official technical references

-   Supabase database migrations:
    https://supabase.com/docs/guides/local-development/database-migrations
-   Supabase Row Level Security:
    https://supabase.com/docs/guides/database/postgres/row-level-security
-   Supabase Queues quickstart:
    https://supabase.com/docs/guides/queues/quickstart
-   Supabase PGMQ: https://supabase.com/docs/guides/queues/pgmq
-   Supabase Cron: https://supabase.com/docs/guides/cron
-   Next.js Route Handlers:
    https://nextjs.org/docs/app/getting-started/route-handlers
-   Next.js Authentication:
    https://nextjs.org/docs/app/guides/authentication
-   Zod: https://zod.dev/
-   pgvector: https://github.com/pgvector/pgvector

These references were not reachable from the consolidation session
(network policy); the items depending on them are listed in Technical
Blueprint §19 and must be verified at the indicated sprint.

------------------------------------------------------------------------

# Final engineering principle

SaaS Opportunity Radar is an evidence-first research system.

The database stores products, companies, sources, and evidence. The
Discovery Engine finds and enriches candidates. The Pain Point
Intelligence Engine turns customer feedback into evidence-linked market
problems. The Opportunity Engine evaluates commercial potential. The
deterministic domain layer calculates scores and verdict gates. The
workspace stores the user's research decisions.

No AI agent is the source of truth. The source of truth is the versioned
data, the evidence, the business rules, and the audit trail.

------------------------------------------------------------------------

# Appendix A --- Audit traceability (v1.0 → v1.1)

Audit of 4 November 2026. "Verified" = reproduced with a disposable
PostgreSQL 16 instance during consolidation; "Reviewed" = confirmed by
reading the documents; "Unverified" = depends on external documentation
that was unreachable.

| ID | Finding | Check | Resolution | Where |
|---|---|---|---|---|
| A01 | Technical Blueprint missing | Reviewed | Created | `TECHNICAL_BLUEPRINT.md`, ADR-000 |
| A02 | PRD Markdown escaped (headings, tables, bold) | Reviewed | Unescaped; text identical otherwise | PRD |
| A03 | PRD §16 numbering alternated `1.`/`2)` | Reviewed | Normalised | PRD §16 |
| A04 | No `.gitignore`, `.env.example`, CI | Reviewed | Sprint 0 tasks | §15 |
| C1 | Pain Point Engine absent from blueprint/CLAUDE.md | Reviewed | Third engine specified | §7, M6, ADR-008, CLAUDE.md |
| C2 | Embeddings deferred vs MVP clustering | Reviewed | pgvector in MVP for clustering; catalog vector search Phase 2 | §0, M6, ADR-008 |
| C3 | `product_id NOT NULL` blocked non-product analyses | Reviewed | Polymorphic subjects | M7, §8.1, ADR-009 (PD-10) |
| C4 | REJECT by score not implemented; threshold ambiguous | Reviewed | Decision table | §9.6, ADR-005 (PD-06) |
| C5 | Vercel vs persistent worker | Reviewed (limits unverified) | Separate worker host | TB §14, ADR-001 (PD-03) |
| C6 | `original_text NOT NULL` vs storage rights | Reviewed | Nullable + `content_storage_status` + import rights declaration | M2, §4.4 |
| C7 | Fact status (confirmed/estimated/declared/unknown) missing | Reviewed | `fact_status` separate from `verification_status` | M1, M2, ADR-003 |
| C8 | Business model enum ≠ PRD §4.2.F | Reviewed | `billing_models[]` with PRD values | M1, §4.2 |
| C9 | Fit score produced by LLM vs deterministic | Reviewed | Deterministic only | §4.6, §6.8 |
| C10 | `not_observed` missing | Reviewed | Added + evidence check | M1, M2 |
| C11 | Sprint order vs PRD priority | Reviewed | Recommended order | §15, ADR-012 (PD-13) |
| C12 | Duplicate category names vs global unique slug | Reviewed | Parent-prefixed slugs | M2, M4 |
| C13 | Report lacked Cross-Competitor and Market Gap sections | Reviewed | Added | §8.10 |
| S1 | Migration 0001 helper functions before their table | **Verified** (PG16: `relation does not exist`) | Helpers created in M3 after tables | M3 |
| S2 | Browser could insert a "completed" analysis with any score | Reviewed | No insert grants; `sor_request_analysis` RPC; DB check on BUILD | M7 |
| S3 | `FOR ALL` policies let viewers delete | **Verified** (PG16: DELETE succeeds while UPDATE is refused) | Per-operation policies | M3 |
| S4 | Collection could be moved to another workspace | Reviewed | Column-level update grants | M3 |
| S5 | No update policy on `collection_items` | Reviewed | `notes` update policy | M3 |
| S6 | Broad grants on result tables | Reviewed | Select-only grants | M6--M8 |
| S7 | Global idempotency key could return another user's job | Reviewed | Scoped key + `request_hash` + 409 | M5 |
| S8 | `evidence_ids uuid[]` without integrity | Reviewed | Join tables, composite FKs, scope triggers | M2, M7, M8 |
| S9 | `source_records` overwrite lost history | Reviewed | `source_snapshots` per content hash | M2 |
| S10 | `normalized_domain UNIQUE` blocked multi-product domains | Reviewed | Removed; `entity_identifiers` | M2, §6.5 |
| S11 | Double source of truth for ownership and status | Reviewed | Ownership in members only; status PD-04 | M3, ADR-014 |
| S12 | Missing `prompt_version`, warnings, lease and cancel fields | Reviewed | Added | M5 |
| S13 | `english` full-text config vs French queries | **Verified as weaker than stated**: the PRD's French example matched with `english` stemming | Kept; tested in Sprint 2 | M2, §15 |
| S14 | No table existed for hide, report, tags, signals, presence, maturity, FX | Reviewed | Added | M2, M3 |
| S15 | No DB representation of exclusion | Reviewed | `exclusion_status`, assessments, guards, visibility RLS | M2, §5.4 |
| Z1 | `exclude_terms: []` disabled permanent exclusion; substring matching over-excluded | Reviewed | Removed from contracts; deterministic classifier | §4.3, §5.4 |
| Z2 | Rounding could cross the 75 threshold (decimal ratings) | Reviewed (only with non-integer ratings) | Integer ratings (PD-05); unrounded comparisons | §9 |
| Z3 | Assessed dimension without rating counted as 0 | Reviewed | Error + DB check | §9.3, M7 |
| Z4 | WTP from a second, independent input | Reviewed | Derived from WTP dimension | §9.3 |
| Z5 | Any kill criterion forced REJECT | Reviewed | Substantiation rule | §9.5 |
| Z6 | Rating required even with insufficient evidence; assessed with zero evidence allowed | Reviewed | Discriminated union + DB trigger | §4.8, M7 |
| Z7 | Candidate evidence cited free URLs | Reviewed | Snapshot references only | §4.6 |
| Z8 | `.url()` accepted `javascript:` | Reviewed | `HttpUrlSchema` | §4.1 |
| Z9 | Zod 4 `.default()` / enum-record semantics | **Unverified** (zod.dev unreachable) | Version-agnostic conventions + contract tests | §4.0 |
| Z10 | Monolithic agent output schema | Reviewed | Per-agent contracts | §4.9 |
| X1 | Supabase Auth signup open by default | Unverified (docs unreachable) | Signup disabled in all environments | TB §11 |
| X2 | `pgmq_public` exposure | Unverified | Never exposed to API roles | §2.1, M5 |
| X3 | New Supabase key model | Unverified | Verify in Sprint 1 | TB §19 |
| X4 | No SSRF-safe fetcher in blueprint | Reviewed | §5.2 | §5.2 |
| E1 | No Docker daemon / Supabase CLI in the cloud session | Verified | DB tests in CI or locally | TB §14, PD-01 |
| D1--D11 | Audit decisions | --- | ADR-000 to ADR-014; register | `docs/ADR/README.md` |

# Appendix B --- PRD coverage (nothing dropped)

| PRD section | Feature | Phase | Sprint | Specified in |
|---|---|---|---|---|
| §2 | Seven spaces and navigation | MVP | S2, S4--S6 | TB §13; PD-19 for cluster/comparator placement |
| §3.2 | Card content (logo … site) | MVP | S2 | §10 catalog DTOs |
| §3.3 | Feed, Grid, List | Feed + grid MVP (PRD §18); List also built in S2 (PRD §3.3, low cost) | S2 | §15 S2 |
| §3.4 | Card actions incl. hide, report, analyse | MVP | S2 (analyse S5) | M3, §10 |
| §3.5 | Ten sort orders, pagination without duplicates | MVP | S2 | §4.3, §10 |
| §4.1 | Text search; semantic search | MVP text; Phase 2 semantic | S2; Phase 2 | §4.3; §15 |
| §4.2 A--O | Filter catalogue | MVP subset PD-16; rest Phase 2 | S2+ | §4.3 |
| §4.3 | AND/OR, unknown handling, count, saved/duplicated searches | MVP | S2 | §4.3, §10 |
| §5.2--5.6 | Profile header, general, product, commercial, traction | MVP | S2--S3 | M2, §6.6 |
| §5.7 | Product analysis (strengths/weaknesses) | MVP | S5 | §8.2 |
| §5.8 | Reviews and structured problems | MVP | S3--S4 | M2, M6, §7 |
| §5.9 | Competitors, alternatives, table, AI comparison | MVP table; AI comparison Phase 2 | S2, S5; Phase 2 | M2, §8.5, §8.11 |
| §5.10 | Sources and reliability per field | MVP | S2--S3 | M2 provenance |
| §6.1--6.4 | AI Discovery engine and run page | MVP | S6 | §6 |
| §6.5 | Recurring searches | Phase 2 | --- | §6.9 |
| §7.1--7.3 A--C, E--I | Opportunity analysis phases | MVP | S5 | §8 |
| §7.2 | Analysis from category, competitor set, cluster, cross-cutting problem | MVP | S5 | M7, §8.1 |
| §7.3 D | Cross-Competitor Pain Intelligence | MVP | S4 | §7 |
| §8 | Scoring, thresholds, confidence, transversal scoring | MVP | S5 | §9 |
| §9 | Report format | MVP (exportable) | S5 | §8.10, PD-18 |
| §10 | Favourites, collections, notes, tags, history, scores, statuses, comparison | MVP | S2, S5 | M3, §10 |
| §10.3 | Statuses for SaaS and for generated opportunities | MVP | S2, S4 | M3, M6, PD-04 |
| §11 | Comparator for SaaS and for generated opportunities (simple; AI) | MVP simple (products S2, opportunities S5); Phase 2 AI for both | S2, S5; Phase 2 | §10, §8.11 |
| §12.1--12.13 | Data model | MVP | S1--S5 | §2.3 mapping |
| §12.14 | Validation experiments | Phase 3 (tracking) | Phase 3 | M9 |
| §13.1--13.2 | Sources and reliability hierarchy | MVP (limited connectors) | S3+ | M2, §5.1, ADR-013 |
| §13.3 | Differentiated refresh, cluster history | Phase 2 (refresh); MVP (cluster snapshots) | S4; Phase 2 | §13, M6 |
| §14.1--14.2 | Research and AI preferences | MVP | S2 (S4 for AI) | M3, §4.5 |
| §14.3 | Source status and quotas | MVP | S3 | M2 `sources`, §10 |
| §14.4 | Export, delete searches/analyses, CSV/JSON | MVP | S2, S5, S7 | §10 |
| §15 | Three separated engines, shared components, provider-neutral AI | MVP | S3--S6 | TB §4, §9 |
| §16 | Security, reliability and quality requirements 1--21 | MVP | all | §0 rules, M2, §5.4, §7.4, §9 |
| §17 | Design principles (dark mode first, premium, responsive) | MVP | S2+ | TB §13 |
| §19 | Acceptance criteria | MVP | S2--S6 | §6.9, §7.5, §14 |
| §20 | Performance indicators | MVP (views) | S7 | §13 |
| §21 | Locked decisions | --- | --- | ADR-000 to ADR-014 |
| §22 | Envisaged stack ("à confirmer") | --- | --- | TB, ADR-001, ADR-011 |
| §23 | Two end-to-end journeys | MVP | S2--S6 | §14 E2E |
