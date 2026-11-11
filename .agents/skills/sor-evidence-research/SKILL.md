---
name: sor-evidence-research
description: Work on SaaS catalogue research, data-source connectors, enrichment, imports, evidence provenance, product identities, exclusions, Acquisition Channels, or visual assets.
---

# SOR evidence and source research

Use this skill for source discovery, data acquisition, web extraction, catalogue imports, factual enrichment and evidence-backed analysis.

## Required method

1. Read `docs/DATA_SOURCES.md`, ADR-002, ADR-003, ADR-010, ADR-013, `docs/PRODUCT_REQUIREMENTS.md` and the relevant section of `docs/IMPLEMENTATION_BLUEPRINT.md`.
2. Confirm the source, access method, terms, licence, commercial use, rights to store/excerpt/display, quotas, cost, refresh cadence and takedown requirements before activating a connector.
3. Use the existing source registry, safe-fetch controls, normalized identity resolution, evidence contracts and import/job pipeline.
4. Store source URL, observation date, provenance, confidence and verification status. Distinguish direct verified claims, attributed declarations, estimates and unknowns.
5. Apply permanent exclusion rules before a product or claim enters the catalogue or downstream engines.
6. Keep synthetic/adversarial fixtures separate from real catalogue counts and reports.

## Acquisition Channels and visuals

- Acquisition Channels describe how a catalogue SaaS acquires its own customers.
- Discovery Sources describe where SOR obtains data.
- Go-to-Market recommendations describe hypotheses for a new opportunity.
- Never merge these concepts or write a recommendation as an observed product fact.
- A channel is `confirmed` only with direct verifiable evidence; `declared` must be attributable; `estimated` must include method and evidence; `unknown` is not evidence of absence.
- Display a Landing Page Hero or product screenshot only when its source, rights status and verification state meet the approved resolver's requirements. Never fabricate an interface screenshot or hotlink an unapproved asset.
- Respect robots, access restrictions, rate limits, SSRF/redirect/body-size safeguards and provider terms. No private pages, login sessions, cookies or unrestricted crawling.

## Output quality

Cite every important factual claim to its captured source. Keep observations, inferences and recommendations clearly separated. Do not infer customer counts, revenue, payment proof, willingness to pay or commercial traction from price pages, logos, traffic estimates or social metrics alone.
