# ADR-011 — Toolchain, versions and CI

- **Status:** PENDING_USER_APPROVAL (PD-01) — blocks Sprint 0
- **Date:** 4 November 2026
- **Sources:**
  - `CLAUDE.md` §5 and §15 Sprint 0.
  - Implementation Blueprint v1.0 §0 (pnpm + Turborepo, Node.js LTS, strict TypeScript, Next.js App Router, Zod, Vitest, Playwright, pgTAP).

## Facts observed during consolidation

- Cloud session tools: Node v22.23.4, pnpm 10.28.0, psql/PostgreSQL 16 binaries.
- No Supabase CLI. The Docker client is present, but no daemon is running.
- The Node.js release page (read on 4 November 2026) lists v22, v24 and v26 as LTS lines, with v26 as the latest LTS.
- The Zod, Next.js and Supabase documentation was unreachable.

## Recommendation

- **Node:** pin a current LTS line after verification at Sprint 0 start (v24 or v26). Node 22 is not recommended for a new project, because it is the oldest LTS line.
- **Package tooling:** pnpm 10, Turborepo, strict TypeScript. pnpm and Turborepo themselves are ACCEPTED (Implementation Blueprint v1.0 §0); only the versions are pending here.
- **Libraries:**
  - Next.js: latest stable major at Sprint 0, checking authentication-related changes against the Supabase SSR guidance.
  - Zod: latest major. The contracts are already version-agnostic (Implementation Blueprint §4.0), and contract tests pin the sensitive behaviours.
- **Supabase CLI** pinned in CI; PostgreSQL version as provided by the pinned Supabase stack.
- **CI:** GitHub Actions, because the repository is hosted on GitHub.
  - Jobs: install, lint, typecheck, unit tests, build.
  - A database job runs `supabase start`, the migrations and `supabase test db` on a Docker-capable runner.
