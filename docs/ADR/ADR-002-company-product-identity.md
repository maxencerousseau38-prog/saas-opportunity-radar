# ADR-002 — Company/product separation and product identity

- **Status:** ACCEPTED
- **Date:** 4 November 2026
- **Sources:** `CLAUDE.md` §6 ("A company can own multiple products"; "Avoid using product names alone for identity matching"; "Handle renamed products, acquisitions, and domain changes without losing history"); Implementation Blueprint v1.0 §6.5; PRD §16.11 (detect duplicates).

## Decision

- Companies and products are separate tables. A product optionally belongs to a company.
- Identity keys are stored in `entity_identifiers` with validity periods: canonical URL, domain, external ID, alias name.
- Matching order:
  1. canonical product URL;
  2. source external ID;
  3. registrable domain, only when it maps to exactly one product and is not a shared-host domain;
  4. company relationship;
  5. name similarity, which only triggers a review.
- Merges set `record_status = 'merged'` and `merged_into_product_id`. Nothing is deleted.
- Correction to v1.0: `saas_products.normalized_domain` is no longer globally unique, because one company may host several products on one domain.

## Consequences

- Repeated imports are idempotent through normalized identifiers.
- The platform operator performs merges (ADR-007).

## Alternatives considered

- A unique domain per product, as in v1.0. Rejected: it blocked legitimate multi-product companies and products hosted on shared platforms.
