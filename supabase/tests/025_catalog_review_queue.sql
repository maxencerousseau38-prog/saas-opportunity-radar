-- S8.2: persisted review queue of collected catalog listings and the
-- operator decisions on it (create, attach, reject), audited.
begin;
select no_plan();
select tests.seed();

-- ------------------------------------------------------------ privileges
select ok((select relrowsecurity from pg_class where oid = 'public.catalog_listing_reviews'::regclass),
  'the review queue has RLS enabled');
select ok(not has_table_privilege('authenticated', 'public.catalog_listing_reviews', 'SELECT')
          and not has_table_privilege('anon', 'public.catalog_listing_reviews', 'SELECT'),
  'browser roles cannot read the review queue (server only)');
select ok(not has_function_privilege('authenticated', 'public.sor_catalog_record_review(jsonb,jsonb,text,uuid[])', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.sor_operator_resolve_catalog_review(uuid,uuid,text,uuid,text)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.sor_operator_resolve_catalog_review(uuid,uuid,text,uuid,text)', 'EXECUTE'),
  'browsers cannot record or resolve reviews');
select ok(has_function_privilege('service_role', 'public.sor_catalog_record_review(jsonb,jsonb,text,uuid[])', 'EXECUTE')
          and has_function_privilege('service_role', 'public.sor_operator_resolve_catalog_review(uuid,uuid,text,uuid,text)', 'EXECUTE'),
  'the server records and resolves reviews');

-- ------------------------------------------------------------ fixtures
create temporary table r (k text primary key, v jsonb) on commit drop;
grant all on r to service_role;
create function tests.review_row(p_id text, p_url text, p_name text, p_desc text default 'online project management software')
returns jsonb language sql set search_path = '' as $$
  select jsonb_build_object(
    'source_key', 'wikidata', 'external_id', p_id, 'source_url', 'https://www.wikidata.org/wiki/' || p_id,
    'name', p_name, 'description', p_desc, 'canonical_url', p_url,
    'domain', regexp_replace(p_url, '^https?://([^/]+).*$', '\1'), 'slug_base', lower(replace(p_name, ' ', '-')),
    'launch_year', 2018, 'country_code', null, 'company_name', null, 'company_external_id', null,
    'company_slug_base', null, 'category_slugs', jsonb_build_array('business-operations-project-management'),
    'source_categories', jsonb_build_array('project management software'), 'licence', 'CC0-1.0',
    'retrieved_at', '2026-11-11T12:00:00Z',
    'content_hash', encode(pg_catalog.sha256(convert_to(p_id || p_url || p_desc, 'UTF8')), 'hex'))
$$;
grant execute on all functions in schema tests to service_role;
insert into public.platform_operators (user_id, note) values (tests.id('a1'), 'product owner (PD-12)');
select tests.as_service_role();

-- ------------------------------------------------------------ record (idempotent)
insert into r values ('same_domain', to_jsonb(public.sor_catalog_record_review(
  tests.review_row('Q7001', 'https://product-one.test/other-tool', 'Other Tool'),
  '{"status":"eligible","rule_set_version":"excl-1"}', 'same_domain_other_url', array[tests.id('d1')])));
insert into r values ('same_domain_replay', to_jsonb(public.sor_catalog_record_review(
  tests.review_row('Q7001', 'https://product-one.test/other-tool', 'Other Tool'),
  '{"status":"eligible","rule_set_version":"excl-1"}', 'same_domain_other_url', array[tests.id('d1')])));
select is((select v from r where k = 'same_domain_replay'), (select v from r where k = 'same_domain'),
  'a replayed review keeps the same row');
select is((select count(*)::int from public.catalog_listing_reviews where external_id = 'Q7001'), 1,
  'one review per source item');
insert into r values ('shared', to_jsonb(public.sor_catalog_record_review(
  tests.review_row('Q7002', 'https://apps.apple.com/app/synthetic/id1', 'Synthetic App'),
  '{"status":"eligible","rule_set_version":"excl-1"}', 'shared_host_website', '{}')));
insert into r values ('similar', to_jsonb(public.sor_catalog_record_review(
  tests.review_row('Q7003', 'https://brand-new-tool.test', 'Brand New Tool'),
  '{"status":"eligible","rule_set_version":"excl-1"}', 'similar_name', '{}')));

-- ------------------------------------------------------------ refusals
select throws_ok(format($$select public.sor_operator_resolve_catalog_review(%L, %L, 'reject', null, 'x')$$,
                        tests.id('a3'), (select v #>> '{}' from r where k = 'shared')),
  '42501', null, 'a non-operator cannot resolve a review');
select throws_ok(format($$select public.sor_operator_resolve_catalog_review(%L, %L, 'reject', null, '  ')$$,
                        tests.id('a1'), (select v #>> '{}' from r where k = 'shared')),
  '22023', null, 'rejecting needs a note');
select throws_ok(format($$select public.sor_operator_resolve_catalog_review(%L, %L, 'create')$$,
                        tests.id('a1'), (select v #>> '{}' from r where k = 'shared')),
  '55000', null, 'no product is created from a shared host (app store page)');
select throws_ok(format($$select public.sor_operator_resolve_catalog_review(%L, %L, 'attach')$$,
                        tests.id('a1'), (select v #>> '{}' from r where k = 'same_domain')),
  '22023', null, 'attaching needs an existing product');

-- ------------------------------------------------------------ attach
select lives_ok(format($$select public.sor_operator_resolve_catalog_review(%L, %L, 'attach', %L, 'same product page')$$,
                       tests.id('a1'), (select v #>> '{}' from r where k = 'same_domain'), tests.id('d1')),
  'the operator attaches a listing to an existing product');
select is((select status || '/' || (resolved_product_id = tests.id('d1')) || '/' || (resolved_at is not null)
             from public.catalog_listing_reviews where external_id = 'Q7001'),
  'attached/true/true', 'the review is resolved as attached to that product');
select is((select count(*)::int from public.evidence_items e join public.source_snapshots ss on ss.id = e.source_snapshot_id
             join public.source_records sr on sr.id = ss.source_record_id
            where e.product_id = tests.id('d1') and sr.external_id = 'Q7001'), 1,
  'the listing becomes declared evidence of the existing product (provenance kept)');
select is((select product_id from public.entity_identifiers
            where identifier_type = 'external_id' and value_normalized = 'Q7001' and valid_to is null),
  tests.id('d1'), 'its source id now identifies the product (a later collection matches it)');
select throws_ok(format($$select public.sor_operator_resolve_catalog_review(%L, %L, 'reject', null, 'again')$$,
                        tests.id('a1'), (select v #>> '{}' from r where k = 'same_domain')),
  '55000', null, 'a resolved review cannot be resolved twice');

-- ------------------------------------------------------------ create
select lives_ok(format($$select public.sor_operator_resolve_catalog_review(%L, %L, 'create')$$,
                       tests.id('a1'), (select v #>> '{}' from r where k = 'similar')),
  'the operator creates the product of a listing');
select is((select p.record_status::text || '/' || p.exclusion_status::text || '/' || p.name
             from public.catalog_listing_reviews v join public.saas_products p on p.id = v.resolved_product_id
            where v.external_id = 'Q7003'),
  'active/eligible/Brand New Tool', 'the created product is visible, through the usual ingestion rules');

-- ------------------------------------------------------------ reject and reopen
select lives_ok(format($$select public.sor_operator_resolve_catalog_review(%L, %L, 'reject', null, 'App store page')$$,
                       tests.id('a1'), (select v #>> '{}' from r where k = 'shared')),
  'the operator rejects a listing with a note');
select lives_ok($$select public.sor_catalog_record_review(
  tests.review_row('Q7002', 'https://apps.apple.com/app/synthetic/id1', 'Synthetic App'),
  '{"status":"eligible","rule_set_version":"excl-1"}', 'shared_host_website', '{}')$$,
  'the same listing collected again is recorded');
select is((select status from public.catalog_listing_reviews where external_id = 'Q7002'), 'rejected',
  'an unchanged rejected listing stays rejected');
select lives_ok($$select public.sor_catalog_record_review(
  tests.review_row('Q7002', 'https://apps.apple.com/app/synthetic/id1', 'Synthetic App', 'a new description'),
  '{"status":"eligible","rule_set_version":"excl-1"}', 'shared_host_website', '{}')$$,
  'a changed listing is recorded');
select is((select status || '/' || (resolved_at is null) from public.catalog_listing_reviews where external_id = 'Q7002'),
  'open/true', 'a rejected listing whose content changed comes back to review');

-- ------------------------------------------------------------ audit
select is((select count(*)::int from public.audit_logs
            where action = 'catalog.listing_review_resolution' and actor_user_id = tests.id('a1')), 3,
  'every operator decision is audited');

select * from finish();
rollback;
