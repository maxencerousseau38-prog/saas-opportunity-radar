-- PD-41 Discover feed renewal (rule feed-1): privileges and RLS of the feed
-- signals, the server-only write path and its once-per-session rule, the
-- parity of private.feed_score with @sor/domain, and the 'discovery' sort of
-- catalog_search_v3 (new first, seen and opened later, stable pagination
-- inside a session, favourites untouched). Synthetic fixtures only.
begin;
select no_plan();
select tests.seed();

-- Twelve more visible products (d1 is the only visible one in the seed).
insert into public.saas_products (id, company_id, name, slug, record_status, exclusion_status, first_discovered_at)
select tests.id('9' || lpad(g::text, 3, '0')), tests.id('c1'), 'Feed ' || g, 'feed-' || g, 'active', 'eligible',
       now() - interval '30 days'
  from generate_series(1, 12) g;
update public.saas_products set first_discovered_at = now() - interval '30 days' where id = tests.id('d1');
-- One recent catalogue addition.
update public.saas_products set first_discovered_at = now() - interval '1 day' where id = tests.id('9012');

create temporary table r (k text primary key, v text) on commit drop;
grant all on r to service_role, authenticated;
create function tests.feed(p_as_of timestamptz, p_after_value numeric default null, p_after_id uuid default null,
                           p_limit integer default 100)
returns table (id uuid, sort_value text) language sql set search_path = '' as $$
  select s.id, s.sort_value from public.catalog_search_v3(tests.id('b1'), '{}'::jsonb, 'discovery', 42, p_as_of,
    p_after_value, p_after_id, p_limit) s
$$;
grant execute on all functions in schema tests to service_role, authenticated;

-- ------------------------------------------------------------ privileges
select ok(not has_function_privilege('authenticated', 'public.sor_record_feed_signals(uuid,uuid,timestamptz,uuid[],uuid[])', 'EXECUTE')
          and not has_function_privilege('anon', 'public.sor_record_feed_signals(uuid,uuid,timestamptz,uuid[],uuid[])', 'EXECUTE'),
  'browsers cannot write feed signals directly');
select ok(has_function_privilege('service_role', 'public.sor_record_feed_signals(uuid,uuid,timestamptz,uuid[],uuid[])', 'EXECUTE'),
  'the server records feed signals');
select ok(has_table_privilege('authenticated', 'public.workspace_feed_signals', 'SELECT')
          and not has_table_privilege('authenticated', 'public.workspace_feed_signals', 'INSERT')
          and not has_table_privilege('authenticated', 'public.workspace_feed_signals', 'UPDATE')
          and not has_table_privilege('authenticated', 'public.workspace_feed_signals', 'DELETE'),
  'members read feed signals, never write them');
select ok(not has_table_privilege('anon', 'public.workspace_feed_signals', 'SELECT'), 'anon reads no feed signal');

-- ------------------------------------------------------------ parity with @sor/domain feedScore
select is(private.feed_score(0.25, 7, 0, null, null), 1.25, 'parity: new addition never seen');
select is(private.feed_score(0.25, 30, 0, null, null), 0.75, 'parity: older product never seen');
select is(private.feed_score(0.25, 30, 2, 3.5, null), -0.36, 'parity: shown 3.5 days ago, twice');
select is(private.feed_score(0.25, 30, 7, 10, null), -0.15, 'parity: shown long ago, many times');
select is(private.feed_score(0.25, 30, 1, 15, 15), -0.75, 'parity: opened 15 days ago');
select is(private.feed_score(0.25, 30, 0, null, 60), -0.15, 'parity: opened 60 days ago');
select is(private.feed_score(0.25, 30, 0, null, -1), -1.35, 'parity: an opening in the future counts as now');

-- ------------------------------------------------------------ write path
select tests.as_service_role();
select throws_ok($$select public.sor_record_feed_signals(tests.id('b1'), tests.id('a4'), now(), array[tests.id('d1')], '{}')$$,
  '42501', null, 'a viewer records no feed signal');
select throws_ok($$select public.sor_record_feed_signals(tests.id('b1'), tests.id('a5'), now(), array[tests.id('d1')], '{}')$$,
  '42501', null, 'a non-member records no feed signal');
select throws_ok($$select public.sor_record_feed_signals(tests.id('b1'), tests.id('a3'), now() - interval '2 days', array[tests.id('d1')], '{}')$$,
  '22023', null, 'a session older than 24 hours is refused');
select throws_ok($$select public.sor_record_feed_signals(tests.id('b1'), tests.id('a3'), now(),
    array(select gen_random_uuid() from generate_series(1, 101)), '{}')$$,
  '22023', null, 'at most 100 shown cards per call');

-- An earlier session (3 days ago) showed d1, 9001 and 9002 and opened 9001.
-- Recorded directly as history: the write path only accepts recent sessions.
select tests.as_owner_role();
insert into public.workspace_feed_signals (workspace_id, product_id, shown_count, last_shown_at, opened_count, last_opened_at)
values (tests.id('b1'), tests.id('d1'), 1, now() - interval '3 days', 0, null),
       (tests.id('b1'), tests.id('9001'), 1, now() - interval '3 days', 1, now() - interval '3 days'),
       (tests.id('b1'), tests.id('9002'), 1, now() - interval '3 days', 0, null);
-- Hidden products stay out of the feed; a favourite keeps its flag.
insert into public.workspace_product_states (workspace_id, product_id, is_hidden, updated_by)
values (tests.id('b1'), tests.id('9003'), true, tests.id('a3'));
insert into public.workspace_product_states (workspace_id, product_id, is_favorite, updated_by)
values (tests.id('b1'), tests.id('9004'), true, tests.id('a3'));
-- A product never visible is never recorded.
select tests.as_service_role();
select is(public.sor_record_feed_signals(tests.id('b1'), tests.id('a3'), now(), array[tests.id('d3')], '{}'), 0,
  'an excluded product is never recorded');

-- ------------------------------------------------------------ ranking of a new session
-- Session start strictly after the history above (transaction time is frozen: use now() + 1 s).
insert into r values ('as_of', (now() + interval '1 second')::text);
select tests.authenticate_as(tests.id('a3'));
select is((select count(*)::integer from tests.feed((select v::timestamptz from r where k = 'as_of'))), 12,
  'the feed lists every visible product except the hidden one');
select is((select (array_agg(id order by sort_value::numeric desc, id desc))[1]
             from tests.feed((select v::timestamptz from r where k = 'as_of'))),
  tests.id('9012'), 'the recent catalogue addition comes first');
select ok((select max(sort_value::numeric) from tests.feed((select v::timestamptz from r where k = 'as_of'))
            where id in (tests.id('d1'), tests.id('9001'), tests.id('9002')))
          < (select min(sort_value::numeric) from tests.feed((select v::timestamptz from r where k = 'as_of'))
              where id not in (tests.id('d1'), tests.id('9001'), tests.id('9002'))),
  'cards shown in the last session come after every never-seen product');
select ok((select sort_value::numeric from tests.feed((select v::timestamptz from r where k = 'as_of')) where id = tests.id('9001'))
          < (select min(sort_value::numeric) from tests.feed((select v::timestamptz from r where k = 'as_of'))
              where id not in (tests.id('d1'), tests.id('9001'), tests.id('9002'))) - 1,
  'the product opened in the last session falls well below every never-seen product');
insert into r select 'order1', string_agg(id::text, ',' order by sort_value::numeric desc, id desc)
  from tests.feed((select v::timestamptz from r where k = 'as_of'));

-- Pages of 5 within the session, with signals recorded between pages:
-- same order, no duplicate, nothing missing.
insert into r select 'p1', string_agg(id::text, ',' order by sort_value::numeric desc, id desc)
  from tests.feed((select v::timestamptz from r where k = 'as_of'), null, null, 5);
insert into r select 'p1_last', (select sort_value || '|' || id from tests.feed((select v::timestamptz from r where k = 'as_of'), null, null, 5)
                                  order by sort_value::numeric asc, id asc limit 1);
select tests.as_service_role();
select is(public.sor_record_feed_signals(tests.id('b1'), tests.id('a3'), (select v::timestamptz from r where k = 'as_of'),
  (select array_agg(x::uuid) from unnest(string_to_array((select v from r where k = 'p1'), ',')) x),
  array[tests.id('9012')]), 6, 'five shown cards and one opening recorded');
select is(public.sor_record_feed_signals(tests.id('b1'), tests.id('a3'), (select v::timestamptz from r where k = 'as_of'),
  (select array_agg(x::uuid) from unnest(string_to_array((select v from r where k = 'p1'), ',')) x),
  array[tests.id('9012')]), 0, 'the same session records a card once');
-- d1, shown in the earlier session, ranks low: shown again further down the feed.
select is(public.sor_record_feed_signals(tests.id('b1'), tests.id('a3'), (select v::timestamptz from r where k = 'as_of'),
  array[tests.id('d1')], '{}'), 1, 'a card from an earlier session is recorded again in this one');
select is((select shown_count from public.workspace_feed_signals where workspace_id = tests.id('b1') and product_id = tests.id('d1')), 2,
  'a card shown in a second session counts twice');
select ok((select prev_shown_at < (select v::timestamptz from r where k = 'as_of')
             from public.workspace_feed_signals where workspace_id = tests.id('b1') and product_id = tests.id('d1')),
  'the showing before the session is kept for the session''s own ranking');
select tests.authenticate_as(tests.id('a3'));
insert into r select 'rest', string_agg(id::text, ',' order by sort_value::numeric desc, id desc)
  from tests.feed((select v::timestamptz from r where k = 'as_of'),
    split_part((select v from r where k = 'p1_last'), '|', 1)::numeric,
    split_part((select v from r where k = 'p1_last'), '|', 2)::uuid, 100);
select is((select v from r where k = 'p1') || ',' || (select v from r where k = 'rest'), (select v from r where k = 'order1'),
  'pages stay consistent inside a session despite the signals recorded meanwhile');
select is((select string_agg(id::text, ',' order by sort_value::numeric desc, id desc)
             from tests.feed((select v::timestamptz from r where k = 'as_of'))), (select v from r where k = 'order1'),
  'coming back in the same session shows the same feed');

-- The next session sees the signals: the opened addition leaves the top.
select isnt((select (array_agg(id order by sort_value::numeric desc, id desc))[1]
               from tests.feed(now() + interval '1 hour')), tests.id('9012'),
  'in the next session the opened addition is no longer first');
select ok((select max(sort_value::numeric) from tests.feed(now() + interval '1 hour')
            where id = any(string_to_array((select v from r where k = 'p1'), ',')::uuid[]))
          < (select min(sort_value::numeric) from tests.feed(now() + interval '1 hour')
              where id <> all(string_to_array((select v from r where k = 'p1'), ',')::uuid[])
                and id not in (tests.id('d1'), tests.id('9001'), tests.id('9002'))),
  'cards seen in the previous session come after the ones never seen');
select is((select is_favorite from public.workspace_product_states
            where workspace_id = tests.id('b1') and product_id = tests.id('9004')), true,
  'favourites are untouched');
select is((select count(*)::integer from public.catalog_search_v3(tests.id('b1'), '{"text":"Feed 7"}'::jsonb, 'discovery', 1, now())
            where name = 'Feed 7'), 1, 'a text search still works with the discovery sort');

-- ------------------------------------------------------------ isolation
select tests.authenticate_as(tests.id('a5'));
select is((select count(*)::integer from public.workspace_feed_signals), 0, 'another workspace reads no feed signal');
select throws_ok($$select * from public.catalog_search_v3(tests.id('b1'), '{}'::jsonb, 'discovery', 1, now())$$,
  '42501', null, 'a non-member cannot rank another workspace''s feed');
select tests.authenticate_as(tests.id('a4'));
select ok((select count(*) from public.workspace_feed_signals) > 0, 'a viewer reads the workspace feed signals');
select throws_ok($$insert into public.workspace_feed_signals (workspace_id, product_id) values (tests.id('b1'), tests.id('9005'))$$,
  '42501', null, 'a viewer cannot write feed signals');
select tests.authenticate_as(tests.id('a1'));
select throws_ok($$update public.workspace_feed_signals set shown_count = 0$$, '42501', null,
  'even the owner cannot rewrite feed signals from the browser');
select tests.as_anon();
select throws_ok($$select * from public.catalog_search_v3(tests.id('b1'), '{}'::jsonb, 'discovery', 1, now())$$,
  '42501', null, 'anon cannot search');

select * from finish();
rollback;
