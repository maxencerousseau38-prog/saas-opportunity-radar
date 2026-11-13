-- M8 discovery (Sprint 6): privileges, RLS per role, source registry
-- (storage policy, Hacker News planned and disabled, quotas), request with
-- channels and seeds, job/run state sync, candidates (identity, exclusion,
-- fit-score rules, official-site evidence, scope), final counts, review,
-- deletion and retry.
begin;
select no_plan();
select tests.seed();

-- ------------------------------------------------------------ privileges
select is(
  (select count(*)::int from unnest(array['discovery_runs','discovery_candidates','discovery_candidate_evidence']) t(name)
    where has_table_privilege('authenticated', 'public.' || name, 'INSERT')
       or has_any_column_privilege('authenticated', 'public.' || name, 'UPDATE')
       or has_table_privilege('authenticated', 'public.' || name, 'DELETE')
       or has_any_column_privilege('anon', 'public.' || name, 'SELECT')),
  0, 'browsers never write runs, candidates or evidence links; anon reads nothing');
select ok(has_table_privilege('authenticated', 'public.discovery_runs', 'SELECT'), 'members read runs through RLS');
select ok(not has_any_column_privilege('authenticated', 'public.source_usage_daily', 'SELECT')
      and not has_any_column_privilege('anon', 'public.source_usage_daily', 'SELECT'),
  'source usage counters are server-only');
select is(
  (select count(*)::int from unnest(array[
      'public.sor_request_discovery_run(uuid,uuid,text,text,jsonb)',
      'public.sor_discovery_set_stage(uuid,text)',
      'public.sor_discovery_save_plan(uuid,jsonb,jsonb,jsonb)',
      'public.sor_source_consume(text,integer)',
      'public.sor_discovery_upsert_candidate(uuid,jsonb)',
      'public.sor_discovery_finalize(uuid,jsonb)',
      'public.sor_review_discovery_candidate(uuid,uuid,uuid,text,text,uuid)',
      'public.sor_delete_discovery_run(uuid,uuid,uuid,uuid)',
      'public.sor_retry_discovery_run(uuid,uuid,uuid,text,text)']) f(sig)
    where has_function_privilege('authenticated', sig, 'EXECUTE') or has_function_privilege('anon', sig, 'EXECUTE')
       or not has_function_privilege('service_role', sig, 'EXECUTE')),
  0, 'discovery RPCs are service-role only');

-- ------------------------------------------------------------ source registry
-- PD-42: integrated with its terms review, still disabled until a per-environment go-ahead.
select is((select integration_status::text || '/' || is_enabled || '/' || storage_policy::text
             || '/' || access_method::text || '/' || default_reliability_level
             from public.sources where source_key = 'hacker_news'),
  'integrated/false/metadata_only/official_api/3', 'Hacker News is integrated, disabled, metadata only');
select ok((select terms_reviewed_at is not null from public.sources where source_key = 'hacker_news'),
  'the Hacker News terms review is recorded');
select is((select storage_policy::text from public.sources where source_key = 'official_website'), 'full',
  'the official website keeps full public pages');
select tests.as_owner_role();
select throws_ok($$update public.sources set is_enabled = true where source_key = 'product_hunt'$$,
  '23514', null, 'a planned source cannot be enabled');
select throws_ok($$update public.sources set terms_reviewed_at = null, is_enabled = true
                    where source_key = 'hacker_news'$$,
  '23514', null, 'a source without a written terms review cannot be enabled');
select tests.as_service_role();
select throws_ok($$select public.sor_source_consume('hacker_news', 1)$$, '55000', null,
  'a disabled source cannot be called');
select throws_ok($$select public.sor_record_snapshot('hacker_news', 'https://news.ycombinator.com/item?id=1', '1',
  'Show HN', repeat('c', 64), 'ok', 200, null, now(), 'reference_only', '{}')$$,
  '22023', null, 'nothing is recorded from a source that is not integrated');
select is(public.sor_source_consume('official_website', 2), true, 'an enabled source within quota is allowed');
select tests.as_owner_role();
update public.sources set quota_per_day = 3 where source_key = 'official_website';
select tests.as_service_role();
select is(public.sor_source_consume('official_website', 2), false, 'a request beyond the daily quota is refused');
select is((select requests from public.source_usage_daily u join public.sources s on s.id = u.source_id
            where s.source_key = 'official_website'), 2, 'a refused request is not counted');

-- ------------------------------------------------------------ request
create temporary table dr (name text primary key, run_id uuid, job_id uuid, created boolean) on commit drop;
grant all on dr to service_role;
select tests.as_service_role();

select throws_ok($$select * from public.sor_request_discovery_run(tests.id('b1'), tests.id('a4'), 'key-dr-viewer',
  repeat('a', 64), '{"title": "t", "prompt": "find saas"}')$$, '42501', null, 'a viewer cannot start a discovery run');
select throws_ok($$select * from public.sor_request_discovery_run(tests.id('b1'), tests.id('a5'), 'key-dr-other',
  repeat('a', 64), '{"title": "t", "prompt": "find saas"}')$$, '42501', null, 'a non-member cannot start a run');
select throws_ok($$select * from public.sor_request_discovery_run(tests.id('b1'), tests.id('a3'), 'key-dr-excl',
  repeat('a', 64), '{"title": "t", "prompt": "find saas", "filters": {"include_excluded": true}}')$$,
  '22023', null, 'a request cannot remove permanent exclusions');
select throws_ok($$select * from public.sor_request_discovery_run(tests.id('b1'), tests.id('a3'), 'key-dr-depth',
  repeat('a', 64), '{"title": "t", "prompt": "find saas", "depth": "quick"}')$$,
  '22023', null, 'the depth is standard or deep');
select throws_ok($$select * from public.sor_request_discovery_run(tests.id('b1'), tests.id('a3'), 'key-dr-url',
  repeat('a', 64), '{"title": "t", "prompt": "find saas", "channels": {"seed_urls": ["javascript:alert(1)"]}}')$$,
  '22023', null, 'seed URLs are http(s) only');
select throws_ok($$select * from public.sor_request_discovery_run(tests.id('b1'), tests.id('a3'), 'key-dr-seedx',
  repeat('a', 64), jsonb_build_object('title', 't', 'prompt', 'find saas', 'channels',
    jsonb_build_object('official_site_rebound', jsonb_build_object('seed_product_ids', jsonb_build_array(tests.id('d3'))))))$$,
  '23514', null, 'an excluded product cannot be a rebound seed');
select throws_ok($$select * from public.sor_request_discovery_run(tests.id('b1'), tests.id('a3'), 'key-dr-seedc',
  repeat('a', 64), jsonb_build_object('title', 't', 'prompt', 'find saas', 'channels',
    jsonb_build_object('official_site_rebound', jsonb_build_object('seed_product_ids', jsonb_build_array(tests.id('d2'))))))$$,
  'P0002', null, 'a candidate product cannot be a rebound seed');

insert into dr select 'r', * from public.sor_request_discovery_run(tests.id('b1'), tests.id('a3'), 'key-dr-1',
  repeat('a', 64), jsonb_build_object('title', 'MarTech US', 'prompt', 'Find small US marketing analytics SaaS',
    'depth', 'deep', 'max_results', 20, 'filters', jsonb_build_object('hq_countries', jsonb_build_object('values', jsonb_build_array('US'))),
    'channels', jsonb_build_object('search', true, 'seed_urls', jsonb_build_array('https://seed.test/'),
      'official_site_rebound', jsonb_build_object('enabled', true, 'seed_product_ids', jsonb_build_array(tests.id('d1'))))));
select is((select created from dr where name = 'r'), true, 'a discovery run is created');
select is((select status::text || '/' || depth || '/' || max_results || '/' || orchestrator_version || '/' || fit_rules_version
             from public.discovery_runs where id = (select run_id from dr where name = 'r')),
  'queued/deep/20/discovery-run.v1/fit-1', 'depth, limits and rule versions are recorded');
select is((select job_kind::text || ':' || (payload ->> 'run_id') from public.job_executions
            where id = (select job_id from dr where name = 'r')),
  'discovery_run:' || (select run_id::text from dr where name = 'r'), 'the job points to the run');
select is((select run_id from public.sor_request_discovery_run(tests.id('b1'), tests.id('a3'), 'key-dr-1', repeat('a', 64),
  '{"title": "x", "prompt": "abc"}')), (select run_id from dr where name = 'r'),
  'replaying the same key returns the same run');
select throws_ok($$select * from public.sor_request_discovery_run(tests.id('b1'), tests.id('a3'), 'key-dr-1',
  repeat('b', 64), '{"title": "x", "prompt": "abc"}')$$, 'P0001', null, 'same key, other payload: conflict');

-- RLS: members of W1 read the run, W2 does not.
select tests.authenticate_as(tests.id('a4'));
select is((select count(*)::int from public.discovery_runs), 1, 'a viewer of W1 reads the run');
select tests.authenticate_as(tests.id('a5'));
select is((select count(*)::int from public.discovery_runs), 0, 'another workspace reads nothing');
select tests.as_service_role();

-- ------------------------------------------------------------ worker writes
select throws_ok($$select public.sor_discovery_set_stage((select run_id from dr where name = 'r'), 'planning')$$,
  '55000', null, 'a run is written only while its job runs');
select tests.as_owner_role();
update public.job_executions set state = 'running', lease_owner = 'w', lease_expires_at = now() + interval '1 minute',
       attempt_count = 1 where id = (select job_id from dr where name = 'r');
select tests.as_service_role();
select is((select status::text from public.discovery_runs where id = (select run_id from dr where name = 'r')),
  'running', 'the run follows its running job');
select lives_ok($$select public.sor_discovery_set_stage((select run_id from dr where name = 'r'), 'planning')$$,
  'the stage is recorded');
select throws_ok($$select public.sor_discovery_set_stage((select run_id from dr where name = 'r'), 'dreaming')$$,
  '23514', null, 'an unknown stage is refused');
select throws_ok($$select public.sor_discovery_save_plan((select run_id from dr where name = 'r'),
  '{"include_excluded": true}', '{}', '[]')$$, '22023', null, 'interpreted filters cannot remove exclusions');
select lives_ok($$select public.sor_discovery_save_plan((select run_id from dr where name = 'r'),
  '{"customer_types": {"values": ["b2b"], "include_unknown": false}}', '{"interpreted_intent": "x"}',
  '[{"code": "source_not_available", "detail": "hacker_news"}]')$$, 'the guarded plan is saved');

-- Official-site snapshots of three discovered products and one HN-like page.
select tests.as_owner_role();
insert into public.source_records (id, source_id, canonical_url)
  select tests.id('ee1'), id, 'https://newco.test/' from public.sources where source_key = 'official_website';
insert into public.source_records (id, source_id, canonical_url)
  select tests.id('ee3'), id, 'https://affilico.test/' from public.sources where source_key = 'official_website';
insert into public.source_records (id, source_id, canonical_url)
  select tests.id('ee5'), id, 'https://nourl.test/about' from public.sources where source_key = 'official_website';
insert into public.source_records (id, source_id, canonical_url)
  select tests.id('ee7'), id, 'https://seed.test/import' from public.sources where source_key = 'user_import';
insert into public.source_snapshots (id, source_record_id, content_hash, fetch_status) values
  (tests.id('ee2'), tests.id('ee1'), repeat('1', 64), 'ok'),
  (tests.id('ee4'), tests.id('ee3'), repeat('2', 64), 'ok'),
  (tests.id('ee6'), tests.id('ee5'), repeat('3', 64), 'ok'),
  (tests.id('ee8'), tests.id('ee7'), repeat('4', 64), 'ok');
select tests.as_service_role();

create temporary table dc (name text primary key, result jsonb) on commit drop;
grant all on dc to service_role;

select throws_ok($$select public.sor_discovery_upsert_candidate((select run_id from dr where name = 'r'),
  jsonb_build_object('identity', '{"outcome": "new"}'::jsonb, 'snapshot_id', tests.id('ee8'),
    'product', '{"name": "Seed", "canonical_url": "https://seed.test/"}'::jsonb,
    'exclusion', '{"status": "eligible", "rule_set_version": "excl-1"}'::jsonb))$$,
  '22023', null, 'a candidate must rest on an official-website snapshot');
select throws_ok($$select public.sor_discovery_upsert_candidate((select run_id from dr where name = 'r'),
  jsonb_build_object('identity', '{"outcome": "new"}'::jsonb, 'snapshot_id', tests.id('ee2'),
    'product', '{"name": "NewCo", "canonical_url": null}'::jsonb,
    'exclusion', '{"status": "eligible", "rule_set_version": "excl-1"}'::jsonb))$$,
  '22023', null, 'a new candidate needs an official URL');
select throws_ok($$select public.sor_discovery_upsert_candidate((select run_id from dr where name = 'r'),
  jsonb_build_object('identity', '{"outcome": "new"}'::jsonb, 'snapshot_id', tests.id('ee2'),
    'product', '{"name": "NewCo", "canonical_url": "https://newco.test/"}'::jsonb,
    'exclusion', '{"status": "unassessed"}'::jsonb))$$,
  '22023', null, 'a candidate must have passed the exclusion classifier');

-- New eligible product with a fit score.
insert into dc select 'new', public.sor_discovery_upsert_candidate((select run_id from dr where name = 'r'),
  jsonb_build_object('identity', '{"outcome": "new"}'::jsonb, 'snapshot_id', tests.id('ee2'),
    'product', jsonb_build_object('name', 'NewCo', 'canonical_url', 'https://newco.test/', 'domain', 'newco.test',
      'company_name', 'NewCo Inc', 'country_code', 'US', 'category_slugs',
      jsonb_build_array('marketing-growth-marketing-analytics', 'excluded-affiliate-marketing')),
    'exclusion', '{"status": "eligible", "rule_set_version": "excl-1"}'::jsonb,
    'fit', '{"rules_version": "fit-1", "fit_score": 75, "fit_coverage": 80, "missing_information": ["age"]}'::jsonb,
    'confidence_score', 40, 'recommendation_reason', 'US analytics SaaS with a paid offer',
    'provenance', jsonb_build_array(jsonb_build_object('channel', 'seed_url', 'source_key', 'user_import'))));
select is((select result ->> 'review_status' || '/' || (result ->> 'is_new_to_catalog') || '/' || (result ->> 'identity_decision')
             from dc where name = 'new'), 'pending/true/new', 'an eligible new product is a pending candidate');
select is((select record_status::text || '/' || exclusion_status::text || '/' || website_url
             from public.saas_products where id = (select (result ->> 'product_id')::uuid from dc where name = 'new')),
  'candidate/eligible/https://newco.test/', 'the product stays a hidden candidate until accepted');
select is((select array_agg(c.slug order by c.slug) from public.product_categories pc join public.categories c on c.id = pc.category_id
            where pc.product_id = (select (result ->> 'product_id')::uuid from dc where name = 'new')),
  array['marketing-growth-marketing-analytics'], 'an excluded category is never attached');
select is((select e.claim_type::text || '/' || e.evidence_type::text || '/' || e.reliability_level
             from public.discovery_candidate_evidence ce join public.evidence_items e on e.id = ce.evidence_item_id
            where ce.candidate_id = (select (result ->> 'candidate_id')::uuid from dc where name = 'new')),
  'product_exists/official_statement/1', 'the candidate cites its official site as primary evidence');
select is((select fit_score::text || '/' || fit_coverage::text from public.discovery_candidates
            where id = (select (result ->> 'candidate_id')::uuid from dc where name = 'new')),
  '75.00/80.00', 'the deterministic fit score and coverage are stored');
select is((select result ->> 'candidate_id' from (select public.sor_discovery_upsert_candidate((select run_id from dr where name = 'r'),
  jsonb_build_object('identity', '{"outcome": "new"}'::jsonb, 'snapshot_id', tests.id('ee2'),
    'product', '{"name": "NewCo", "canonical_url": "https://newco.test/"}'::jsonb,
    'exclusion', '{"status": "eligible", "rule_set_version": "excl-1"}'::jsonb,
    'fit', '{"rules_version": "fit-1", "fit_score": 75, "fit_coverage": 80}'::jsonb)) as result) x),
  (select result ->> 'candidate_id' from dc where name = 'new'), 'a redelivered candidate is not duplicated');
select is((select count(*)::int from public.saas_products where website_url = 'https://newco.test/'), 1,
  'no duplicate product is inserted');

-- Excluded product: rejected, never scored.
insert into dc select 'excl', public.sor_discovery_upsert_candidate((select run_id from dr where name = 'r'),
  jsonb_build_object('identity', '{"outcome": "new"}'::jsonb, 'snapshot_id', tests.id('ee4'),
    'product', '{"name": "AffiliCo", "canonical_url": "https://affilico.test/"}'::jsonb,
    'exclusion', '{"status": "excluded", "rule_set_version": "excl-1", "matched_rules": [{"ruleKey": "R2", "field": "core"}]}'::jsonb,
    'fit', '{"rules_version": "fit-1", "fit_score": 90, "fit_coverage": 100}'::jsonb));
select is((select review_status || '/' || rejection_reason || '/' || coalesce(fit_score::text, 'null')
             from public.discovery_candidates where id = (select (result ->> 'candidate_id')::uuid from dc where name = 'excl')),
  'rejected/permanent_exclusion/null', 'an excluded candidate is rejected and never scored');

-- Existing excluded catalog product found again: the catalog status decides.
insert into dc select 'known', public.sor_discovery_upsert_candidate((select run_id from dr where name = 'r'),
  jsonb_build_object('identity', jsonb_build_object('outcome', 'matched_existing', 'product_id', tests.id('d3')),
    'snapshot_id', tests.id('ee4'), 'product', '{"name": "Product Three"}'::jsonb,
    'exclusion', '{"status": "eligible", "rule_set_version": "excl-1"}'::jsonb));
select is((select result ->> 'exclusion_status' || '/' || (result ->> 'review_status') || '/' || (result ->> 'is_new_to_catalog')
             from dc where name = 'known'), 'excluded/rejected/false',
  'the worker cannot make an excluded catalog product eligible');

-- Identity needs review (no official URL).
insert into dc select 'review', public.sor_discovery_upsert_candidate((select run_id from dr where name = 'r'),
  jsonb_build_object('identity', jsonb_build_object('outcome', 'needs_review', 'possible_duplicate_of_product_id', tests.id('d1')),
    'snapshot_id', tests.id('ee6'), 'product', '{"name": "NoUrl", "canonical_url": null}'::jsonb,
    'exclusion', '{"status": "eligible", "rule_set_version": "excl-1"}'::jsonb));
select is((select identity_decision || '/' || review_status || '/' || possible_duplicate_of_product_id::text
             from public.discovery_candidates where id = (select (result ->> 'candidate_id')::uuid from dc where name = 'review')),
  'needs_review/needs_review/' || tests.id('d1')::text, 'a possible duplicate goes to review, never merged');

-- Table-level guards.
select tests.as_owner_role();
select throws_ok($$update public.discovery_candidates set fit_score = 50, fit_coverage = 50
                    where id = (select (result ->> 'candidate_id')::uuid from dc where name = 'excl')$$,
  '23514', null, 'a non-eligible candidate cannot carry a fit score');
select throws_ok($$update public.discovery_candidates set review_status = 'pending'
                    where id = (select (result ->> 'candidate_id')::uuid from dc where name = 'review')$$,
  '23514', null, 'a possible duplicate cannot become pending');
select throws_ok($$update public.discovery_candidates set fit_score = 50, fit_coverage = 0
                    where id = (select (result ->> 'candidate_id')::uuid from dc where name = 'new')$$,
  '23514', null, 'a coverage of 0 has no fit score');
select throws_ok($$insert into public.discovery_candidate_evidence (candidate_id, evidence_item_id)
                    values ((select (result ->> 'candidate_id')::uuid from dc where name = 'new'), tests.id('f1'))$$,
  '23514', null, 'a candidate cannot cite evidence of another product');
select tests.as_service_role();

-- Review before the run ends is refused.
select throws_ok($$select public.sor_review_discovery_candidate(tests.id('b1'), tests.id('a3'),
  (select (result ->> 'candidate_id')::uuid from dc where name = 'new'), 'accept', null, null)$$,
  '55000', null, 'candidates are reviewed once the run has finished');

-- ------------------------------------------------------------ finalize
select throws_ok($$select public.sor_discovery_finalize((select run_id from dr where name = 'r'),
  '{"candidates_found": 2, "duplicates_removed": 0, "leads_found": 5}')$$,
  '22023', null, 'the reported count cannot be below the persisted candidates');
select throws_ok($$select public.sor_discovery_finalize((select run_id from dr where name = 'r'),
  '{"candidates_found": 5, "sources_report": [{"source_key": "nowhere"}]}')$$,
  '22023', null, 'the sources report names registered sources only');
select lives_ok($$select public.sor_discovery_finalize((select run_id from dr where name = 'r'),
  jsonb_build_object('leads_found', 7, 'candidates_found', 5, 'duplicates_removed', 1,
    'sources_report', jsonb_build_array(
      jsonb_build_object('source_key', 'hacker_news', 'channel', 'search', 'status', 'not_enabled'),
      jsonb_build_object('source_key', 'official_website', 'channel', 'official_site_rebound', 'status', 'consulted')),
    'limitations', '[{"code": "source_not_available", "detail": "hacker_news"}]'::jsonb))$$,
  'the run summary is written');
select is((select leads_found || '/' || candidates_found || '/' || duplicates_removed || '/' || candidates_retained
             || '/' || candidates_rejected || '/' || candidates_needs_review || '/' || jsonb_array_length(limitations)
             from public.discovery_runs where id = (select run_id from dr where name = 'r')),
  '7/5/1/1/2/1/1', 'candidate counts are recomputed from the rows; limitations are de-duplicated');
select tests.as_owner_role();
update public.job_executions set state = 'completed', terminal_reason = 'completed', lease_owner = null,
       lease_expires_at = null where id = (select job_id from dr where name = 'r');
select tests.as_service_role();
select is((select status::text || '/' || terminal_reason::text || '/' || (completed_at is not null)
             from public.discovery_runs where id = (select run_id from dr where name = 'r')),
  'completed/completed/true', 'the run completes with its job');

-- ------------------------------------------------------------ review
select throws_ok($$select public.sor_review_discovery_candidate(tests.id('b1'), tests.id('a4'),
  (select (result ->> 'candidate_id')::uuid from dc where name = 'new'), 'accept', null, null)$$,
  '42501', null, 'a viewer cannot review candidates');
select throws_ok($$select public.sor_review_discovery_candidate(tests.id('b2'), tests.id('a5'),
  (select (result ->> 'candidate_id')::uuid from dc where name = 'new'), 'accept', null, null)$$,
  'P0002', null, 'another workspace cannot review the candidate');
select throws_ok($$select public.sor_review_discovery_candidate(tests.id('b1'), tests.id('a3'),
  (select (result ->> 'candidate_id')::uuid from dc where name = 'excl'), 'accept', null, null)$$,
  '55000', null, 'a rejected (excluded) candidate cannot be accepted');
select throws_ok($$select public.sor_review_discovery_candidate(tests.id('b1'), tests.id('a3'),
  (select (result ->> 'candidate_id')::uuid from dc where name = 'review'), 'accept', null, null)$$,
  '55000', null, 'a candidate needing identity review cannot be accepted');

-- An operator changes the exclusion status after the run: acceptance is refused.
select tests.as_owner_role();
update public.saas_products set exclusion_status = 'needs_review'
 where id = (select (result ->> 'product_id')::uuid from dc where name = 'new');
select tests.as_service_role();
select throws_ok($$select public.sor_review_discovery_candidate(tests.id('b1'), tests.id('a3'),
  (select (result ->> 'candidate_id')::uuid from dc where name = 'new'), 'accept', null, null)$$,
  '23514', null, 'the current catalog exclusion status decides acceptance');
select tests.as_owner_role();
update public.saas_products set exclusion_status = 'eligible'
 where id = (select (result ->> 'product_id')::uuid from dc where name = 'new');
select tests.as_service_role();

select is((select public.sor_review_discovery_candidate(tests.id('b1'), tests.id('a3'),
  (select (result ->> 'candidate_id')::uuid from dc where name = 'new'), 'accept', null, tests.id('99')) ->> 'review_status'),
  'accepted', 'a member accepts an eligible candidate');
select is((select record_status::text from public.saas_products
            where id = (select (result ->> 'product_id')::uuid from dc where name = 'new')),
  'active', 'an accepted candidate becomes visible in Discover');
select is((select count(*)::int from public.audit_logs where action = 'discovery.candidate_accept'
            and resource_id = (select (result ->> 'candidate_id')::uuid from dc where name = 'new')), 1,
  'the acceptance is audit-logged');
select throws_ok($$select public.sor_review_discovery_candidate(tests.id('b1'), tests.id('a3'),
  (select (result ->> 'candidate_id')::uuid from dc where name = 'new'), 'accept', null, null)$$,
  '55000', null, 'a candidate is accepted once');
select is((select public.sor_review_discovery_candidate(tests.id('b1'), tests.id('a3'),
  (select (result ->> 'candidate_id')::uuid from dc where name = 'review'), 'reject', 'duplicate of Product One', null)
  ->> 'review_status'), 'rejected', 'a candidate under review can be rejected');
select is((select candidates_retained || '/' || candidates_rejected || '/' || candidates_needs_review
             from public.discovery_runs where id = (select run_id from dr where name = 'r')),
  '1/3/0', 'run counts follow the reviews');

-- RLS: candidates are read by members only.
select tests.authenticate_as(tests.id('a4'));
select is((select count(*)::int from public.discovery_candidates), 4, 'a viewer reads the run candidates');
select is((select count(*)::int from public.discovery_candidate_evidence), 4, 'and their evidence links');
select tests.authenticate_as(tests.id('a5'));
select is((select count(*)::int from public.discovery_candidates), 0, 'another workspace reads no candidate');
select tests.as_service_role();

-- ------------------------------------------------------------ retry
select throws_ok($$select * from public.sor_retry_discovery_run(tests.id('b1'), tests.id('a3'),
  (select run_id from dr where name = 'r'), 'key-dr-retry', repeat('d', 64))$$,
  '55000', null, 'a completed run is not retried');
insert into dr select 's', * from public.sor_request_discovery_run(tests.id('b1'), tests.id('a3'), 'key-dr-2',
  repeat('e', 64), '{"title": "Second", "prompt": "find more saas"}');
select tests.as_owner_role();
update public.job_executions set state = 'failed', terminal_reason = 'failed' where id = (select job_id from dr where name = 's');
select tests.as_service_role();
select is((select created from public.sor_retry_discovery_run(tests.id('b1'), tests.id('a3'),
  (select run_id from dr where name = 's'), 'key-dr-retry-2', repeat('f', 64))), true, 'a failed run is retried');
select is((select status::text || '/' || (job_execution_id <> (select job_id from dr where name = 's'))
             from public.discovery_runs where id = (select run_id from dr where name = 's')),
  'queued/true', 'the retried run is queued on a new job');

-- ------------------------------------------------------------ delete
select throws_ok($$select public.sor_delete_discovery_run(tests.id('b1'), tests.id('a3'),
  (select run_id from dr where name = 'r'), null)$$, '42501', null, 'a member cannot delete a run');
select throws_ok($$select public.sor_delete_discovery_run(tests.id('b1'), tests.id('a2'),
  (select run_id from dr where name = 's'), null)$$, '55000', null, 'a queued run cannot be deleted');
select lives_ok($$select public.sor_delete_discovery_run(tests.id('b1'), tests.id('a2'),
  (select run_id from dr where name = 'r'), tests.id('98'))$$, 'an admin deletes a finished run');
select is((select count(*)::int from public.discovery_candidates c where c.run_id = (select run_id from dr where name = 'r')),
  0, 'its candidates go with it');
select is((select record_status::text from public.saas_products
            where id = (select (result ->> 'product_id')::uuid from dc where name = 'new')),
  'active', 'an accepted product stays in the catalog');
select is((select count(*)::int from public.audit_logs where action = 'discovery_run.delete'
            and resource_id = (select run_id from dr where name = 'r')), 1, 'the deletion is audit-logged');

select * from finish();
rollback;
