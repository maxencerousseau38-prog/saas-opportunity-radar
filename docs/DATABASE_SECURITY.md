# Database security

**Created:** Sprint 1, 4 November 2026. Scope: migrations M1–M4
(`supabase/migrations/2026110418*`). Decisions: ADR-003, ADR-007, ADR-010.
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
