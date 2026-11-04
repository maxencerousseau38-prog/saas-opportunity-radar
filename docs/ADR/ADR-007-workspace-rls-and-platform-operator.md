# ADR-007 — Workspace-scoped RLS, grants and platform operator role

- **Status:** ACCEPTED; operator holder PENDING_USER_APPROVAL (PD-12)
- **Date:** 4 November 2026
- **Sources:**
  - `CLAUDE.md` §7: RLS on every exposed table, minimal grants, server-only catalog writes, explicit roles, no recursion, atomic bootstrap, no self-promotion.
  - Implementation Blueprint v1.0 §11.
  - PRD §16.14: allow incorrect information to be corrected.
  - `CLAUDE.md` §3: flag ambiguous exclusions for review.

## Decision (ACCEPTED)

- **RLS in every migration:** each migration enables RLS and sets grants for its own tables. Policies are written per operation, always `TO authenticated`. There are no `FOR ALL` policies. Column-level update grants protect immutable columns.
- **Helper functions:**
  - They live in the non-exposed `private` schema as `SECURITY DEFINER`, with an empty `search_path`.
  - They take no user-ID parameter and always use `auth.uid()`.
  - They are created after their tables.
- **Catalog visibility:** authenticated users read catalog rows only for products that are `active` and `eligible`. Candidate, excluded and under-review products are served only through the API.
- **Server-written results:** runs, candidates, clusters, analyses, scores, findings and evidence links. Users get `SELECT` only. Exceptions: they may update `status`/`notes` of generated opportunities, and validation experiments are user-entered records.
- **Ownership:**
  - It lives only in `workspace_members`.
  - One owner per workspace.
  - Bootstrap goes through `create_workspace()`.
  - Transfer goes through the server-only `sor_transfer_ownership()`.
  - Nobody can change their own role.
- **Platform operator:**
  - A role outside workspaces (`platform_operators`).
  - Used only through operator API endpoints, with audit logs.
  - It resolves exclusion reviews and correction reports, and performs identity merges.
- **Signup:** public signup is disabled in every environment.

## Pending

- **PD-12:** who holds the operator role. Recommended: the product owner only.

## Corrections to v1.0

These were found by the audit. S1 and S3 were reproduced on PostgreSQL 16.

- Helpers created before their table (migration failure).
- `FOR ALL` policies that let viewers delete.
- Collections movable to another workspace.
- A browser able to insert a completed analysis with an arbitrary score.
- Broad grants on result tables.
- An unscoped idempotency key.
