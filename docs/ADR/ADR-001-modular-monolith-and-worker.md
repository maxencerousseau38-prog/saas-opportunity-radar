# ADR-001 — Modular monolith with a persistent worker; hosting

- **Status:** ACCEPTED (architecture; hosting PD-02 and PD-03 approved on 4 November 2026); worker host vendor PENDING_USER_APPROVAL (PD-27)
- **Date:** 4 November 2026
- **Sources:** `CLAUDE.md` §5 and §11; Implementation Blueprint v1.0 §0–1 (pnpm + Turborepo monorepo); PRD §22 ("séparer le frontend, les services de collecte, les tâches d'enrichissement et les moteurs IA"; "Ne pas lancer les analyses longues directement dans une requête HTTP classique").

## Decision

- **[ACCEPTED]** pnpm/Turborepo monorepo:
  - one Next.js App Router web application (`apps/web`);
  - one persistent Node.js worker (`apps/worker`);
  - shared packages with strict boundaries (`contracts`, `domain`, `database`, `data-sources`, `ai-gateway`, `discovery-engine`, `pain-point-engine`, `opportunity-engine`).
- **[ACCEPTED]** No microservices. Long work runs only in the worker. Route handlers create jobs and return `202`.
- **[ACCEPTED: PD-03, option A — Approved by the product owner on 4 November 2026]** Hosting:
  - The web app runs on Vercel (PRD §22, now confirmed).
  - The worker runs on a container host, in the same region as the Supabase project.
  - **[PENDING_USER_APPROVAL: PD-27]** The container host vendor and plan.
  - **[ASSUMPTION]** Vercel function duration limits make a persistent worker impossible there. This was not re-verified (the documentation was unreachable).
- **[ACCEPTED: PD-02, option A — Approved by the product owner on 4 November 2026]** Hosted environments: one staging and one production Supabase project in an EU region, using the newest available API key model (to be confirmed when the projects are created).

## Consequences

- Two deployable units (web, worker) and one database.
- Local development needs Docker for the Supabase CLI stack. The consolidation cloud session had no running Docker daemon, so database tests run in CI or on a developer machine.

## Alternatives considered

- Running analyses in serverless functions or Edge Functions. Rejected: duration limits and `CLAUDE.md` §11.
- Separate microservices per engine. Rejected: unnecessary complexity.
