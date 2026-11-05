# Database security

**Created:** Sprint 1, 4 November 2026; updated in Sprint 2. Scope: migrations
M1–M4 (`supabase/migrations/2026110418*`) and the Sprint 2 migration
(`20261105090000_catalog_search_manual_add_operator.sql`). Decisions: ADR-003,
ADR-007, ADR-010.
Reference specification: Implementation Blueprint §3 and §12.

This document describes what the migrations enforce and which pgTAP file
proves it. When a policy changes, update the migration, the test and this
document in the same change.

## Principles

1. **RLS on every table** in `public`, enabled in the same migration that
   creates the table.
2. **No default exposure.** M1 revokes the default privileges that Supabase
   grants on new objects in `public`. Every table and function then grants
   exactly what it needs.
3. **One policy per operation**, always `TO authenticated`. There are no
   `FOR ALL` policies; v1.0 used them, and they let viewers delete data.
4. **Immutable columns** (`workspace_id`, `created_by`, …) are protected by
   column-level `UPDATE` grants: changing them fails with *permission
   denied*, before RLS is even evaluated.
5. **Helpers** live in the non-exposed `private` schema, are created after
   the tables they read, take no user-ID parameter (`auth.uid()` only), use
   `SET search_path = ''` and are `SECURITY DEFINER` only where needed to
   avoid policy recursion.
6. **Server-owned data** (the catalog, identity data, exclusion assessments,
   audit logs, limits and rules) is written only by the server role, which
   bypasses RLS and must never reach a browser.

## Roles

| Role | Meaning |
|---|---|
| `anon` | Not signed in. No access to any table or `public` function. |
| `authenticated` | Signed-in user. Access is decided by workspace membership and role. |
| `service_role` | Server and worker. Bypasses RLS; calls the server-only RPCs. |
| Workspace roles | `owner` (one per workspace), `admin`, `member`, `viewer`. |
| Platform operator | Product owner only (PD-12). Acts through audit-logged server endpoints, not through RLS. |

Public signup is disabled (`supabase/config.toml`, `[auth] enable_signup = false`).

## Catalog visibility (global data)

Authenticated users can **read** catalog rows only for products that are
`record_status = 'active'` and `exclusion_status = 'eligible'`. Dependent
rows follow the same rule:

| Table | Visible when |
|---|---|
| `saas_products` | active and eligible |
| `product_features`, `product_integrations`, `pricing_plans`, `product_categories`, `customer_feedback` | their product is visible |
| `competitor_links` | both products are visible |
| `companies` | the company owns at least one visible product |
| `company_people`, `company_signals`, `catalog_field_provenance` | their product or company is visible |
| `evidence_items` | their product or company is visible; category or market evidence only for a user-visible category |
| `source_snapshots`, `source_records` | referenced by visible evidence |
| `categories` | user-visible and active (excluded categories are always hidden) |
| `sources`, `fx_rates` | always |

The following tables are server-only, with no grant to `authenticated`:
`entity_identifiers`, `product_exclusion_assessments`, `platform_operators`,
`audit_logs`, `rate_limit_counters`, `platform_limits`, `exclusion_rules`.

Proved by `supabase/tests/001_schema_privileges.sql` and `002_catalog_visibility.sql`.

## Catalog integrity (server writes)

These rules hold even for the server role:

- Evidence attached to a feature, an integration, a pricing plan, a field
  provenance row or a competitor link must belong to the same product (or to
  its company).
- An evidence item cannot pair a product with another company.
- A customer review is an evidence item of type `customer_feedback` for the
  same product and snapshot.
- Traffic data is always an estimate.
- Community and inferred sources (reliability 3–4) cannot confirm a payment.
- An availability claim needs evidence; a feature that was not found is
  `not_observed`.
- An `active` product must have been through the exclusion classifier.
- A product cannot be made eligible while a primary category is permanently
  excluded, and an eligible product cannot receive such a category.

Proved by `supabase/tests/003_catalog_integrity.sql`.

## Workspace permission matrix (M3 tables)

S = select, I = insert, U = update, D = delete. A dash means denied.

| Table | viewer | member | admin | owner | non-member |
|---|---|---|---|---|---|
| `workspaces` | S | S | S | S, U(name) | — |
| `workspace_members` | S, D(self) | S, D(self) | S, I/U/D (non-owner, not self) | same as admin | — |
| `workspace_settings` | S | S | S, U | S, U | — |
| `collections` | S | S, I, U | S, I, U, D | S, I, U, D | — |
| `collection_items`, `tags` | S | S, I, U, D | S, I, U, D | S, I, U, D | — |
| `tag_assignments` | S | S, I, D | S, I, D | S, I, D | — |
| `saved_searches` | S | S, I, U(own), D(own) | S, I, U, D | S, I, U, D | — |
| `workspace_product_states` | S | S, I, U | S, I, U, D | S, I, U, D | — |
| `catalog_correction_reports` | S | S, I | S, I | S, I | — |

Additional rules:

- Users can only act on their own behalf (`created_by`, `added_by`,
  `updated_by`, `reported_by` = `auth.uid()`).
- Only visible products can be added to collections, states, tags and reports.
- Nobody can change their own role, add or promote an owner, or move a row
  to another workspace.
- A workspace is created only through `public.create_workspace(name)`. This
  inserts the workspace, the owner membership, the settings and an audit
  record atomically, within the per-user limit in `platform_limits`.
- Ownership changes only through `public.sor_transfer_ownership(…)`, which
  only the server role can execute.
- A correction report's resolution fields are written only by the server
  (operator path).

Proved by `supabase/tests/004_workspace_bootstrap.sql`,
`005_workspace_members.sql` and `006_workspace_data.sql`.

## Sprint 2 functions

| Function | Who can execute | Security | Rules |
|---|---|---|---|
| `public.catalog_search(…)`, `public.catalog_count(…)` | `authenticated` | invoker | Caller must be a member of the workspace (else `42501`); catalog RLS limits rows to visible products; hidden products need `include_hidden`; sort keys and page size are validated (`22023`). |
| `public.workspace_member_directory(workspace)` | `authenticated` | definer | Members only; returns member e-mails of that workspace. |
| `public.sor_manual_add_product(…)` | `service_role` | definer | Requester must be owner, admin or member; needs an exclusion outcome; an existing canonical URL returns the existing product; active only when `eligible`; data stored as `declared` evidence (reliability 4); audit-logged. |
| `public.sor_add_member_by_email(…)` | `service_role` | definer | Actor must be owner or admin; never `owner`; unknown e-mail → `P0002` (the API then sends a Supabase Auth invitation); audit-logged. |
| `public.sor_operator_exclusion_decision(…)` | `service_role` | definer | Platform operator only; resolves `needs_review` only (R1–R5 exclusions are final, `55000`); reason required; audit-logged. |
| `public.sor_operator_resolve_report(…)` | `service_role` | definer | Platform operator only; open reports only; audit-logged. |

The web API derives the acting user from the verified session and passes it to
the service-role functions, which re-check membership and roles themselves.

Proved by `supabase/tests/007_catalog_search.sql`,
`008_manual_add_operator.sql` and `009_members_directory.sql`.

## Sprint 3: jobs, queue and evidence pipeline

`job_executions`, `agent_step_runs` and `provider_usage` have RLS enabled, no
policy and no grant to `anon` or `authenticated`: they are server-only. Job
status reaches users only through API DTOs, after a membership check, and
never with the job payload. The `pgmq` schema is revoked from `public`,
`anon` and `authenticated`.

| Function | Who can execute | Rules |
|---|---|---|
| `public.sor_request_job(…)` | `service_role` | Requester must be owner, admin or member; Sprint 3 kinds only (`product_enrichment`, `catalog_import`, `feedback_import`); enrichment needs an active, eligible product with an official URL (`EXCLUDED_SUBJECT` otherwise); imports need a CSV text, a row count within `import_max_rows` and, for feedback, a rights declaration. Calls `private.create_job`: idempotency scoped to (workspace, requester, kind, key) with a request hash (`IDEMPOTENCY_CONFLICT`), per-workspace concurrency limit (`LIMIT_EXCEEDED`), queue message sent in the same transaction. |
| `public.sor_cancel_job(…)` | `service_role` | Member+ of the job's workspace; another workspace's job reads as not found; queued jobs stop at once, running ones are flagged. |
| `public.sor_worker_*` | `service_role` | Read, claim (lease, stale recovery, dead letter), heartbeat (lease owner only, surfaces cancellation), retry (backoff), finish (archives the message), orphan requeue, poison archive (audited). |
| `public.sor_record_snapshot(…)` | `service_role` | Only integrated, enabled sources; one snapshot per content hash. |
| `public.sor_apply_enrichment(…)` | `service_role` | The step must belong to the job; evidence must cite a recorded snapshot; only whitelisted product and company columns; one current provenance row per field; contradictions recorded in `evidence_conflicts`; idempotent per step; re-classification only stricter. |
| `public.sor_import_product_row(…)`, `public.sor_import_feedback_row(…)` | `service_role` | Running import job only; declared evidence of reliability 4; idempotent per canonical URL / review hash; feedback only for visible products, text stored according to the rights declaration. |

Proved by `supabase/tests/010_jobs_queue.sql` and `011_evidence_pipeline.sql`,
and end to end by the worker integration tests (`apps/worker/test/integration`).

## Sprint 4: Pain Point Intelligence (M6)

- `feedback_problems` and `feedback_problem_embeddings` are global and
  server-only (no browser grant). Workspace tables (`pain_point_runs`,
  `pain_point_run_products`, `pain_point_clusters`, `pain_point_evidence`,
  `pain_point_cluster_snapshots`, `market_gaps` and links,
  `generated_opportunities` and links) are readable by members only;
  browsers write nothing there except `status`, `is_favorite` and `notes`
  of a generated opportunity (column grants, member+).
- Triggers keep evidence in scope: a problem takes the product of its
  feedback; a problem joins a cluster only if its product is in the run's
  frozen scope; gap evidence must concern the run scope (or be
  market-level). Excluded hypotheses can never be stored (check).
- Every pain point RPC is `security definer`, `search_path = ''` and
  executable by `service_role` only; user actions check the actor's role
  inside the function (member+ to start, correct or retry; admin+ to
  delete) and corrections are audit-logged.
- A run's status mirrors its job through a trigger on `job_executions`.
- Tests: `supabase/tests/012_pain_points.sql`.

## Running the tests

- **CI** (reference): the `database` job of `.github/workflows/ci.yml` runs
  the following on the real local Supabase stack:
  - `supabase test db`;
  - `supabase db lint`;
  - the security advisors;
  - a check that the generated types are up to date.
- **Developer machine**: `supabase start`, then `supabase test db`.

The test files share their helpers and fixtures through
`supabase/tests/000_setup.sql`, which installs them in a `tests` schema of the
test database only. Each other file runs inside a transaction that is rolled
back.
