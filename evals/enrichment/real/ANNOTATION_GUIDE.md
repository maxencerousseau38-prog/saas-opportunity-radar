# Annotation guide — real evaluation sites (PD-24 benchmark)

Each site of `sites.json` has a frozen snapshot in `snapshots/<id>.json`
(official pages fetched once by the production connector) and one
annotation file in `annotations/<id>.json`. The annotation states what a
correct D5/D6 run **must** report from those pages and what it must
**never** report. It is written from the snapshot text only — never from
outside knowledge or the live site.

Status: annotations are drafted by Claude (`"status": "draft"`) and become
`"reviewed"` only after the product owner checks them.

## Rules

1. **Only what the pages state.** Every expected item carries `quote`, an
   exact excerpt (5–200 characters) copied from the text of the page given in
   `page` (the snapshot's `requested_url`). The checker rejects a quote that is
   not found in that page (case, accents and whitespace are normalised).
2. **Pricing plans:** one entry per plan shown as a current offer. Record the
   amount exactly as displayed. When the page displays both monthly and annual
   prices, or prices that depend on a volume slider, list every displayed
   amount for that plan in `price_amount_any` and every applicable period in
   `billing_period_any` (`month`, `year`, `usage`, `one_time`, `custom`).
   A free plan has amount `0`. A plan with no displayed price ("Contact us")
   has `price_amount_any: [null]` and `billing_period_any: ["custom"]`.
   Add-ons, credits packs and legacy or archived plans are not plans.
3. **Features:** 4–8 core capabilities clearly stated as part of the product,
   most important first. `any` lists lowercase substrings, at least one of
   which must appear in the reported feature name or quote (synonyms allowed,
   keep them specific).
4. **Integrations:** up to 6 named third-party tools the product states it
   integrates with. Same `any` mechanism.
5. **Fields:** only if a page states it explicitly: `founded_year`,
   `country_code` (ISO alpha-2), `city`, `employee_min`/`employee_max`,
   `languages`, `customer_type`, `pricing_status`, `launch_year`. Never infer.
6. **Forbidden:** always forbid the monetization signals `payment_confirmed`
   and `customer_verified` (a pricing page or a customer count stated by the
   company is not payment proof). Add `fields` that a careless model might
   fill from outside knowledge when the pages do not state them, and `texts`
   for any instruction-like text found in the pages.
7. **Exclusion:** `expected_exclusion` is `eligible`, `excluded` or
   `needs_review` per the permanent Affiliate/Partner rule (CLAUDE.md §3,
   PD-11 A): excluded only if the core purpose is managing or monetising
   affiliate/partner programs; a customer-referral program tool is not
   excluded unless its core is affiliate/partner distribution (it carries a
   flag). Use `needs_review` when the pages are genuinely ambiguous, and
   explain in `notes`.
8. **Snapshot limits:** if a snapshot is partial (few pages, no pricing
   page), annotate only what it contains and say so in `notes`; missing
   pricing then means `plans: []`.

## File format

```json
{
  "id": "example",
  "status": "draft",
  "annotator": "Claude (draft, pending product-owner review)",
  "snapshot_retrieved_at": "2026-11-05T08:56:00.000Z",
  "expected_exclusion": "eligible",
  "plans": [
    {
      "name": "Pro",
      "name_any": ["pro"],
      "price_amount_any": [29, 290],
      "currency": "USD",
      "billing_period_any": ["month", "year"],
      "quote": "Pro $29 /month",
      "page": "https://example.com/pricing"
    }
  ],
  "features": [
    {
      "label": "Email scheduling",
      "any": ["schedul"],
      "quote": "Schedule emails",
      "page": "https://example.com/"
    }
  ],
  "integrations": [
    {
      "label": "Stripe",
      "any": ["stripe"],
      "quote": "Connect Stripe",
      "page": "https://example.com/integrations"
    }
  ],
  "fields": [
    {
      "field_key": "founded_year",
      "value": 2019,
      "quote": "Founded in 2019",
      "page": "https://example.com/about"
    }
  ],
  "forbidden": {
    "monetization_signals": ["payment_confirmed", "customer_verified"],
    "fields": ["employee_min", "employee_max"],
    "texts": []
  },
  "notes": "Annual prices shown as monthly equivalents."
}
```
