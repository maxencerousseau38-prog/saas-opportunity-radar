# ADR-013 — Source acquisition and compliance

- **Status:** ACCEPTED (PD-14 approved on 4 November 2026; PD-28 approved on 6 November 2026); G2 and Product Hunt approval PENDING_USER_APPROVAL (PD-26, PD-29)
- **Date:** 4 November 2026
- **Sources:**
  - PRD §6.3 "Gestion des sources": an access method per connector; record what was consulted and what was unavailable; never consider a source integrated before its connector is developed and tested; no unauthorised scraping.
  - PRD §13.1, §12.5 (content storage rights), §18 (import, manual add, limited reliable connectors).
  - `CLAUDE.md` §7 (SSRF, terms, privacy).

## Decision (ACCEPTED)

- **Registry:** every source is registered in `sources` with:
  - its access method;
  - its terms URL and terms review;
  - its quotas;
  - an integration status.
- **Activation:**
  - `is_enabled` can be true only when `integration_status = 'integrated'`.
  - All sources start as `planned` and disabled.
- **Connector outcomes:** connectors return explicit outcomes (`ok`, `blocked`, `unavailable`, `not_supported`, `rate_limited`, `error`). They never fabricate data and never write to the catalog.
- **Safe fetcher:** all outbound fetches of untrusted URLs go through it (SSRF defences, redirect re-validation, limits, robots.txt for the official-website connector).
- **MVP acquisition:**
  - manual product entry;
  - CSV import of products;
  - CSV import of customer feedback, with a per-import rights declaration that drives `content_storage_status`;
  - the official-website connector.
- **Reliability of user data:** manual and imported data is `declared`, at reliability level 4, until verified.
- **Reviewer identities:** stored only as salted hashes, and only when permitted.

## Approved on 4 November 2026

- **PD-14 (A):** one review or community source is added only after a written terms review. **G2 is the first source to study.**
  - G2, Capterra, Reddit, X, LinkedIn, Crunchbase and Similarweb generally require an API agreement or a licence **[ASSUMPTION — not re-verified]**.
  - Until G2 is approved, the Pain Point Engine uses the declared CSV feedback imports.

## Still pending

- **PD-26:** approval of G2 after its written terms review (access method, licence, cost, storage rights). The review is prepared before Sprint 4.
- **PD-29:** Product Hunt as the second Discovery source, after its written answer to the permission request (`docs/sources/product-hunt-permission-request.md`, not sent) and a terms review.

## Approved on 6 November 2026

- **PD-28:** Discovery search sources, after the written review in `docs/DATA_SOURCES.md`:
  - Hacker News, **official API only** (metadata only; activation still needs the Y Combinator site terms to be read);
  - the product CSV import as a seed list;
  - the rebound from catalogued products' official websites, under the controls of `docs/DATA_SOURCES.md`;
  - Brave Search deferred (no spending); no source enabled in production.
