# Product-owner review of the draft annotations

28 drafts (96 plans, 222 features, 159 integrations, 34 stated fields), all
passing `check-annotations.mjs` (every quote found in the frozen page). The
points below need a decision; each file's `notes` gives the detail. Once
reviewed, set `"status": "reviewed"` (or ask Claude to apply your answers).

## Exclusion (gate: 100 % correct)

| Site                                         | Draft                  | Question                                                                                                                                    |
| -------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| rewardful                                    | excluded               | Core purpose stated as affiliate management — confirm                                                                                       |
| firstpromoter                                | excluded               | Same — confirm                                                                                                                              |
| growsurf                                     | **excluded** — decided | Product owner, 5 Nov 2026: excluded; `needs_review` also accepted (it equally keeps the product out of the catalog); `eligible` is an error |
| convertflow                                  | eligible               | Runs its own partner program (commissions) but the product is a funnel builder — confirm                                                    |
| testimonial, transistor, baremetrics, others | eligible               | Footer "affiliate program" links are side programs — confirm the rule                                                                       |

## Prices the page states ambiguously

- **baremetrics**: plan cards show 75 / 255 / 1152 USD per month, the FAQ says 49 / 189 / 749. Both are accepted today. Should one set be wrong?
- **Annual-billed monthly equivalents only** (fillout, mailshake, canny, testimonial, sparktoro, keywordseverywhere, outseta): a run must report what is displayed; accepted amounts include the displayed equivalents. Confirm that reporting the displayed per-month equivalent with period `year` or `month` both pass.
- **Prices drawn by page scripts, missing from the text** (instatus Pro/Business, userlist base prices, buttondown slider): expected as `null`; any amount reported for them counts as unsupported. Confirm.
- **Volume sliders** (fathom, plausible, cronitor): only the default displayed amounts are expected.
- **Plans left out**: leadpages "Scale" (mentioned in FAQs, no plan card), baremetrics "Build your own plan", convertflow partner tiers, add-ons and credit packs everywhere. Confirm.

## Stated fields that involve a reading

- hypefury "7 humans, 1 falcon" → employee_min/max 7.
- hypefury "started in 2019", leadpages "served since 2012" → `launch_year` (not `founded_year`).
- userlist "since 2017" → `founded_year` forbidden, `launch_year` neither expected nor forbidden.
- convertflow "Miami, FL", cronitor "Founded in California", growsurf "Newark, DE": the country is not written; `country_code` neither expected nor forbidden. Should "US" pass?
- getsitecontrol "tailored for ecommerce brands" → `customer_type` b2b.

## Matching rules

- Short integration match strings ("x", "make", "segment") apply to reported integration **names** only.
- Free plans: amount 0, period `month` or `unknown` accepted.
- Demo prompts shown in product mock-ups (savvycal, testimonial, typefully) and AI-directed text (formspree, growsurf) are in `forbidden.texts`: reporting them is an error.
