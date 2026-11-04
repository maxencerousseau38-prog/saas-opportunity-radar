# ADR-001 — Modular monolith with a persistent worker; hosting

- **Status:** ACCEPTED (architecture); hosting items PENDING_USER_APPROVAL (PD-02, PD-03)
- **Date:** 4 November 2026
- **Sources:** `CLAUDE.md` §5 and §11; Implementation Blueprint v1.0 §0–1 (pnpm + Turborepo monorepo); PRD §22 ("séparer le frontend, les services de collecte, les tâches d'enrichissement et les moteurs IA"; "Ne pas lancer les analyses longues directement dans une requête HTTP classique").

## Decision

- **[ACCEPTED]** pnpm/Turborepo monorepo:
  - one Next.js App Router web application (`apps/web`);
  - one persistent Node.js worker (`apps/worker`);
  - shared packages with strict boundaries (`contracts`, `domain`, `database`, `data-sources`, `ai-gateway`, `discovery-engine`, `pain-point-engine`, `opportunity-engine`).
- **[ACCEPTED]** No microservices. Long work runs only in the worker. Route handlers create jobs and return `202`.
- **[PENDING_USER_APPROVAL: PD-03]** Hosting:
  - PRD §22 lists Vercel as envisaged but "à confirmer".
  - A persistent worker needs a container or VM host.
  - **Recommendation:** Vercel for the web app; a container host for the worker, in the same region as the Supabase project.
  - **[ASSUMPTION]** Vercel function duration limits make a persistent worker impossible there. This was not re-verified (the documentation was unreachable).
- **[PENDING_USER_APPROVAL: PD-02]** Hosted environments:
  - **Recommendation:** one staging and one production Supabase project in an EU region, using the newest available API key model.

## Consequences

- Two deployable units (web, worker) and one database.
- Local development needs Docker for the Supabase CLI stack. The consolidation cloud session had no running Docker daemon, so database tests run in CI or on a developer machine.

## Alternatives considered

- Running analyses in serverless functions or Edge Functions. Rejected: duration limits and `CLAUDE.md` §11.
- Separate microservices per engine. Rejected: unnecessary complexity.
