---
name: sor-database-security
description: Design, review, test, or change SaaS Opportunity Radar Supabase schema, SQL functions, grants, RLS policies, migrations, generated types, or database access.
---

# SOR database security

Use this skill whenever changing Supabase schema, RLS, SQL, grants, auth, database repositories or generated types.

## Before implementation

1. Read `docs/DATABASE_SECURITY.md`, `docs/SECURITY_REVIEW.md`, ADR-003, ADR-007, ADR-010 and relevant later ADRs.
2. Inspect the current migration sequence, policies, grants, helper functions and matching pgTAP tests.
3. Confirm whether each table is global/server-owned, operational, or workspace-owned. Do not apply one generic policy pattern to all tables.

## Migration rules

- Create new files through `supabase migration new <descriptive_name>`; never invent a timestamp or edit an applied migration.
- Migrations are forward-only. Preserve migration ordering and run `node scripts/check-migrations.mjs` as prescribed by CI.
- Enable RLS on exposed tables and grant only the required operations. Workspace policies must verify membership and role, not merely `TO authenticated`.
- Protect immutable ownership fields with both correct grants and policies.
- Keep server-only tables and RPCs inaccessible to browser roles. Keep helpers in the intended private schema; narrowly justify any `SECURITY DEFINER` use and apply a fixed search path.
- Every policy or grant change must include pgTAP coverage for relevant roles and SELECT/INSERT/UPDATE/DELETE behavior.

## Generated types and verification

- Generate TypeScript types from the local Supabase stack after applying the repository migrations, using the same Supabase CLI version and command as `.github/workflows/ci.yml`.
- Compare the result against `packages/database/src/generated.ts`; do not generate replacement types from the live remote project when local CI is the source schema.
- Run local pgTAP, database lint/advisors, typecheck and the migration-order guard.
- Never apply, push, reset, seed, or otherwise mutate the remote Supabase project unless the product owner explicitly authorizes that exact action. If Docker or the local stack is unavailable, report the limitation and use the CI database job rather than switching to remote writes.
