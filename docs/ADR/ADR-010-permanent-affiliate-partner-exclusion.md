# ADR-010 — Permanent Affiliate/Partner exclusion

- **Status:** ACCEPTED; boundary cases PENDING_USER_APPROVAL (PD-11)
- **Date:** 4 November 2026
- **Sources:**
  - PRD §1.3 (excluded list), §4.2.O ("Exclusions permanentes"), §21 (locked: "Affiliate / Partner — Exclusion permanente").
  - `CLAUDE.md` §3: deterministic, at every stage, never disableable by a prompt; judge the core purpose; flag ambiguous cases.

## Decision (ACCEPTED)

- **Implementation:** a deterministic classifier, `packages/domain/src/exclusion`, rule set `excl-1`, mirrored in the server-only `exclusion_rules` table.
- **Outcomes:**
  - A core-purpose match → `excluded`.
  - An ambiguous match (description level, ambiguous token, or LLM flag) → `needs_review`.
  - A feature-only mention → `eligible`, with an incidental-mention flag.
- **LLM limits:** an LLM can escalate to review (`core_purpose_flag`, emitted by the extraction, enrichment and opportunity-generation agents) but can never make a product eligible.
- **No way to disable it:**
  - No contract (filters, saved searches, settings, discovery requests, analysis requests) can express or remove permanent exclusions.
  - The v1.0 `exclude_terms` default, which could be emptied by the client, is removed.
- **Enforcement points:**
  - planning, extraction/enrichment, identity, ranking;
  - catalog RLS;
  - manual add and import;
  - pain point runs, generated opportunities;
  - analysis creation (`EXCLUDED_SUBJECT`);
  - competitor analysis and reports (excluded products omitted, with a count);
  - report recommendations: the Recommended Product, Opportunity Map entries, opportunity findings and uncatalogued competitors are classified;
  - excluded or hidden categories cannot be analysis or pain point subjects;
  - database guards on excluded categories.
- **Resolution:** `needs_review` products are hidden and cannot be analysed until a platform operator resolves them. The resolution is audit-logged. An `excluded` outcome from a core rule cannot be overridden by an operator; a false positive is fixed by correcting the underlying data and re-running the classifier.
- **PRD wording:** §1.3 said "Sont exclus par défaut", which conflicted with "Exclusions permanentes" (§4.2.O) and the locked decision (§21). The wording was aligned to "permanente". No item was added or removed.

## Pending

- **PD-11:** two boundary cases. Until decided, both are routed to `needs_review`, so they are neither silently excluded nor silently recommended.
  - Sales-commission software for employees. PRD §1.3 lists "Commission management" without "lié aux partenaires", while §4.2.O qualifies it with partners.
  - Customer-referral-program software, unless its core model is affiliate/partner distribution.
- **Recommendation:** do not exclude either category, unless the core purpose is partner or affiliate commissions or distribution.
