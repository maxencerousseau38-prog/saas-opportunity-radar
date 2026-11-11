# Data sources — terms reviews and integration status

**Last updated:** 10 November 2026 (first bulk catalog collection: catalog sources review, Wikidata integrated)
**Governs:** ADR-013 (source acquisition and compliance), PD-14 method, PD-28.

This document is the written terms review required by ADR-013 before a
source may be integrated. One section per source records what was read,
when, what it allows, and the controls the connector must enforce. Facts
are quoted from the official page whenever it could be read; anything not
read on an official page is marked **(to verify)** and blocks activation.

A source is usable by an engine only when its `sources` row has
`integration_status = 'integrated'` **and** `is_enabled = true` (database
check). Integration means: connector developed, tested, terms reviewed here,
and approved by the product owner. **No source is enabled in production by
Sprint 6** (product-owner instruction, 6 November 2026). Since 10 November
2026, the catalog sources `wikidata` and `uneed` are integrated and enabled
by migration (first bulk catalog collection, product-owner instruction); no
hosted environment exists yet, so nothing runs in production.

## Summary

| Source key | Use | Access | Cost | Reliability (PRD §13.2) | Storage policy | Status |
|---|---|---|---|---|---|---|
| `manual_entry` | Catalog | Operator form | 0 | 4 (declared) until verified | Full (user-supplied) | Integrated (Sprint 2) |
| `user_import` | Catalog, feedback | CSV with per-import rights declaration | 0 | 4 (declared) until verified | Per declaration (`content_storage_status`) | Integrated (Sprint 3) |
| `official_website` | Enrichment, identity, **discovery rebound** | Safe fetcher, robots.txt | 0 | 1 (primary) | Full text of public pages (snapshots) | Integrated (Sprint 3); controlled rebound implemented in Sprint 6 (`packages/data-sources/src/rebound.ts`) |
| `hacker_news` | Discovery leads | Official HN API (Firebase), read-only, no key | 0 | 3 (community) for the launch fact only | Metadata only (see below) | **Approved 6 Nov 2026 (PD-28); connector implemented and tested on synthetic responses; registry row `planned`, disabled** (migration M8); activation blocked until the open verification below is done |
| `product_hunt` | Discovery leads | API v2 (OAuth token) | 0 | 3 | — | **Not approved**: written permission requested from Product Hunt first (draft: `docs/sources/product-hunt-permission-request.md`, not sent) |
| `brave_search` | Web search leads | API key, metered billing | Paid | — | Transient only | **Deferred** by the product owner (no spending) |
| `wikidata` | **Catalog (bulk)** | Public SPARQL query service, no key | 0 | 3 (community-declared) | Full (CC0) | **Integrated and enabled (10 Nov 2026)**: first bulk catalog source (migration `20261116090001_catalog_sources`) |
| `product_hunt` (catalog) | Catalog (fresh launches) | API v2, OAuth token | 0 | 3 | Metadata only | **Registered `planned`, disabled**: non-commercial use only; needs a token created by the product owner |
| `uneed` | **Catalog (recent launches)** | Official read-only API, no key | 0 | 3 (maker-declared) | Metadata only | **Integrated and enabled (10 Nov 2026)** (migration `20261117090001_uneed_source`) |

Sources of PRD §13.1 not retained for discovery: see "Not retained".

## Review method

1. Read the official terms, API documentation and pricing pages (no API
   call is made during a review).
2. Record: access method, authentication, rate limits and quotas, cost,
   commercial-use conditions, storage/caching rights, attribution, personal
   data involved.
3. Derive the connector controls (quotas, storage policy, fields kept).
4. The product owner approves the source (PD entry in `docs/ADR/README.md`).
5. A migration inserts the `sources` row as `planned`, disabled; the row
   becomes `integrated` only with a tested connector, and `is_enabled` only
   on an explicit product-owner go-ahead per environment.

**Network limitation (6 November 2026):** the cloud environment's network
policy denies `www.ycombinator.com`, `news.ycombinator.com`,
`hn.algolia.com`, `www.producthunt.com`, `api.producthunt.com`,
`brave.com` and `api-dashboard.search.brave.com` (proxy answered 403 to
CONNECT). Only `github.com` / `raw.githubusercontent.com` could be read.
The open verifications below must be completed once the product owner adds
those domains to the environment's allowed domains (pages are read only;
no API call).

---

## Catalog sources review (10 November 2026, first bulk collection)

Instruction of the product owner (10 Nov 2026): collect real, recent and
varied SaaS massively from the best catalog libraries (Product Hunt,
Microlaunch, Uneed and others), after checking their real access and terms,
without unauthorized scraping. The official pages were frozen by the
`eval-snapshot` workflow on GitHub runners (this session's network policy
blocks them): `docs/sources/terms/` (`index.json` lists URL, date, status).

| Source | Access | What the official page says | Decision |
|---|---|---|---|
| **Wikidata** | Public SPARQL service, no key | "All structured data (i.e. the main, Property, Lexeme, and EntitySchema namespaces) is released into the public domain under Creative Commons Zero" (Wikidata:Licensing). WDQS manual: "a hard query deadline configured which is set to 60 seconds"; "One client (user agent + IP) is allowed 60 seconds of processing time each 60 seconds"; "access to the service is limited to 5 parallel queries per IP"; "Clients who don't comply with the User-Agent policy may be blocked completely". | **Retained — first connector, integrated and enabled.** Volume: several thousand software products with an official website, all categories; quality: curated identities (official site, inception, country, developer); freshness: weaker for recent launches. |
| **Product Hunt** | API v2 (GraphQL), OAuth token | "The Product Hunt API must not be used for commercial purposes. If you would like to use it for your business, please contact us at hello@producthunt.com." "Currently the API is only accessible with a provided access_token." Terms of service page: HTTP 403 (not readable from the runners). | **Retained — second connector, not enabled.** Best freshness (daily launches). Allowed for SOR's personal, non-commercial use with a token the product owner creates in the API dashboard (never pasted in chat: a repository secret). Commercial use needs Product Hunt's permission (PD-29 draft). |
| **Hacker News** (official API) | Firebase API, no key | Y Combinator Terms of Use: "you agree not to modify, copy, frame, scrape … the Site or the Site Content … In connection with your use of the Site you will not engage in or use any data mining, robots, scraping or similar data gathering or extraction methods", except "as expressly authorized"; no commercial use. The official API is the means Hacker News makes available. | **Kept as approved (PD-28)**, metadata only, personal non-commercial use; a Show HN item is a lead that needs its official site (Discovery), not a ready catalog record. Open verification of 6 Nov 2026 now done. |
| **SaaSHub** | Beta JSON API, personal `api_key` | "To make requests and access the API you need an API key"; "If you are using the API, you have to disclose somewhere on your website that you are using SaaSHub' API." Lists of alternatives are "licensed under Creative Commons: Attribution-ShareAlike 4.0". | **Candidate for later** (alternatives graph); needs an account key and attribution/ShareAlike handling. |
| **Microlaunch** | No API or feed found | "Permission is granted to temporarily download one copy of the materials on our Website for personal, non-commercial transitory viewing only … you may not: modify or copy the materials". | **Not retained** (copying prohibited; scraping would be unauthorized). |
| **BetaList** | No API or feed found | Same licence wording: "personal, non-commercial transitory viewing only … you may not: modify or copy the materials". | **Not retained.** |
| **Y Combinator company directory** (and the `yc-oss` mirror built from its search index) | No official API | The Terms of Use above prohibit copying and scraping the Site Content. | **Not retained.** |
| **Uneed** | Official read-only REST API and MCP server, no key | OpenAPI "Uneed read API" 1.1.0: "Read-only API over uneed.best product data … No authentication in v1; per-IP rate limits apply." uneed.best/mcp: "Query 10,000+ community-ranked products … free, read-only, no signup"; "Clean, structured, rate-limited access to our data: the legitimate alternative to scraping." Terms of use (`/terms-of-use`) forbid "automated use of the system, such as using scripts to send comments or messages" and bots that manipulate votes or rankings; "The Platform and its original content … are owned by Uneed". No licence is stated for product data (the monthly launch statistics are CC BY 4.0). | **Retained — second connector, integrated and enabled (10 Nov 2026)**: freshest source of indie SaaS launches; metadata only with attribution (see controls below). |

### `uneed` — controls

- Collector: `packages/data-sources/src/connectors/uneed.ts`, same
  *Catalog collection* workflow, output `data/catalog/uneed/listings.json`.
- The API has no pagination: the collector reads the latest launches of
  each category (`/v1/launches`, 50 per category) and the monthly and weekly
  community rankings since February 2024 (`/v1/trending`, 50 per period),
  one request at a time with a 1.2 s pause, at most 400 requests, and stops
  at the first HTTP 429 (never a retry loop). Descriptive User-Agent with the
  repository URL.
- Kept: name, the product's own website (referral parameters removed; a
  uneed.best URL is never taken as the product site), short description,
  category and tags, launch year, the Uneed page as source link. Not kept:
  logo, images, reviews, ratings, votes, social profiles, deals, for-sale
  data, maker identity.
- Attribution: every listing carries "Source: Uneed, uneed.best" in its
  licence field and its evidence links to the Uneed page. If Uneed objects
  or states a different licence, the source is disabled by a migration and
  its rows can be traced through their evidence.

### `wikidata` — controls

- Collector: `packages/data-sources/src/connectors/wikidata.ts`, run by the
  **Catalog collection** workflow (`.github/workflows/catalog-collect.yml`),
  output committed in `data/catalog/wikidata/listings.json` (contract
  `catalog-listing-1`, `@sor/contracts`).
- Selections (light queries returning ids only): instances of software as a
  service and its subclasses, items distributed as SaaS, web applications
  and their subclasses, web services; each item must have an official
  website (P856). Details are read in batches of 150 ids: English label and
  description, official website, inception, country of origin (or the
  developer's country), developer, classes / genres / uses.
- Dropped: dissolved (P576) or discontinued (P2669) items, websites, social
  networks, video games, online newspapers, search engines and similar
  non-product classes.
- Etiquette: one query at a time, 1 s pause, descriptive User-Agent with the
  repository URL (no personal data), no retry loop on 429/504.
- Ingestion (`apps/worker/src/catalog/ingest.ts`, RPC
  `sor_ingest_catalog_listing`): identity by canonical URL and by Wikidata
  id (never the name alone); a listing on a shared host (app stores, code
  hosts, large vendors' shared domains) or matching an existing product only
  by domain is **not imported** and counted for review; companies are
  deduplicated by the developer's Wikidata id; the permanent exclusion
  classifier runs on the name, description and source classes (excluded and
  `needs_review` products are stored hidden); categories come from the
  deterministic mapping `catmap-1` (`@sor/domain`), none when nothing
  matches. Every stored field has provenance: a declared, third-party
  evidence item (reliability 3) on a snapshot that keeps the listing and its
  licence; re-ingesting the same listing creates nothing.
- What Wikidata facts are not: verified product facts, pricing, customers,
  traction or willingness to pay. They stay `declared` until an official
  source confirms them.

### First collection results (10 November 2026, CI)

| Snapshot | Listings | Created and visible | Hidden by the permanent exclusion | Matched an existing product | Sent to review | Write errors |
|---|---|---|---|---|---|---|
| Wikidata | 2,577 | 2,320 | 5 | 36 | 216 (shared host 100, same domain other URL 111, similar name 5) | 0 |
| Uneed | 6,582 | 6,197 | 23 | 18 | 344 (shared host 190, same domain other URL 134, similar name 20) | 0 |

Uneed listings are launches of February 2024 to November 2026; Wikidata
covers all years. About a quarter of the created products have no category
(the source states none the deterministic mapping recognises): they stay
uncategorised, never guessed. Matches between the two sources (same
canonical URL) keep both sources as evidence on one product.

Discover at this scale: the first load made the catalog search and count
take ~18–25 s as a viewer in CI, past the browser role's 8 s statement
timeout. Cause (EXPLAIN ANALYZE): the catalog filter function joined
companies with a nested loop that ran the companies RLS helper once per
product and company pair (5.4 million calls for ~8,600 products and ~630
companies). Migration `20261120090001_catalog_filtered_company_lookup.sql`
looks the company up once per product by primary key (same semantics):
17.9 s → 0.9 s locally on the real snapshots. The ingester also refreshes the
planner statistics after a bulk load (`sor_catalog_refresh_statistics`); that
alone did not fix the timeout.

Storage labels (S8.1, 11 November 2026): a catalog snapshot follows its
source's storage policy. Wikidata (`full`, CC0) snapshots are `stored_full`;
Uneed (`metadata_only`) snapshots are `reference_only`: the ingester keeps the
normalized listing metadata and its licence/attribution, never page content.
Migration `20261121090001_catalog_snapshot_storage_policy` makes the RPC
derive the label from `sources.storage_policy` and relabels earlier Uneed
snapshots that were wrongly marked `stored_full` (only those with no raw
content and the listing metadata present; one audit row records the count).
Verified locally on the real snapshots: 6,238 Uneed snapshots relabelled,
2,361 Wikidata snapshots unchanged, evidence untouched, replay idempotent.

## `manual_entry` and `user_import` (existing)

- Data supplied by the product owner. Imported products and feedback are
  `declared`, reliability level 4, until verified (ADR-013).
- Feedback imports carry a per-import rights declaration that sets
  `content_storage_status` (`stored_full`, `excerpt`, `reference_only`).
  Reviewer identities are stored only as salted hashes, and only when
  permitted.
- **Discovery use (approved 6 Nov 2026):** a list of product URLs supplied
  by the user (existing product CSV import) is a valid discovery seed. Each
  URL is only a lead: the candidate is built from the product's own
  official site (below).

## `official_website` (existing; discovery rebound approved 6 Nov 2026)

- Public pages of a product's own site, fetched through `safeFetch`
  (Implementation Blueprint §5.2: SSRF defences, redirect re-validation,
  size, timeout and content-type limits), obeying `robots.txt` for the
  `SaaSOpportunityRadar` token, neutral user agent without personal data,
  per-host minimum interval (2 s) and 30 requests/minute.
- No login, no cookies, no authenticated or paywalled content.
- Reliability level 1 for official claims about the product itself
  (features, pricing, positioning). A paid plan proves a paid plan is
  offered, never paying customers.

### Discovery rebound — controls ("sous contrôle")

The rebound reads pages of **already catalogued products' own sites** to
find other products they mention (integration directories, alternatives
and comparison pages). It is not a crawler. Controls enforced by code:

1. **Seeds:** only products that are `active` and `eligible`, chosen by the
   run (explicit seed list or products of the requested categories),
   capped per run by depth.
2. **Pages:** only on the seed's own registrable domain, only paths
   matching an allow-list (integrations, apps, marketplace, alternatives,
   compare, `-vs-`), at most 3 pages per seed; `robots.txt` obeyed.
3. **Links:** only external links to a different registrable domain;
   shared hosts (app stores, marketplaces, social networks, code hosts —
   `SHARED_HOST_DOMAINS`) and the seed's own subdomains are dropped; at
   most 20 leads per seed.
4. **Depth 1:** a lead is never used as a seed in the same run (no
   recursive crawling); every run is started by a user, never
   autonomously.
5. **A lead is not a candidate:** the candidate exists only after its own
   official site is fetched and the Candidate Extractor (D3) cites that
   snapshot; the rebound page is recorded as the provenance of the lead
   ("product X mentions product Y", level 1 for that fact only).
6. Permanent exclusions apply to leads and candidates as everywhere else
   (link text naming an excluded theme does not make a candidate eligible
   or ineligible; the classifier runs on the candidate's official site).
7. Budgets (pages fetched, leads kept) are per run and reported in
   `sources_report`.

## `hacker_news` — official Hacker News API (approved 6 Nov 2026, PD-28)

**Scope approved:** the official API only (`https://hacker-news.firebaseio.com/v0/`).
The Algolia-hosted HN search (`hn.algolia.com`) is **not** approved.

**Read on the official page** — `https://github.com/HackerNews/API`
(README and LICENSE, read 6 November 2026 via raw.githubusercontent.com):

- "In partnership with Firebase, we're making the public Hacker News data
  available in near real time."
- "This first iteration will have URIs prefixed with
  `https://hacker-news.firebaseio.com/v0/` … There is currently no rate
  limit."
- "Clients should gracefully handle additional fields they don't expect,
  and simply ignore them." Changes "won't always be backward compatible"
  (versioned URIs).
- Items: `/v0/item/<id>.json` with `id`, `type` (job, story, comment, poll,
  pollopt), `by`, `time`, `text`, `url`, `score`, `title`, `descendants`,
  `dead`, `deleted`.
- Lists: "Up to 500 top and new stories are at `/v0/topstories` … and
  `/v0/newstories`"; "Up to 200 of the latest Ask HN, Show HN, and Job
  stories are at `/v0/askstories`, `/v0/showstories`, and
  `/v0/jobstories`"; `/v0/maxitem` ("You can walk backward from here to
  discover all items"); `/v0/updates`.
- No authentication or key is described. Bugs: api@ycombinator.com.
- The repository is under the MIT License ("Copyright (c) 2025 Y
  Combinator Hacker News"). The licence covers the repository; it does not
  state the licence of the data served by the API.

**Not stated on that page:** a licence for the data, commercial-use
conditions, storage/caching limits, attribution. These are governed by the
Hacker News / Y Combinator site terms — **(to verify)** at
`https://www.ycombinator.com/legal/` (blocked by the network policy on
6 November 2026). **Open verification — blocks activation** (not
development with synthetic fixtures).

**Capabilities and limits for discovery (from the README):**

- No full-text search in the official API. The connector reads the latest
  Show HN stories (≤ 200) and, within a run budget, walks backward from
  `maxitem` over story items, then matches the planner's keywords locally
  on titles. Coverage is therefore **recent launches only**, skewed towards
  developer and technical products; the run's `limitations` says so.
- A Show HN story's `url` is a lead to an official site; stories without a
  URL, `dead` or `deleted` items are ignored.

**Connector controls:**

- Read-only GET requests to `hacker-news.firebaseio.com` through
  `safeFetch` (JSON content type), self-imposed limits although none is
  published: 60 requests/minute, 5,000/day (`sources.rate_limit_per_minute`,
  `quota_per_day`), per-run caps by depth.
- **Storage policy: metadata only.** Kept per lead: item id, `type`,
  `title`, `url`, `time`, `score`, `descendants`, and the item URL
  `https://news.ycombinator.com/item?id=<id>` as the source reference.
  **Not kept:** `by` (username) and `text` (user-written content); no user
  profile is ever fetched. Snapshots are `reference_only`.
- Reliability level 3 for "launched on Hacker News on date D, score S";
  never evidence of demand, paying customers or willingness to pay
  (PRD §13.2: community sources are not monetisation evidence).
- Attribution: the source reference links back to the HN item.

## `product_hunt` — not approved (permission requested)

**Read on official pages (via search snippets of `api.producthunt.com`, not
fetched directly):**

- GraphQL endpoint `https://api.producthunt.com/v2/api/graphql`; complexity
  quota of 6,250 points per 15 minutes; other `/v2/*` endpoints 450 requests
  per 15 minutes; HTTP 429 when exceeded
  (`api.producthunt.com/v2/docs/rate_limits/headers`).
- Authentication: OAuth (client-credentials token for public data, or a
  developer token from the API dashboard).

**(to verify):** the API documentation reportedly states that the API is
not for commercial use by default and that permission is requested from
hello@producthunt.com (third-party summaries; official page blocked).

**Decision (6 Nov 2026):** prepare a permission request; **do not send**
(the product owner sends it). Not registered in `sources`; no connector is
built until written permission and a product-owner approval.

**Update (10 November 2026):** Product Hunt is now registered as a catalog
source, `planned` and disabled (migration `20261116090001_catalog_sources`),
with a prepared collector (`packages/data-sources/src/connectors/product-hunt.ts`,
no HTTP runner wired). Enabling it still needs the product owner's token,
non-commercial use only, and PD-29 for any other use.

## `brave_search` — deferred (no spending)

From third-party pricing trackers and Brave's official help page snippet
(not fetched directly) **(to verify)**: metered billing (about 5 USD per
1,000 requests, a monthly credit, card required); the Search API terms
forbid storing or caching results beyond transient storage unless a
"storage rights" plan (custom price) is subscribed. Deferred by the product
owner on 6 November 2026; no account, no key, no call.

## Not retained for discovery

| Source | Reason (6 Nov 2026) |
|---|---|
| Hacker News search via Algolia (`hn.algolia.com`) | Not the official API; terms not found; excluded from PD-28 approval |
| Google Custom Search JSON API | Closed to new customers; discontinued on 1 January 2027 (third-party reports citing Google) |
| Bing Search APIs | Retired in August 2025 (to verify) |
| Tavily, Exa | Credit-based AI search APIs; storage terms not found; would need a separate review |
| Reddit | API access requires prior approval since November 2025; commercial use under licence; more relevant to the Pain Point Engine |
| G2, Capterra, AlternativeTo | No public API for this use; automated collection prohibited [ASSUMPTION — ADR-013]; G2 is PD-26 |
| Crunchbase | No free key; enterprise licence by quote |
| X, LinkedIn, Similarweb, BuiltWith/Wappalyzer | Paid or prohibited without an agreement |
| Wikidata | Low coverage of small SaaS; possible later for identity cross-checks |

## Open verifications

| Item | Page | Blocks |
|---|---|---|
| ~~HN / Y Combinator site terms~~ | Read 10 Nov 2026 (see the catalog sources review) | Done; activation still needs a go-ahead |
| Product Hunt terms of service (storage, attribution) | `https://www.producthunt.com/legal/terms-of-service` (HTTP 403 from the runners) | Enabling `product_hunt` |
| ~~Uneed terms of use~~ | Read 10 Nov 2026 (frozen in `docs/sources/terms/`, see the catalog sources review) | Done; Uneed enabled, metadata only |
| Brave Search API terms and pricing | `https://brave.com/search/api/`, `https://api-dashboard.search.brave.com/documentation/resources/terms-of-service` | Nothing (deferred) |

## Activation procedure (for any source not yet enabled)

1. Complete the open verifications above (read the official pages; no API
   call) and record the result in this document.
2. The product owner approves activation for one environment (staging
   first).
3. A migration sets `terms_reviewed_at`, `terms_review_notes`,
   `integration_status = 'integrated'` and `is_enabled = true` for that
   source (the database refuses `is_enabled` without a terms review and an
   integrated status).
4. The worker then builds the connector for discovery runs; every request
   goes through `sor_source_consume` (daily quota) and the safe fetcher.

## Future bulk catalog sources (PD-34, pending — 7 November 2026)

The product owner wants to keep the way open for two large catalog
sources: **a Hugging Face dataset (~260K products)** and **Enlisted
(10K+)**. Nothing is imported or connected. Before any use, a written
review must establish: the exact dataset or provider and its owner; the
licence and the rights to store, transform and display the data; update
cadence and freshness; field coverage and quality on a sample; overlap
with the catalog and identity matching (canonical URL / domain, never the
name alone); the permanent exclusion classifier on a sample. An approved
source would go through the existing import pipeline (rows validated,
identity resolution, provenance per field, idempotent re-imports), with
facts marked as declared until verified.

Scale: the S7.5 catalog benchmarks run at 2K, 10K and 50K products; a
~300K catalog will need a new benchmark before such an import.

