# Data sources — terms reviews and integration status

**Last updated:** 6 November 2026 (Sprint 6, slice S6.0)
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
Sprint 6** (product-owner instruction, 6 November 2026).

## Summary

| Source key | Use | Access | Cost | Reliability (PRD §13.2) | Storage policy | Status |
|---|---|---|---|---|---|---|
| `manual_entry` | Catalog | Operator form | 0 | 4 (declared) until verified | Full (user-supplied) | Integrated (Sprint 2) |
| `user_import` | Catalog, feedback | CSV with per-import rights declaration | 0 | 4 (declared) until verified | Per declaration (`content_storage_status`) | Integrated (Sprint 3) |
| `official_website` | Enrichment, identity, **discovery rebound** (S6) | Safe fetcher, robots.txt | 0 | 1 (primary) | Full text of public pages (snapshots) | Integrated for enrichment (Sprint 3); rebound approved 6 Nov 2026, built in S6.3 |
| `hacker_news` | Discovery leads | Official HN API (Firebase), read-only, no key | 0 | 3 (community) for the launch fact only | Metadata only (see below) | **Approved 6 Nov 2026 (PD-28); not integrated**; activation blocked until the open verification below is done |
| `product_hunt` | Discovery leads | API v2 (OAuth token) | 0 | 3 | — | **Not approved**: written permission requested from Product Hunt first (draft: `docs/sources/product-hunt-permission-request.md`, not sent) |
| `brave_search` | Web search leads | API key, metered billing | Paid | — | Transient only | **Deferred** by the product owner (no spending) |

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
| HN / Y Combinator site terms (data licence, commercial use, storage) | `https://www.ycombinator.com/legal/` | Activation of `hacker_news` |
| Product Hunt API terms (commercial use, storage, attribution) | `https://www.producthunt.com/v2/docs`, `https://www.producthunt.com/legal/terms-of-service` | Any Product Hunt work |
| Brave Search API terms and pricing | `https://brave.com/search/api/`, `https://api-dashboard.search.brave.com/documentation/resources/terms-of-service` | Nothing (deferred) |
