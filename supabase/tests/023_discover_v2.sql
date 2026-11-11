-- Discover V2: provenance, visible-only assets, safe grants and channel filters.
begin;
select no_plan();
select tests.seed();

select ok((select relrowsecurity from pg_class where oid='public.product_acquisition_channels'::regclass),
  'acquisition channel table has RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.product_visual_assets'::regclass),
  'visual asset table has RLS enabled');
select ok(not has_table_privilege('authenticated','public.product_acquisition_channels','INSERT')
    and not has_table_privilege('authenticated','public.product_acquisition_channels','UPDATE')
    and not has_table_privilege('authenticated','public.product_acquisition_channels','DELETE'),
  'browser roles cannot write acquisition facts directly');
select ok(not has_table_privilege('authenticated','public.product_visual_assets','INSERT')
    and not has_table_privilege('authenticated','public.product_visual_assets','UPDATE')
    and not has_table_privilege('authenticated','public.product_visual_assets','DELETE'),
  'browser roles cannot write or approve visual assets directly');
select ok(has_function_privilege('authenticated',
    'public.catalog_search_v2(uuid,jsonb,text,integer,numeric,uuid,integer)','EXECUTE')
    and has_function_privilege('authenticated','public.catalog_count_v2(uuid,jsonb)','EXECUTE')
    and has_function_privilege('authenticated','public.catalog_discover_metadata(uuid[])','EXECUTE'),
  'authenticated catalog endpoints can execute Discover V2 RPCs');
select ok(not has_function_privilege('anon',
    'public.catalog_search_v2(uuid,jsonb,text,integer,numeric,uuid,integer)','EXECUTE')
    and not has_function_privilege('anon','public.catalog_discover_metadata(uuid[])','EXECUTE'),
  'anonymous users cannot execute Discover V2 RPCs');

select tests.authenticate_as(tests.id('a3'));
select ok(private.catalog_channel_matches(tests.id('d1'),
    '{"values":["x"],"statuses":[],"include_unknown":true}'::jsonb),
  'products without sourced channels match only when unknowns are included');
select ok(not private.catalog_channel_matches(tests.id('d1'),
    '{"values":["x"],"statuses":[],"include_unknown":false}'::jsonb),
  'products without channel evidence do not match channel filters by default');

select tests.as_service_role();
update public.evidence_items set verification_status='verified',verified_at=now()
  where id=tests.id('f1');
insert into public.product_acquisition_channels
  (product_id,channel_key,channel_category,role,fact_status,confidence,method,evidence_id)
values (tests.id('d1'),'x','social','primary','confirmed',92,'official_statement',tests.id('f1'));

select tests.authenticate_as(tests.id('a3'));
select ok(not private.catalog_channel_matches(tests.id('d1'),
    '{"values":["x"],"statuses":["declared"],"include_unknown":false}'::jsonb),
  'a current channel with a nonmatching status is not returned');
select ok(private.catalog_channel_matches(tests.id('d1'),
    '{"values":["x"],"statuses":["confirmed"],"include_unknown":false}'::jsonb),
  'a sourced channel matches its channel and factual status');
select ok(not private.catalog_channel_matches(tests.id('d1'),
    '{"values":["reddit"],"statuses":[],"include_unknown":true}'::jsonb),
  'known channel data is not treated as unknown when a different channel is selected');
select is((select count(*)::integer from public.catalog_search_v2(
    tests.id('b1'), jsonb_build_object(
      'include_hidden',false,'configurable_exclusions','[]'::jsonb,
      'acquisition_channels','{"values":["x"],"statuses":["confirmed"],"include_unknown":false}'::jsonb
    ), 'relevance', 0, null, null, 30)), 1,
  'Discover V2 search filters the catalog by evidenced acquisition channel');
select is(public.catalog_count_v2(tests.id('b1'), jsonb_build_object(
    'include_hidden',false,'configurable_exclusions','[]'::jsonb,
    'acquisition_channels','{"values":["x"],"statuses":["confirmed"],"include_unknown":false}'::jsonb
  )), 1::bigint,
  'Discover V2 result count uses the same channel filter as search');
select is((select count(*)::integer from public.catalog_search_v2(
    tests.id('b1'), jsonb_build_object(
      'include_hidden',false,'configurable_exclusions','[]'::jsonb,
      'acquisition_channels','{"values":["reddit"],"statuses":[],"include_unknown":false}'::jsonb
    ), 'relevance', 0, null, null, 30)), 0,
  'Discover V2 search does not confuse a channel fact with another channel');
select * from finish();
rollback;
