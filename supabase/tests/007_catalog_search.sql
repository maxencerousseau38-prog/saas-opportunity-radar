-- Catalog search and count RPCs (Implementation Blueprint §4.3, §10; PRD §3.4–§3.5, §4).
begin;
select no_plan();
select tests.seed();

-- Additional visible fixtures (W1 member a3 searches them).
--   d5 Email Pilot: US, founded 2019, 3–5 people, independent, founder-led,
--      bootstrapped, B2B, monthly subscription, 29 USD/month, paying
--      customers confirmed, Email Marketing (primary).
--   d6 Big Social: FR, founded 2010, 250–500 people, subsidiary, B2C, free, CRM.
--   d7 Log Watch: no company, launched 2026, Developer Tools > Monitoring (primary).
--   d1 Product One: company without any known profile data.
select tests.as_owner_role();
insert into public.companies (id, name, slug, country_code, founded_year, employee_min, employee_max,
                              company_type, founder_led, funding_status) values
  (tests.id('c5'), 'Pilot Labs', 'pilot-labs', 'US', 2019, 3, 5, 'independent', true, 'bootstrapped'),
  (tests.id('c6'), 'Big Group', 'big-group', 'FR', 2010, 250, 500, 'subsidiary', false, 'externally_funded');
insert into public.saas_products (id, company_id, name, slug, tagline, customer_type, billing_models,
                                  pricing_status, launch_year, record_status, exclusion_status) values
  (tests.id('d5'), tests.id('c5'), 'Email Pilot', 'email-pilot', 'Newsletter automation for small shops',
   'b2b', '{monthly_subscription}', 'paid', null, 'active', 'eligible'),
  (tests.id('d6'), tests.id('c6'), 'Big Social', 'big-social', 'Social inbox',
   'b2c', '{}', 'free', null, 'active', 'eligible'),
  (tests.id('d7'), null, 'Log Watch', 'log-watch', 'Log monitoring',
   'unknown', '{}', 'unknown', 2026, 'active', 'eligible');
insert into public.product_categories (product_id, category_id, is_primary)
select tests.id('d5'), id, true from public.categories where slug = 'marketing-growth-email-marketing'
union all
select tests.id('d6'), id, true from public.categories where slug = 'sales-crm-crm'
union all
select tests.id('d7'), id, true from public.categories where slug = 'developer-tools-monitoring';
insert into public.evidence_items
  (id, product_id, source_snapshot_id, claim_type, claim_text, evidence_type, fact_status,
   reliability_level, extraction_method, verification_status, verified_at, monetization_signal) values
  (tests.id('f5'), tests.id('d5'), tests.id('e2'), 'pricing', 'Starter plan 29 USD per month',
   'pricing_evidence', 'confirmed', 1, 'structured_parse', 'unverified', null, 'paid_plan_available'),
  (tests.id('f6'), tests.id('d5'), tests.id('e2'), 'paid_customer_signal', 'Named paying customer',
   'customer_case_study', 'confirmed', 1, 'structured_parse', 'verified', now(), 'customer_verified');
insert into public.pricing_plans (product_id, plan_name, billing_period, price_amount, currency, evidence_id)
  values (tests.id('d5'), 'Starter', 'month', 29, 'USD', tests.id('f5'));
insert into public.fx_rates (currency, rate_date, rate_to_eur, source_key)
  values ('USD', date '2026-11-03', 0.9, 'test');

create function tests.count_b1(p_plan jsonb) returns bigint language sql
set search_path = '' as $$ select public.catalog_count(tests.id('b1'), p_plan) $$;
create function tests.names_b1(p_plan jsonb, p_sort text default 'relevance') returns text[] language sql
set search_path = '' as $$
  select coalesce(array_agg(s.name order by s.sort_value desc, s.id desc), '{}')
  from public.catalog_search(tests.id('b1'), p_plan, p_sort) s $$;
grant execute on all functions in schema tests to authenticated;

-- ------------------------------------------------------------ access control
select tests.as_anon();
select throws_ok($$select public.catalog_count(tests.id('b1'), '{}')$$, '42501', null,
  'anon cannot count the catalog');
select tests.authenticate_as(tests.id('a6'));
select throws_ok($$select public.catalog_count(tests.id('b1'), '{}')$$, '42501', null,
  'a user without membership cannot search a workspace catalog');
select tests.authenticate_as(tests.id('a5'));
select throws_ok($$select * from public.catalog_search(tests.id('b1'), '{}')$$, '42501', null,
  'a member of another workspace cannot search through W1');

-- ------------------------------------------------------------ visibility
select tests.authenticate_as(tests.id('a3'));
select is(tests.count_b1('{}'), 4::bigint, 'only active and eligible products are counted');
select is(tests.names_b1('{}', 'smallest_team'),
  array['Email Pilot', 'Big Social', 'Log Watch', 'Product One'],
  'candidate, excluded and needs_review products never appear');
select is(tests.count_b1('{"include_hidden": true}'), 4::bigint,
  'include_hidden does not reveal excluded products');

-- ------------------------------------------------------------ filters
select is(tests.count_b1('{"customer_types": {"values": ["b2b"]}}'), 1::bigint,
  'A: customer type');
select is(tests.count_b1('{"customer_types": {"values": ["b2b"], "include_unknown": true}}'), 3::bigint,
  'A: unknown customer types only when include_unknown');
select is(tests.count_b1('{"team": {"ranges": [{"min": 1, "max": 20}]}}'), 1::bigint,
  'B: team size range');
select is(tests.count_b1('{"team": {"ranges": [{"min": 1, "max": 20}], "include_unknown": true}}'), 3::bigint,
  'B: unknown team size only when include_unknown');
select is(tests.count_b1('{"team": {"ranges": [{"min": 1, "max": 1}, {"min": 201, "max": null}]}}'), 1::bigint,
  'B: ranges are combined with OR');
select is(tests.count_b1('{"hq_countries": {"values": ["US"]}}'), 1::bigint, 'C: headquarters country');
select is(tests.count_b1('{"founded": {"ranges": [{"min": 2018, "max": 2022}]}}'), 1::bigint,
  'D: founding year range');
select is(tests.count_b1('{"founded": {"ranges": [{"min": 2025, "max": null}]}}'), 1::bigint,
  'D: launch year is used when the founding year is unknown');
select is(tests.count_b1('{"category_slugs": ["marketing-growth"]}'), 2::bigint,
  'E: a parent category includes its children');
select is(tests.count_b1('{"category_slugs": ["marketing-growth-email-marketing"]}'), 1::bigint,
  'E: subcategory');
select is(tests.count_b1('{"billing_models": {"values": ["monthly_subscription"]}}'), 1::bigint,
  'F: billing model');
select is(tests.count_b1('{"billing_models": {"values": ["monthly_subscription"], "include_unknown": true}}'),
  4::bigint, 'F: unknown billing models only when include_unknown');
select is(tests.count_b1('{"price": {"ranges": [{"min": 0, "max": 50}]}}'), 1::bigint,
  'G: a 29 USD monthly plan converts to EUR and falls in the 0–50 band');
select is(tests.count_b1('{"price": {"ranges": [{"min": 30, "max": 100}]}}'), 0::bigint,
  'G: the converted price (26.10 EUR) is outside 30–100');
select is(tests.count_b1('{"price": {"free": true}}'), 1::bigint, 'G: free products');
select is(tests.count_b1('{"price": {"ranges": [{"min": 0, "max": 50}], "include_unknown": true}}'), 3::bigint,
  'G: unknown prices only when include_unknown (free products are not unknown)');
select is(tests.count_b1('{"commercial_validation": ["paying_customers_confirmed"]}'), 1::bigint,
  'I: verified paying-customer evidence');
select is(tests.count_b1('{"commercial_validation": ["paid_subscriptions"]}'), 1::bigint,
  'I: paid subscriptions');
select is(tests.count_b1('{"commercial_validation": ["monetization_unverified"]}'), 0::bigint,
  'I: a product with verified payments is not "monetization unverified"');
select is(tests.count_b1('{"company_profile": {"values": ["founder_led"]}}'), 1::bigint, 'J: founder-led');
select is(tests.count_b1('{"company_profile": {"values": ["indie_saas"]}}'), 1::bigint, 'J: indie SaaS');
select is(tests.count_b1('{"company_profile": {"values": ["subsidiary_or_group", "bootstrapped"]}}'), 2::bigint,
  'J: values are combined with OR');
select is(tests.count_b1('{"customer_types": {"values": ["b2b"]}, "hq_countries": {"values": ["FR"]}}'),
  0::bigint, 'groups are combined with AND');
select is(tests.count_b1('{"text": "email"}'), 1::bigint, 'text search');
select is(tests.count_b1('{"text": "Pilo"}'), 1::bigint, 'text search matches a name fragment');
select is(tests.count_b1('{"text": "100%_"}'), 0::bigint, 'LIKE wildcards in the text are literal');

-- ------------------------------------------------------------ configurable exclusions (O)
select is(tests.count_b1('{"configurable_exclusions": ["b2c_only"]}'), 3::bigint, 'O: B2C only');
select is(tests.count_b1('{"configurable_exclusions": ["groups_and_large_companies"]}'), 3::bigint,
  'O: groups and large companies');
select is(tests.count_b1('{"configurable_exclusions": ["free_without_monetization"]}'), 3::bigint,
  'O: free without monetization');
select is(tests.count_b1('{"configurable_exclusions": ["very_technical_devtools"]}'), 3::bigint,
  'O: developer tools');
select is(tests.count_b1('{"configurable_exclusions": ["too_recent_without_demand_proof"], "current_year": 2026}'),
  3::bigint, 'O: too recent without demand proof');

-- ------------------------------------------------------------ workspace state
insert into public.workspace_product_states (workspace_id, product_id, is_hidden, updated_by)
  values (tests.id('b1'), tests.id('d6'), true, tests.id('a3'));
insert into public.workspace_product_states (workspace_id, product_id, status, is_favorite, updated_by)
  values (tests.id('b1'), tests.id('d1'), 'rejected', true, tests.id('a3'));
select is(tests.count_b1('{}'), 3::bigint, 'hidden products are left out by default');
select is(tests.count_b1('{"include_hidden": true}'), 4::bigint, 'include_hidden shows hidden products');
select is(tests.count_b1('{"configurable_exclusions": ["already_analyzed_and_rejected"]}'), 2::bigint,
  'O: already rejected in this workspace');
select is((select s.is_favorite from public.catalog_search(tests.id('b1'), '{}') s where s.id = tests.id('d1')),
  true, 'cards carry the workspace favourite flag');
select tests.authenticate_as(tests.id('a5'));
select is(public.catalog_count(tests.id('b2'), '{}'), 4::bigint,
  'hiding a product in W1 does not hide it in W2');

-- ------------------------------------------------------------ sort and pagination
select tests.authenticate_as(tests.id('a3'));
select is(
  (select array_agg(s.name order by s.sort_value desc, s.id desc)
     from public.catalog_search(tests.id('b1'), '{"include_hidden": true}', 'smallest_team', 0, null, null, 2) s),
  array['Email Pilot', 'Big Social'], 'first page');
select is(
  (select array_agg(s.name order by s.sort_value desc, s.id desc)
     from public.catalog_search(tests.id('b1'), '{"include_hidden": true}', 'smallest_team', 0,
            (select p.sort_value from public.catalog_search(tests.id('b1'), '{"include_hidden": true}', 'smallest_team', 0, null, null, 2) p
              order by p.sort_value asc, p.id asc limit 1),
            tests.id('d6'), 2) s),
  array['Log Watch', 'Product One'], 'second page continues after the cursor, unknown values last');
select is(tests.names_b1('{"include_hidden": true}', 'oldest'),
  array['Big Social', 'Email Pilot', 'Log Watch', 'Product One'], 'oldest first');
select is((tests.names_b1('{"include_hidden": true}', 'best_monetization_evidence'))[1],
  'Email Pilot', 'best monetization evidence first');
select is(tests.names_b1('{}', 'random'), tests.names_b1('{}', 'random'),
  'random order is stable for a given seed');
select throws_ok($$select * from public.catalog_search(tests.id('b1'), '{}', 'ai_potential')$$, '22023', null,
  'unsupported sort keys are rejected');
select throws_ok($$select * from public.catalog_search(tests.id('b1'), '{}', 'relevance', 0, null, null, 101)$$,
  '22023', null, 'the page size is bounded');

select * from finish();
rollback;
