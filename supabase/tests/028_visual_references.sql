-- S8.5 Visual references (PD-38, amendment of ADR-016): free-licence images
-- from Wikimedia Commons and publisher share images, displayed by reference
-- (no copy), each with its own rules, labels and precedence.
-- Synthetic fixtures only (.test hosts, generated hashes).
begin;
select no_plan();
select tests.seed();

-- ------------------------------------------------------------ privileges
select ok(not has_function_privilege('authenticated', 'public.sor_record_visual_reference(jsonb)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.sor_record_visual_reference(jsonb)', 'EXECUTE'),
  'browsers cannot record visual references');
select ok(has_function_privilege('service_role', 'public.sor_record_visual_reference(jsonb)', 'EXECUTE'),
  'the server records visual references');
select is((select is_enabled::text || '/' || storage_policy::text from public.sources where source_key = 'wikimedia_commons'),
  'true/metadata_only', 'Wikimedia Commons is registered, metadata only (images by reference)');

-- ------------------------------------------------------------ fixtures
-- Listing identities: Product One (eligible) and Product Three (excluded).
update public.saas_products set primary_domain = 'product-one.test', website_url = 'https://product-one.test/'
 where id = tests.id('d1');
update public.saas_products set primary_domain = 'product-three.test' where id = tests.id('d3');
insert into public.entity_identifiers (product_id, identifier_type, value_normalized, source_id, evidence_id)
select tests.id('d1'), 'external_id', 'Q101', s.id, tests.id('f1') from public.sources s where s.source_key = 'wikidata';
insert into public.entity_identifiers (product_id, identifier_type, value_normalized, source_id, evidence_id)
select tests.id('d3'), 'external_id', 'Q303', s.id, tests.id('f3') from public.sources s where s.source_key = 'wikidata';
insert into public.platform_operators (user_id, note) values (tests.id('a1'), 'product owner (PD-12)');
create temporary table r (k text primary key, v jsonb) on commit drop;
grant all on r to service_role, authenticated;
create function tests.licensed(p_extra jsonb default '{}'::jsonb) returns jsonb language sql set search_path = '' as $$
  select jsonb_build_object('kind', 'licensed', 'listing_source_key', 'wikidata', 'listing_external_id', 'Q101',
    'image_url', 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Product_One.png/1280px-Product_One.png',
    'page_url', 'https://commons.wikimedia.org/wiki/File:Product_One.png',
    'content_hash', repeat('c', 40), 'content_type', 'image/png', 'width', 1280, 'height', 720,
    'alt_text', 'Product One dashboard (synthetic test case)', 'observed_at', '2026-11-12T10:00:00Z',
    'licence_code', 'CC-BY-SA-4.0', 'licence_url', 'https://creativecommons.org/licenses/by-sa/4.0',
    'attribution', 'Jane Doe') || p_extra
$$;
create function tests.publisher(p_extra jsonb default '{}'::jsonb) returns jsonb language sql set search_path = '' as $$
  select jsonb_build_object('kind', 'publisher', 'listing_source_key', 'wikidata', 'listing_external_id', 'Q101',
    'image_url', 'https://cdn.product-one.test/og/home.png', 'page_url', 'https://www.product-one.test/',
    'content_hash', repeat('d', 64), 'content_type', 'image/png', 'width', 1200, 'height', 630,
    'alt_text', 'Product One share image (synthetic test case)', 'observed_at', '2026-11-12T10:00:00Z') || p_extra
$$;
create function tests.png() returns bytea language sql set search_path = '' as $$
  select '\x89504e470d0a1a0a0000000d49484452000006400000002b'::bytea || pg_catalog.convert_to(repeat('x', 64), 'UTF8')
$$;
create function tests.asset() returns jsonb language sql set search_path = '' as $$
  select jsonb_build_object('asset_type', 'official_hero', 'image_url', 'https://product-one.test/hero.png',
    'page_url', 'https://product-one.test/press', 'alt_text', 'Tableau de bord de Product One',
    'rights_basis', 'Press kit: reuse and storage allowed with attribution (synthetic test case)',
    'rights_evidence_url', 'https://product-one.test/press/licence', 'covers_private_copy', true,
    'content_type', 'image/png', 'width', 1600, 'height', 700, 'primary', true)
$$;
grant execute on all functions in schema tests to service_role, authenticated;

-- A reference is never an approved copy, and a licensed image carries its licence.
select throws_ok($$insert into public.product_visual_assets (product_id, asset_type, source_url, content_hash,
    alt_text, rights_basis, rights_status, verification_status, evidence_id, delivery_mode)
  values (tests.id('d1'), 'publisher_share_image', 'https://product-one.test/og.png', repeat('e', 64),
    'x', 'x', 'approved', 'verified', tests.id('f1'), 'external_reference')$$,
  '23514', null, 'a publisher share image cannot be marked as operator-approved');
select throws_ok($$insert into public.product_visual_assets (product_id, asset_type, source_url, content_hash,
    alt_text, rights_basis, rights_status, evidence_id, delivery_mode)
  values (tests.id('d1'), 'licensed_image', 'https://upload.wikimedia.org/x.png', repeat('e', 64),
    'x', 'x', 'licensed', tests.id('f1'), 'external_reference')$$,
  '23514', null, 'a free-licence image needs its licence');

select tests.as_service_role();

-- ------------------------------------------------------------ refusals
select throws_ok($$select public.sor_record_visual_reference(tests.licensed('{"licence_code":"CC-BY-NC-4.0"}'))$$,
  '22023', null, 'a non-commercial (or any non-free) licence is refused');
select throws_ok($$select public.sor_record_visual_reference(tests.licensed('{"attribution":""}'))$$,
  '22023', null, 'CC BY / CC BY-SA need the attribution');
select throws_ok($$select public.sor_record_visual_reference(tests.licensed('{"image_url":"https://example.test/x.png"}'))$$,
  '22023', null, 'a free-licence image comes from Wikimedia Commons');
select throws_ok($$select public.sor_record_visual_reference(tests.publisher('{"image_url":"http://cdn.product-one.test/og.png"}'))$$,
  '22023', null, 'images are https only');
select throws_ok($$select public.sor_record_visual_reference(tests.publisher('{"width":"wide"}'))$$,
  '22023', null, 'malformed dimensions are refused');
select is(public.sor_record_visual_reference(tests.licensed('{"listing_external_id":"Q999"}')) ->> 'status',
  'no_product', 'a listing that is not in the catalog records nothing');
select is(public.sor_record_visual_reference(tests.licensed('{"listing_external_id":"Q303"}')) ->> 'status',
  'not_visible', 'no visual for a product that is not visible (excluded)');
select is(public.sor_record_visual_reference(tests.publisher('{"page_url":"https://other-site.test/"}')) ->> 'status',
  'domain_mismatch', 'a share image comes only from the product''s own domain');
select is((select count(*)::integer from public.product_visual_assets), 0, 'nothing was written by the refusals');

-- ------------------------------------------------------------ record
insert into r values ('pub', public.sor_record_visual_reference(tests.publisher()));
select is((select v ->> 'status' || '/' || (v ->> 'primary') from r where k = 'pub'), 'created/true',
  'a publisher share image becomes the primary visual when there is none');
select is((select a.delivery_mode || '/' || a.rights_status || '/' || coalesce(a.delivery_path, 'none')
                  || '/' || s.source_key || '/' || e.fact_status::text || '/' || e.verification_status::text
             from public.product_visual_assets a
             join public.evidence_items e on e.id = a.evidence_id
             join public.source_snapshots ss on ss.id = e.source_snapshot_id
             join public.source_records sr on sr.id = ss.source_record_id
             join public.sources s on s.id = sr.source_id
            where a.id = (select (v ->> 'asset_id')::uuid from r where k = 'pub')),
  'external_reference/publisher_published/none/official_website/declared/unverified',
  'the share image is a reference with declared evidence from the official site, never a verified licence');
insert into r values ('lic', public.sor_record_visual_reference(tests.licensed()));
select is((select v ->> 'status' || '/' || (v ->> 'primary') from r where k = 'lic'), 'created/true',
  'a free-licence image takes precedence over the share image');
select is((select is_primary from public.product_visual_assets
            where id = (select (v ->> 'asset_id')::uuid from r where k = 'pub')), false,
  'the share image is kept but no longer primary');
select is(public.sor_record_visual_reference(tests.licensed()) ->> 'status', 'existing',
  'a replayed reference creates nothing');
insert into r values ('pub2', public.sor_record_visual_reference(tests.publisher(
  '{"image_url":"https://cdn.product-one.test/og/home-v2.png","content_hash":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd00"}')));
select is((select v ->> 'status' || '/' || (v ->> 'primary') from r where k = 'pub2'), 'created/false',
  'a new share image replaces the previous one without overtaking the free-licence image');
select is((select count(*)::integer from public.product_visual_assets
            where product_id = tests.id('d1') and asset_type = 'publisher_share_image' and is_current), 1,
  'one current share image per product (history kept)');
select is((select count(*)::integer from public.audit_logs where action = 'catalog.visual_reference_recorded'), 3,
  'every recorded reference is audited');

-- ------------------------------------------------------------ read side
select tests.authenticate_as(tests.id('a3'));
select is((select m.visual_asset ->> 'asset_type' || '|' || (m.visual_asset ->> 'url') || '|'
                  || (m.visual_asset ->> 'delivery_mode') || '|' || (m.visual_asset ->> 'licence_code') || '|'
                  || (m.visual_asset ->> 'attribution') || '|' || (m.visual_asset ->> 'source_url')
             from public.catalog_discover_metadata(array[tests.id('d1')]) m),
  'licensed_image|https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Product_One.png/1280px-Product_One.png|external_reference|CC-BY-SA-4.0|Jane Doe|https://commons.wikimedia.org/wiki/File:Product_One.png',
  'Discover shows the free-licence image by reference, with its licence, author and file page');
select is((select count(*)::integer from public.product_visual_assets where product_id = tests.id('d1')), 2,
  'members read the current references of a visible product');
select tests.as_anon();
select throws_ok($$select count(*) from public.product_visual_assets$$, '42501', null,
  'anonymous visitors read no visual');

-- ------------------------------------------------------------ approved copy wins, removal
select tests.as_service_role();
insert into r values ('copy', public.sor_admit_visual_asset(tests.id('a1'), tests.id('d1'), tests.asset(), tests.png()));
select tests.authenticate_as(tests.id('a3'));
select is((select m.visual_asset ->> 'asset_type' || '|' || (m.visual_asset ->> 'delivery_mode')
             from public.catalog_discover_metadata(array[tests.id('d1')]) m),
  'official_hero|private_copy', 'an operator-approved copy takes precedence over the references');
select tests.as_service_role();
select lives_ok($$select public.sor_operator_remove_visual_asset(tests.id('a1'),
    (select (v ->> 'asset_id')::uuid from r where k = 'lic'), 'Takedown request (synthetic)')$$,
  'an operator removes a free-licence reference');
select is((select rights_status || '/' || is_current::text from public.product_visual_assets
            where id = (select (v ->> 'asset_id')::uuid from r where k = 'lic')), 'removed/false',
  'the removed reference is hidden at once and kept in history');

select * from finish();
rollback;
