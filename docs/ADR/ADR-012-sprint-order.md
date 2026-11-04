# ADR-012 — Sprint order

- **Status:** ACCEPTED (PD-13, option A, approved on 4 November 2026)
- **Date:** 4 November 2026
- **Sources:**
  - `CLAUDE.md` v1.0 §15: Discovery Engine (S4) before Opportunity Engine (S5).
  - PRD §18: "Priorité absolue : vérifier la qualité de la détection des problèmes et la pertinence des opportunités générées avant d'étendre le nombre de connecteurs"; MVP includes manual add and data import.

## Options

| Option | Order after S3 | Notes |
|---|---|---|
| A (recommended) | S4 Pain Point Engine → S5 Opportunity Engine → S6 Discovery Engine → S7 hardening | Follows the PRD priority. The Opportunity Engine's customer-voice stage reuses the pain point pipeline. The catalog is fed by manual add and imports until S6. |
| B (v1.0 order) | S4 Discovery Engine → S5 Opportunity Engine (+ Pain Point) → S6 hardening | Builds automated discovery earlier, and requires search-source terms reviews earlier. |

## Common to both options

- S0: tooling.
- S1: database and security.
- S2: catalog, Discover and workspace.
- S3: sources, evidence, the job system and the AI gateway (D5 enrichment and D6 verification are the first LLM agents).
- The job system moves from v1.0's "Sprint 6 reliability" to S3, because enrichment is the first asynchronous work.

## Decision

Option A: S0 tooling → S1 database → S2 catalog/Discover → S3 sources/evidence/jobs/AI gateway → S4 Pain Point → S5 Opportunity → S6 Discovery → S7 hardening.
