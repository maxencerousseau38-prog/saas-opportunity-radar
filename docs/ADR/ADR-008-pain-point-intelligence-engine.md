# ADR-008 — Pain Point Intelligence Engine as third engine

- **Status:** ACCEPTED (cluster scope PD-09 approved on 4 November 2026)
- **Date:** 4 November 2026
- **Sources:**
  - PRD §15 ("Il faut impérativement séparer les trois moteurs").
  - PRD §21 (locked decision "Moteur IA 2 : Pain Point Intelligence Engine").
  - PRD §7.3 Phase D.
  - PRD §18 (MVP: structured extraction, classification, semantic clustering, cross-competitor analysis, clusters, independent opportunities; "Priorité absolue").
  - PRD §19 acceptance criteria.

## Decision (ACCEPTED)

- **Package:** a separate `packages/pain-point-engine` with agents P1–P9. The deterministic agents are collection, normalization/deduplication, clustering and statistics. Embedding goes through the AI gateway. The LLM agents are extraction, verification, gap identification and opportunity generation.
- **Embeddings are in the MVP**, stored with `pgvector`, for clustering only. Catalog semantic search remains Phase 2 (PRD §18). This resolves the v1.0 "embeddings deferred" contradiction in favour of the PRD.
- **Clustering:**
  - It happens within the same problem category, so that problems sharing vocabulary are not merged (PRD §16.18).
  - The verifier may split clusters and remove outliers, but never merge them.
  - Users correct clusters through the API.
- **Counts are kept distinct:** raw volume, distinct authors and distinct companies, each with a verified / estimated / unknown status. Relative frequencies are computed when total review counts are known.
- **No scoring:** the engine never scores and never infers willingness to pay from complaints. Generated opportunities are unscored hypotheses until an Opportunity analysis is run on them.
- **Exclusion:** every generated hypothesis passes the permanent exclusion classifier (ADR-010).

## Approved on 4 November 2026

- **PD-09 (A):** scope:
  - workspace-scoped clusters and generated opportunities, because user corrections must not alter other workspaces' research;
  - global structured problems and embeddings, which are derived from public feedback and can be reused.
