-- PD-40 site visuals by reference and visref-2 quality rules: the official
-- hero and interface screenshot shown on the product's own site, the single
-- precedence (approved copy > hero > screenshot > free licence > share image),
-- the primary hand-over on removal, and the retirement of generic images.
-- Synthetic fixtures only (.test hosts, generated hashes).
begin;
select no_plan();
select tests.seed();

update public.saas_products set primary_domain = 'product-one.test', website_url = 'https://product-one.test/'
 where id = tests.id('d1');
update public.saas_products set primary_domain = 'product-two.test', website_url = 'https://product-two.test/',
       record_status = 'active', exclusion_status = 'eligible'
 where id = tests.id('d2');
insert into public.entity_identifiers (product_id, identifier_type, value_normalized, source_id, evidence_id)
select tests.id('d1'), 'external_id', 'Q101', s.id, tests.id('f1') from public.sources s where s.source_key = 'wikidata';
insert into public.entity_identifiers (product_id, identifier_type, value_normalized, source_id, evidence_id)
select tests.id('d2'), 'external_id', 'Q202', s.id, null from public.sources s where s.source_key = 'wikidata';
insert into public.platform_operators (user_id, note) values (tests.id('a1'), 'product owner (PD-12)');
create temporary table r (k text primary key, v jsonb) on commit drop;
grant all on r to service_role, authenticated;
create function tests.ref(p_kind text, p_extra jsonb default '{}'::jsonb) returns jsonb language sql set search_path = '' as $$
  select jsonb_build_object('kind', p_kind, 'listing_source_key', 'wikidata', 'listing_external_id', 'Q101',
    'image_url', 'https://cdn.product-one.test/' || p_kind || '.png', 'page_url', 'https://product-one.test/',
    'content_hash', md5(p_kind) || md5(p_kind), 'content_type', 'image/png', 'width', 1600, 'height', 900,
    'alt_text', 'Product One ' || p_kind || ' (synthetic test case)', 'observed_at', '2026-11-12T11:00:00Z',
    'rules_version', 'visref-2') || p_extra
$$;
create function tests.licensed() returns jsonb language sql set search_path = '' as $$
  select jsonb_build_object('kind', 'licensed', 'listing_source_key', 'wikidata', 'listing_external_id', 'Q101',
    'image_url', 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Product_One.png',
    'page_url', 'https://commons.wikimedia.org/wiki/File:Product_One.png',
    'content_hash', repeat('c', 40), 'content_type', 'image/png', 'width', 1280, 'height', 720,
    'alt_text', 'Product One dashboard (synthetic test case)', 'observed_at', '2026-11-12T10:00:00Z',
    'licence_code', 'CC0-1.0', 'licence_url', 'https://creativecommons.org/publicdomain/zero/1.0/')
$$;
create function tests.primary_type(p_product uuid) returns text language sql set search_path = '' as $$
  select string_agg(asset_type, ',') from public.product_visual_assets
   where product_id = p_product and is_current and is_primary
$$;
grant execute on all functions in schema tests to service_role, authenticated;

-- ------------------------------------------------------------ privileges and kinds
select ok(not has_function_privilege('authenticated', 'public.sor_retire_generic_visual_references()', 'EXECUTE')
          and not has_function_privilege('anon', 'public.sor_retire_generic_visual_references()', 'EXECUTE'),
  'browsers cannot retire visual references');
select ok(has_function_privilege('service_role', 'public.sor_retire_generic_visual_references()', 'EXECUTE'),
  'the server retires generic references');
select throws_ok($$insert into public.product_visual_assets (product_id, asset_type, source_url, content_hash,
    alt_text, rights_basis, rights_status, evidence_id, delivery_mode, licence_code, licence_url)
  values (tests.id('d1'), 'official_hero', 'https://product-one.test/h.png', repeat('e', 64),
    'x', 'x', 'publisher_published', tests.id('f1'), 'external_reference', 'CC0-1.0', 'https://cc.test/')$$,
  '23514', null, 'a site image never carries a licence it does not have');
select throws_ok($$insert into public.product_visual_assets (product_id, asset_type, source_url, content_hash,
    alt_text, rights_basis, rights_status, evidence_id, delivery_mode)
  values (tests.id('d1'), 'official_illustration', 'https://product-one.test/i.png', repeat('e', 64),
    'x', 'x', 'publisher_published', tests.id('f1'), 'external_reference')$$,
  '23514', null, 'only the hero and the screenshot are site references');

select tests.as_service_role();
select is(public.sor_record_visual_reference(tests.ref('site_hero', '{"page_url":"https://elsewhere.test/"}')) ->> 'status',
  'domain_mismatch', 'a site image comes only from the product''s own site');
select is((select count(*)::integer from public.product_visual_assets), 0, 'nothing was written by the refusal');

-- ------------------------------------------------------------ precedence
insert into r values ('pub', public.sor_record_visual_reference(tests.ref('publisher')));
select is(tests.primary_type(tests.id('d1')), 'publisher_share_image', 'a share image is shown when it is the only visual');
insert into r values ('lic', public.sor_record_visual_reference(tests.licensed()));
select is(tests.primary_type(tests.id('d1')), 'licensed_image', 'a free-licence image ranks above the share image');
insert into r values ('shot', public.sor_record_visual_reference(tests.ref('site_screenshot')));
select is((select v ->> 'status' || '/' || (v ->> 'primary') from r where k = 'shot'), 'created/true',
  'the interface screenshot from the official site becomes primary');
select is((select a.asset_type || '/' || a.delivery_mode || '/' || a.rights_status || '/' || s.source_key
             || '/' || e.fact_status::text
             from public.product_visual_assets a
             join public.evidence_items e on e.id = a.evidence_id
             join public.source_snapshots ss on ss.id = e.source_snapshot_id
             join public.source_records sr on sr.id = ss.source_record_id
             join public.sources s on s.id = sr.source_id
            where a.id = (select (v ->> 'asset_id')::uuid from r where k = 'shot')),
  'product_screenshot/external_reference/publisher_published/official_website/declared',
  'a site screenshot is a declared reference from the official site');
insert into r values ('hero', public.sor_record_visual_reference(tests.ref('site_hero')));
select is(tests.primary_type(tests.id('d1')), 'official_hero', 'the official hero ranks first among references');
select is((select count(*)::integer from public.product_visual_assets
            where product_id = tests.id('d1') and is_current
              and asset_type in ('official_hero', 'product_screenshot')), 1,
  'one current site image per product: the hero replaced the screenshot (history kept)');
select is((select count(*)::integer from public.product_visual_assets where product_id = tests.id('d1') and is_current), 3,
  'the share image and the free-licence image are kept as fallbacks');
select is(public.sor_record_visual_reference(tests.ref('site_hero')) ->> 'status', 'existing',
  'a replayed site image creates nothing');

select tests.authenticate_as(tests.id('a3'));
select is((select m.visual_asset ->> 'asset_type' || '|' || (m.visual_asset ->> 'delivery_mode') || '|'
                  || (m.visual_asset ->> 'rights_status') || '|' || (m.visual_asset ->> 'source_url')
             from public.catalog_discover_metadata(array[tests.id('d1')]) m),
  'official_hero|external_reference|publisher_published|https://product-one.test/',
  'Discover shows the official hero by reference with the page that shows it');

-- ------------------------------------------------------------ removal hands over
select tests.as_service_role();
select lives_ok($$select public.sor_operator_remove_visual_asset(tests.id('a1'),
    (select (v ->> 'asset_id')::uuid from r where k = 'hero'), 'Takedown request (synthetic)')$$,
  'an operator removes the hero');
select is(tests.primary_type(tests.id('d1')), 'licensed_image',
  'the next best current visual takes over at once');

-- ------------------------------------------------------------ generic images
-- Product Two shows the very same image as Product One's share image: a template.
select is(public.sor_record_visual_reference(tests.ref('publisher', jsonb_build_object(
    'listing_external_id', 'Q202', 'page_url', 'https://product-two.test/'))) ->> 'status', 'created',
  'the same share image is recorded for a second product');
select is(public.sor_record_visual_reference(tests.ref('site_screenshot', jsonb_build_object(
    'listing_external_id', 'Q202', 'page_url', 'https://product-two.test/',
    'image_url', 'https://lovable.dev/opengraph-image-p98pqg.png', 'content_hash', repeat('9', 64)))) ->> 'status',
  'created', 'a builder default recorded before visref-2');
insert into r values ('retire', public.sor_retire_generic_visual_references());
select is((select v from r where k = 'retire'),
  '{"retired": 3, "shared": 2, "platform_default_or_stock": 1}'::jsonb,
  'the shared image (both products) and the builder default are retired');
select is(tests.primary_type(tests.id('d1')), 'licensed_image', 'Product One keeps its free-licence image');
select is(tests.primary_type(tests.id('d2')), null, 'Product Two falls back to the honest state');
select is((select count(*)::integer from public.product_visual_assets
            where rights_status = 'removed' and removal_reason like 'Image générique%'), 3,
  'retired references are kept in history with their reason');
select is(public.sor_retire_generic_visual_references() ->> 'retired', '0', 'a replay retires nothing new');
select is((select count(*)::integer from public.audit_logs where action = 'catalog.generic_visual_references_retired'), 1,
  'the retirement is audited');

select * from finish();
rollback;
