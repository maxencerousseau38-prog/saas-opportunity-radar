-- Action rate limits (Sprint 7, S7.4d): invitations per workspace, manual
-- additions and correction reports per user; service role only.
begin;
select no_plan();
select tests.seed();

create function tests.err(p_sql text) returns text language plpgsql set search_path = '' as $$
begin
  execute p_sql;
  return 'no error';
exception when others then
  return sqlstate || ' ' || split_part(sqlerrm, ' retry_after=', 1);
end $$;
grant execute on all functions in schema tests to service_role;

select ok(not has_function_privilege('authenticated', 'public.sor_consume_rate_limit(text,uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.sor_consume_rate_limit(text,uuid)', 'EXECUTE'),
  'browsers cannot consume or probe rate limits');
select ok(has_function_privilege('service_role', 'public.sor_consume_rate_limit(text,uuid)', 'EXECUTE'),
  'the server consumes them');
select is((select value #>> '{}' from public.platform_limits where key = 'api_rate_limit_invitations_per_hour'), '20',
  'default invitation limit');

select tests.as_owner_role();
update public.platform_limits set value = '2'
 where key in ('api_rate_limit_invitations_per_hour', 'api_rate_limit_manual_additions_per_hour',
               'api_rate_limit_correction_reports_per_hour');
select tests.as_service_role();

select is(public.sor_consume_rate_limit('invitation', tests.id('b1')), 1, 'first invitation counted');
select is(public.sor_consume_rate_limit('invitation', tests.id('b1')), 2, 'second invitation counted');
select is(tests.err($$select public.sor_consume_rate_limit('invitation', tests.id('b1'))$$),
  '54000 RATE_LIMITED: invitations', 'the third invitation in the hour is refused');
select is(public.sor_consume_rate_limit('invitation', tests.id('b2')), 1, 'another workspace has its own budget');

select is(public.sor_consume_rate_limit('manual_addition', tests.id('a3')), 1, 'manual additions counted per user');
select is(public.sor_consume_rate_limit('manual_addition', tests.id('a3')), 2, 'second manual addition');
select is(tests.err($$select public.sor_consume_rate_limit('manual_addition', tests.id('a3'))$$),
  '54000 RATE_LIMITED: manual additions', 'the third manual addition in the hour is refused');
select is(public.sor_consume_rate_limit('correction_report', tests.id('a3')), 1,
  'correction reports have their own budget');
select is(tests.err($$select public.sor_consume_rate_limit('correction_report', tests.id('a3'));
                      select public.sor_consume_rate_limit('correction_report', tests.id('a3'))$$),
  '54000 RATE_LIMITED: correction reports', 'the third correction report in the hour is refused');

select throws_ok($$select public.sor_consume_rate_limit('everything', tests.id('a3'))$$, '22023', null,
  'unknown actions are refused');
select throws_ok($$select public.sor_consume_rate_limit('invitation', null)$$, '22023', null,
  'a subject is required');

select * from finish();
rollback;
