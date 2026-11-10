-- First bulk catalog collection (10 Nov 2026): source registry, taxonomy
-- additions and the listing ingestion RPC (provenance, idempotency,
-- identity by source id, exclusion, disabled sources refused).
begin;
select no_plan();
select tests.seed();

select ok(not has_function_privilege('authenticated', 'public.sor_ingest_catalog_listing(jsonb,jsonb,jsonb)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.sor_ingest_catalog_listing(jsonb,jsonb,jsonb)', 'EXECUTE'),
  'browsers cannot write the catalog through the ingestion RPC');
select ok(has_function_privilege('service_role', 'public.sor_ingest_catalog_listing(jsonb,jsonb,jsonb)', 'EXECUTE'),
  'the server can ingest listings');

select is((select integration_status::text || '/' || is_enabled || '/' || (terms_reviewed_at is not null)
             from public.sources where source_key = 'wikidata'),
  'integrated/true/true', 'Wikidata is integrated, enabled and terms-reviewed');
select is((select integration_status::text || '/' || is_enabled from public.sources where source_key = 'product_hunt'),
  'planned/false', 'Product Hunt is registered but not enabled');
select is((select count(*)::int from public.categories where parent_id is null and is_user_visible), 14,
  'seven new top-level categories for a global catalog');
select ok((select is_user_visible and parent_id is not null from public.categories
            where slug = 'communication-collaboration-video-conferencing'),
  'new sub-categories are visible children');

create temporary table r (k text primary key, v jsonb) on commit drop;
grant all on r to service_role;
create function tests.listing(p_qid text, p_url text, p_name text, p_desc text default 'online project management software',
                              p_company text default 'Example Labs', p_company_qid text default 'Q900')
returns jsonb language sql set search_path = '' as $$
  select jsonb_build_object(
    'source_key', 'wikidata', 'external_id', p_qid, 'source_url', 'https://www.wikidata.org/wiki/' || p_qid,
    'name', p_name, 'description', p_desc, 'canonical_url', p_url, 'domain', regexp_replace(p_url, '^https?://([^/]+).*$', '\1'),
    'slug_base', lower(p_name), 'launch_year', 2015, 'country_code', 'US', 'company_name', p_company,
    'company_external_id', p_company_qid, 'company_slug_base', lower(p_company),
    'category_slugs', jsonb_build_array('business-operations-project-management', 'not-a-real-slug'),
    'licence', 'CC0-1.0', 'retrieved_at', '2026-11-10T12:00:00Z',
    'content_hash', encode(pg_catalog.sha256(convert_to(p_qid || p_url, 'UTF8')), 'hex'))
$$;
grant execute on all functions in schema tests to service_role;
select tests.as_service_role();


insert into r values ('first', public.sor_ingest_catalog_listing(
  tests.listing('Q101', 'https://taskboard-example.test', 'Taskboard Example'),
  '{"outcome":"new","rule":"no_match"}', '{"status":"eligible","rule_set_version":"excl-1"}'));
select is((select v ->> 'status' from r where k = 'first'), 'created', 'a new listing creates a product');

select tests.as_owner_role();
create temporary table p on commit drop as
  select * from public.saas_products where id = (select (v ->> 'product_id')::uuid from r where k = 'first');
select is((select record_status::text || '/' || exclusion_status::text || '/' || launch_year || '/' || short_description from p),
  'active/eligible/2015/online project management software', 'visible, with the declared description and year');
select is((select s.source_key from p join public.sources s on s.id = p.discovery_source_id), 'wikidata',
  'the product keeps its discovery source');
select is((select count(*)::int from public.evidence_items e where e.product_id = (select id from p)
            and e.fact_status = 'declared' and e.evidence_type = 'third_party_report' and e.reliability_level = 3), 1,
  'one declared, third-party evidence item');
select is((select string_agg(field_key, ',' order by field_key) from public.catalog_field_provenance
            where product_id = (select id from p) and is_current), 'launch_year,name,short_description,website_url',
  'every stored field has provenance');
select is((select string_agg(identifier_type || '=' || value_normalized, ',' order by identifier_type)
             from public.entity_identifiers where product_id = (select id from p)),
  'canonical_url=https://taskboard-example.test,domain=taskboard-example.test,external_id=Q101',
  'canonical URL, domain and source id identify the product');
select is((select count(*)::int from public.product_categories where product_id = (select id from p)), 1,
  'known category slugs only (an unknown slug is ignored)');
select is((select c.name || '/' || c.country_code from public.companies c where c.id = (select company_id from p)),
  'Example Labs/US', 'the developer company is created');
select ok((select (ss.extracted_metadata ->> 'licence') = 'CC0-1.0'
             from public.evidence_items e join public.source_snapshots ss on ss.id = e.source_snapshot_id
            where e.product_id = (select id from p)), 'the snapshot keeps the listing and its licence');
select tests.as_service_role();

-- Idempotent replay; a second product of the same developer reuses the company.
insert into r values ('replay', public.sor_ingest_catalog_listing(
  tests.listing('Q101', 'https://taskboard-example.test', 'Taskboard Example'),
  '{"outcome":"new","rule":"no_match"}', '{"status":"eligible","rule_set_version":"excl-1"}'));
select is((select v ->> 'status' || '/' || (v ->> 'product_id') from r where k = 'replay'),
  'matched_existing/' || (select v ->> 'product_id' from r where k = 'first'), 'a replayed listing creates nothing');
insert into r values ('sibling', public.sor_ingest_catalog_listing(
  tests.listing('Q102', 'https://docs-example.test', 'Docs Example', 'online document collaboration'),
  '{"outcome":"new","rule":"no_match"}', '{"status":"eligible","rule_set_version":"excl-1"}'));
select tests.as_owner_role();
select is((select count(distinct company_id)::int from public.saas_products where id in
             ((select (v ->> 'product_id')::uuid from r where k = 'first'), (select (v ->> 'product_id')::uuid from r where k = 'sibling'))), 1,
  'companies are deduplicated by their source id, not by name');
select is((select count(*)::int from public.companies where name = 'Example Labs'), 1, 'one company row');
select tests.as_service_role();

-- Matched existing product: evidence added, unknown fields filled, known ones kept.
insert into r values ('match', public.sor_ingest_catalog_listing(
  tests.listing('Q103', 'https://product-one.test', 'Product One', 'a different description'),
  jsonb_build_object('outcome', 'matched_existing', 'product_id', tests.id('d1'), 'rule', 'domain'),
  '{"status":"eligible","rule_set_version":"excl-1"}'));
select is((select v ->> 'status' from r where k = 'match'), 'matched_existing', 'an existing product is matched');
select tests.as_owner_role();
select is((select count(*)::int from public.evidence_items e join public.source_snapshots ss on ss.id = e.source_snapshot_id
             join public.source_records sr on sr.id = ss.source_record_id
            where e.product_id = tests.id('d1') and sr.external_id = 'Q103'), 1,
  'the original source is kept as evidence on the matched product');
select tests.as_service_role();

-- Excluded listings are stored hidden; disabled sources are refused.
insert into r values ('excluded', public.sor_ingest_catalog_listing(
  tests.listing('Q104', 'https://affiliate-example.test', 'Affiliate Example', 'affiliate tracking software'),
  '{"outcome":"new","rule":"no_match"}', '{"status":"excluded","rule_set_version":"excl-1","matched_rules":["R2"]}'));
select tests.as_owner_role();
select is((select record_status::text || '/' || exclusion_status::text from public.saas_products
            where id = (select (v ->> 'product_id')::uuid from r where k = 'excluded')),
  'candidate/excluded', 'an excluded listing is never visible');
update public.sources set is_enabled = false where source_key = 'wikidata';
select tests.as_service_role();
select throws_ok($$select public.sor_ingest_catalog_listing(tests.listing('Q105', 'https://x-example.test', 'X Example'),
  '{"outcome":"new","rule":"no_match"}', '{"status":"eligible","rule_set_version":"excl-1"}')$$,
  '55000', null, 'a disabled source cannot write the catalog');
select throws_ok($$select public.sor_ingest_catalog_listing(tests.listing('Q106', 'https://y-example.test', 'Y Example') - 'content_hash',
  '{"outcome":"new","rule":"no_match"}', '{"status":"eligible","rule_set_version":"excl-1"}')$$,
  '55000', null, 'checked before validation: still refused while disabled');

select * from finish();
rollback;
