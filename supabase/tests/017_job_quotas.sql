-- Job quotas and rate limits (Sprint 7, S7.2): per-user hourly job requests
-- (RATE_LIMITED), per-workspace daily jobs (LIMIT_EXCEEDED), idempotent
-- replays never consume, refused requests leave nothing behind, usage RPC.
begin;
select no_plan();
select tests.seed();

-- SQLSTATE + message without the variable retry delay.
create function tests.err(p_sql text) returns text language plpgsql set search_path = '' as $$
begin
  execute p_sql;
  return 'no error';
exception when others then
  return sqlstate || ' ' || split_part(sqlerrm, ' retry_after=', 1);
end $$;
create function tests.retry_after(p_sql text) returns integer language plpgsql set search_path = '' as $$
begin
  execute p_sql;
  return null;
exception when others then
  return nullif(split_part(sqlerrm, 'retry_after=', 2), '')::integer;
end $$;
create function tests.imp(p_user uuid, p_key text, p_ws uuid default null) returns uuid
language sql set search_path = '' as $$
  select r.job_id from public.sor_request_job('catalog_import', coalesce(p_ws, tests.id('b1')), p_user, p_key,
    encode(pg_catalog.sha256(convert_to('quota', 'UTF8')), 'hex'),
    jsonb_build_object('csv', 'name,website_url' || chr(10) || 'X,https://x.test/', 'row_count', 1)) r
$$;
grant execute on all functions in schema tests to service_role;

-- ------------------------------------------------------------ privileges
select ok(not has_function_privilege('authenticated', 'public.sor_workspace_usage(uuid,uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.sor_workspace_usage(uuid,uuid)', 'EXECUTE'),
  'browsers cannot read usage through the RPC directly');
select ok(has_function_privilege('service_role', 'public.sor_workspace_usage(uuid,uuid)', 'EXECUTE'),
  'the server reads usage');
select ok(not has_function_privilege('authenticated', 'private.consume_rate_limit(text,integer,interval)', 'EXECUTE')
          and not has_function_privilege('service_role', 'private.consume_rate_limit(text,integer,interval)', 'EXECUTE'),
  'rate-limit counters are only reachable through job creation');
select is((select value #>> '{}' from public.platform_limits where key = 'workspace_max_jobs_per_day'), '200',
  'default daily job quota per workspace');

-- Tight limits for the test; concurrency out of the way.
select tests.as_owner_role();
update public.platform_limits set value = '2' where key = 'api_rate_limit_job_posts_per_hour';
update public.platform_limits set value = '100' where key = 'max_concurrent_jobs_per_workspace';
select tests.as_service_role();

-- ------------------------------------------------------------ hourly rate limit per user
select isnt(tests.imp(tests.id('a3'), 'quota-key-0001'), null, 'first job request accepted');
select isnt(tests.imp(tests.id('a3'), 'quota-key-0002'), null, 'second job request accepted');
select is(tests.err($$select tests.imp(tests.id('a3'), 'quota-key-0003')$$), '54000 RATE_LIMITED: job posts',
  'third request in the hour is rate limited');
select ok(tests.retry_after($$select tests.imp(tests.id('a3'), 'quota-key-0003')$$) between 1 and 3600,
  'the refusal says when the window resets');
select is((select count(*)::integer from public.job_executions where idempotency_key = 'quota-key-0003'), 0,
  'a refused request leaves no job behind');
select is((select (r.created)::text from public.sor_request_job('catalog_import', tests.id('b1'), tests.id('a3'),
             'quota-key-0001', encode(pg_catalog.sha256(convert_to('quota', 'UTF8')), 'hex'),
             jsonb_build_object('csv', 'name,website_url' || chr(10) || 'X,https://x.test/', 'row_count', 1)) r),
  'false', 'an idempotent replay is answered even at the limit and consumes nothing');
select isnt(tests.imp(tests.id('a2'), 'quota-key-0004'), null, 'another user keeps their own budget');
select tests.as_owner_role();
select is((select request_count from public.rate_limit_counters where bucket_key = 'job_post:' || tests.id('a3')),
  2, 'refused requests and replays are not counted');
select tests.as_service_role();

-- ------------------------------------------------------------ usage
select is((public.sor_workspace_usage(tests.id('b1'), tests.id('a3')) ->> 'my_job_requests_this_hour')::integer, 2,
  'usage reports the caller''s requests this hour');
select is((public.sor_workspace_usage(tests.id('b1'), tests.id('a4')) ->> 'my_job_requests_this_hour')::integer, 0,
  'a viewer sees their own (empty) budget');
select is((public.sor_workspace_usage(tests.id('b1'), tests.id('a3')) ->> 'jobs_today')::integer, 3,
  'usage counts the workspace jobs created today');
select is((public.sor_workspace_usage(tests.id('b1'), tests.id('a3')) ->> 'active_jobs')::integer, 3,
  'usage counts active jobs');
select is((public.sor_workspace_usage(tests.id('b1'), tests.id('a3')) ->> 'max_job_requests_per_hour')::integer, 2,
  'usage reports the configured limits');
select throws_ok($$select public.sor_workspace_usage(tests.id('b1'), tests.id('a6'))$$, '42501', null,
  'a non-member cannot read the workspace usage');
select throws_ok($$select public.sor_workspace_usage(tests.id('b1'), tests.id('a5'))$$, '42501', null,
  'a member of another workspace cannot read it either');

-- ------------------------------------------------------------ daily quota per workspace
select tests.as_owner_role();
update public.platform_limits set value = '100' where key = 'api_rate_limit_job_posts_per_hour';
update public.platform_limits set value = '4' where key = 'workspace_max_jobs_per_day';
select tests.as_service_role();
select isnt(tests.imp(tests.id('a1'), 'quota-key-0005'), null, 'the fourth job of the day is accepted');
select is(tests.err($$select tests.imp(tests.id('a1'), 'quota-key-0006')$$), '54000 LIMIT_EXCEEDED: daily jobs',
  'the fifth job of the day is refused');
select ok(tests.retry_after($$select tests.imp(tests.id('a1'), 'quota-key-0006')$$) between 1 and 86400,
  'the refusal says when the day resets (UTC)');
select isnt(tests.imp(tests.id('a5'), 'quota-key-0007', tests.id('b2')), null,
  'another workspace keeps its own daily quota');
select tests.as_owner_role();
update public.job_executions set created_at = now() - interval '1 day' where workspace_id = tests.id('b1');
select tests.as_service_role();
select isnt(tests.imp(tests.id('a1'), 'quota-key-0006'), null, 'jobs from previous days do not count');

-- ------------------------------------------------------------ concurrency (M5) still applies first
select tests.as_owner_role();
update public.platform_limits set value = '5' where key = 'max_concurrent_jobs_per_workspace';
update public.platform_limits set value = '100' where key = 'workspace_max_jobs_per_day';
select tests.as_service_role();
select is(tests.err($$select tests.imp(tests.id('a1'), 'quota-key-0008')$$), '54000 LIMIT_EXCEEDED: concurrent jobs',
  'the concurrency limit is unchanged');

select * from finish();
rollback;
