# ADR-011 — Toolchain, versions and CI

- **Status:** ACCEPTED (PD-01, option A, approved on 4 November 2026)
- **Date:** 4 November 2026
- **Sources:**
  - `CLAUDE.md` §5 and §15 Sprint 0.
  - Implementation Blueprint v1.0 §0 (pnpm + Turborepo, Node.js LTS, strict TypeScript, Next.js App Router, Zod, Vitest, Playwright, pgTAP).

## Facts observed during consolidation

- Cloud session tools: Node v22.23.4, pnpm 10.28.0, psql/PostgreSQL 16 binaries.
- No Supabase CLI. The Docker client is present, but no daemon is running.
- The Node.js release page (read on 4 November 2026) lists v22, v24 and v26 as LTS lines, with v26 as the latest LTS.
- The Zod, Next.js and Supabase documentation was unreachable.

## Approved choice

- **Node:** pin the most recent LTS line after verifying the official release schedule at Sprint 0 start (v24 or v26). Node 22 is not used.
- **Package tooling:** pnpm 10, Turborepo, strict TypeScript. pnpm and Turborepo themselves are ACCEPTED (Implementation Blueprint v1.0 §0); only the versions are pending here.
- **Libraries:**
  - Next.js: latest stable major at Sprint 0, checking authentication-related changes against the Supabase SSR guidance.
  - Zod: latest major. The contracts are already version-agnostic (Implementation Blueprint §4.0), and contract tests pin the sensitive behaviours.
- **Supabase CLI** pinned in CI; PostgreSQL version as provided by the pinned Supabase stack.
- **CI:** GitHub Actions, because the repository is hosted on GitHub.
  - Jobs: install, lint, typecheck, unit tests, build.
  - A database job runs `supabase start`, the migrations and `supabase test db` on a Docker-capable runner.

## Versions pinned in Sprint 0 (4 November 2026)

| Tool | Version | Note |
|---|---|---|
| Node.js | 26.13.0 | Active LTS since 28 Oct 2026, per the official release schedule read at Sprint 0 start |
| pnpm | 10.34.9 | Latest of the approved 10.x line. pnpm 12 exists; moving to it would need a new decision |
| TypeScript | 6.0.3 | The approved "latest" would be 7.0.2, but typescript-eslint 8.72 requires `<6.1.0`; 6.0.3 is the latest compatible version |
| Next.js / React | 16.4.5 / 19.3.1 | Latest stable |
| Zod | 4.6.7 | Latest major; behaviours pinned by contract tests |
| ESLint / typescript-eslint | 10.14.0 / 8.72.1 | |
| Vitest / Playwright | 5.1.0 / 1.64.1 | |
| Turborepo / tsup / Prettier | 2.11.10 / 9.0.0 / 3.9.10 | |
| Supabase CLI | 3.0.0 | Local stack uses PostgreSQL 17 |
| CI | GitHub Actions | `.github/workflows/ci.yml`: checks, e2e, database jobs |

All versions are centralised in the `catalog:` of `pnpm-workspace.yaml`.

