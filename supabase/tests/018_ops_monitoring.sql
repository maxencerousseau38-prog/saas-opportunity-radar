-- Monitoring and alerts (Sprint 7, S7.3): server-only snapshot of the queue,
-- stuck jobs, failures, provider errors and AI cost; alert state with
-- open / refresh / resolve transitions; workspace AI cost of the day.
begin;
select no_plan();
select tests.seed();

-- ------------------------------------------------------------ privileges
select ok(not has_function_privilege('authenticated', 'public.sor_ops_snapshot()', 'EXECUTE')
          and not has_function_privilege('anon', 'public.sor_ops_snapshot()', 'EXECUTE'),
  'browsers cannot read the platform snapshot');
select ok(not has_function_privilege('authenticated', 'public.sor_ops_sync_alerts(jsonb)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.sor_ops_sync_alerts(jsonb)', 'EXECUTE'),
  'browsers cannot change alerts');
select ok(has_function_privilege('service_role', 'public.sor_ops_snapshot()', 'EXECUTE')
          and has_function_privilege('service_role', 'public.sor_ops_sync_alerts(jsonb)', 'EXECUTE'),
  'the server reads the snapshot and syncs alerts');
select ok(not has_table_privilege('authenticated', 'public.ops_alerts', 'SELECT')
          and not has_table_privilege('anon', 'public.ops_alerts', 'SELECT'),
  'ops_alerts is server-only');
select is((select value #>> '{}' from public.platform_limits where key = 'ops_queue_wait_alert_seconds'), '900',
  'default queue-wait threshold');

-- Baseline (the test database may already hold rows).
select tests.as_service_role();
create temporary table base on commit drop as select public.sor_ops_snapshot() as s;
grant all on base to service_role;

-- ------------------------------------------------------------ fixtures
select tests.as_owner_role();
create function tests.job(p_key text, p_state public.job_state, p_extra jsonb default '{}') returns uuid
language plpgsql set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.job_executions (job_kind, workspace_id, requested_by, idempotency_key, request_hash, state,
                                     terminal_reason, lease_owner, lease_expires_at, next_attempt_at, created_at,
                                     completed_at, last_error_code, attempt_count)
  values ('catalog_import', tests.id('b1'), tests.id('a3'), p_key, repeat('a', 64), p_state,
          (p_extra ->> 'terminal_reason')::public.terminal_reason,
          p_extra ->> 'lease_owner', (p_extra ->> 'lease_expires_at')::timestamptz,
          (p_extra ->> 'next_attempt_at')::timestamptz,
          coalesce((p_extra ->> 'created_at')::timestamptz, now()),
          (p_extra ->> 'completed_at')::timestamptz, p_extra ->> 'error', 1)
  returning id into v_id;
  return v_id;
end $$;

-- Difference between the snapshot and the baseline at a JSON path.
create function tests.d(p_path text[]) returns numeric language plpgsql set search_path = '' as $$
declare v_now numeric; v_base numeric;
begin
  execute 'select (s #>> $1)::numeric from pg_temp.snap' into v_now using p_path;
  execute 'select coalesce((s #>> $1)::numeric, 0) from pg_temp.base' into v_base using p_path;
  return v_now - v_base;
end $$;
grant execute on all functions in schema tests to service_role;

-- Running, lease expired 10 min ago (grace 5 min): stuck.
select tests.job('ops-stale-0001', 'running',
  jsonb_build_object('lease_owner', 'dead-worker', 'lease_expires_at', now() - interval '10 minutes'));
-- Running, lease expired 1 min ago: within the grace period, not stuck yet.
select tests.job('ops-fresh-0001', 'running',
  jsonb_build_object('lease_owner', 'slow-worker', 'lease_expires_at', now() - interval '1 minute'));
-- Queued 1 h ago, never picked up: stuck in the queue.
select tests.job('ops-wait-00001', 'queued', jsonb_build_object('created_at', now() - interval '1 hour'));
-- Retrying, due only in 10 min: not stuck.
select tests.job('ops-later-0001', 'retrying',
  jsonb_build_object('created_at', now() - interval '2 hours', 'next_attempt_at', now() + interval '10 minutes'));
-- Terminal outcomes in the last 24 h, and one older failure.
select tests.job('ops-dead-00001', 'dead_letter',
  jsonb_build_object('terminal_reason', 'dead_letter', 'completed_at', now() - interval '1 hour', 'error', 'UPSTREAM_TIMEOUT'));
select tests.job('ops-fail-00001', 'failed',
  jsonb_build_object('terminal_reason', 'failed', 'completed_at', now() - interval '2 hours', 'error', 'VALIDATION_ERROR'));
select tests.job('ops-budg-00001', 'partial',
  jsonb_build_object('terminal_reason', 'budget_exhausted', 'completed_at', now() - interval '3 hours'));
select tests.job('ops-done-00001', 'completed',
  jsonb_build_object('terminal_reason', 'completed', 'completed_at', now() - interval '4 hours'));
select tests.job('ops-old-000001', 'failed',
  jsonb_build_object('terminal_reason', 'failed', 'completed_at', now() - interval '3 days',
                     'created_at', now() - interval '3 days'));

insert into public.provider_usage (workspace_id, provider, model, operation, estimated_cost_usd, reported_cost_usd, outcome, created_at)
values (tests.id('b1'), 'prov-a', 'm', 'structured_output', 0.50, null, 'ok', now()),
       (tests.id('b1'), 'prov-a', 'm', 'structured_output', 0.20, 0.25, 'provider_error', now()),
       (tests.id('b2'), 'prov-b', 'm', 'structured_output', 1.00, null, 'timeout', now()),
       (tests.id('b2'), 'prov-b', 'm', 'structured_output', 0.00, null, 'budget_refused', now()),
       (tests.id('b1'), 'prov-a', 'm', 'structured_output', 3.00, null, 'ok', now() - interval '2 days');

-- ------------------------------------------------------------ snapshot
select tests.as_service_role();
create temporary table snap on commit drop as select public.sor_ops_snapshot() as s;
grant all on snap to service_role;

select is(tests.d('{stuck,stale_leases}'), 1::numeric, 'a running job whose lease expired past the grace period is stuck');
select is(tests.d('{stuck,queue_wait}'), 1::numeric, 'a due job never picked up is stuck in the queue');
select ok((select s -> 'stuck' -> 'jobs' @> jsonb_build_array(jsonb_build_object('reason', 'lease_expired', 'state', 'running'))
             from snap), 'stuck jobs are listed with their reason');
select ok(not exists (select 1 from snap, jsonb_array_elements(s -> 'stuck' -> 'jobs') e
                       where e ->> 'id' in (select id::text from public.job_executions
                                             where idempotency_key in ('ops-fresh-0001', 'ops-later-0001'))),
  'a lease within its grace period or a retry not yet due is not stuck');
select is(tests.d('{queue,running}'), 2::numeric, 'running jobs are counted');
select is(tests.d('{queue,retrying}'), 1::numeric, 'retrying jobs are counted');
select ok((select (s -> 'queue' ->> 'oldest_due_wait_seconds')::integer >= 3600 from snap),
  'the oldest due wait is reported');
select is(tests.d('{jobs_24h,finished}'), 4::numeric, 'terminal jobs of the last 24 h only');
select is(tests.d('{jobs_24h,dead_letter}'), 1::numeric, 'dead letters over 24 h');
select is(tests.d('{jobs_24h,failed}'), 1::numeric, 'failures over 24 h (an older one is excluded)');
select is(tests.d('{jobs_24h,budget_exhausted}'), 1::numeric, 'budget exhaustion over 24 h');
select ok((select s -> 'recent_failures' @> jsonb_build_array(jsonb_build_object('last_error_code', 'UPSTREAM_TIMEOUT'))
             from snap), 'recent failures carry their error code');
select ok((select s -> 'providers_1h' @> '[{"provider":"prov-a","calls":2,"errors":1},{"provider":"prov-b","calls":1,"errors":1}]'::jsonb
             from snap), 'provider calls and errors over 1 h (refused calls are not calls)');
select is(tests.d('{cost,today_usd}'), 1.75::numeric, 'cost today prefers the reported cost over the estimate');
select ok((select s -> 'cost' -> 'by_provider_today' @> '[{"provider":"prov-b","usd":1}]'::jsonb from snap),
  'cost by provider');
select ok((select jsonb_array_length(s -> 'cost' -> 'last_7_days') >= 2 from snap), 'cost per day over 7 days');
select is((select (s -> 'thresholds' ->> 'ai_cost_usd_per_day')::numeric from snap), 5::numeric,
  'thresholds come from platform_limits');

-- ------------------------------------------------------------ alert state
select is((select public.sor_ops_sync_alerts('[
    {"key":"stuck_jobs","severity":"critical","message":"1 job bloqué","details":{"count":1}},
    {"key":"provider_error_rate:prov-b","severity":"warning","message":"erreurs","details":{}}]'::jsonb) -> 'opened'),
  '["stuck_jobs", "provider_error_rate:prov-b"]'::jsonb, 'new alerts are opened');
select is((select public.sor_ops_sync_alerts('[
    {"key":"stuck_jobs","severity":"critical","message":"2 jobs bloqués","details":{"count":2}}]'::jsonb)),
  '{"open": 1, "opened": [], "resolved": ["provider_error_rate:prov-b"]}'::jsonb,
  'a held alert is refreshed, not reopened; a cleared one is resolved');
select is((select message from public.ops_alerts where alert_key = 'stuck_jobs' and resolved_at is null),
  '2 jobs bloqués', 'the open alert carries the latest message');
select is((select count(*)::integer from public.ops_alerts where alert_key = 'stuck_jobs'), 1,
  'one row per alert episode');
select is((select public.sor_ops_sync_alerts('[]'::jsonb) -> 'resolved'), '["stuck_jobs"]'::jsonb,
  'everything resolves when nothing holds');
select is((select public.sor_ops_sync_alerts('[{"key":"stuck_jobs","severity":"critical","message":"again"}]'::jsonb) -> 'opened'),
  '["stuck_jobs"]'::jsonb, 'a new episode opens a new row');
select is((select count(*)::integer from public.ops_alerts where alert_key = 'stuck_jobs'), 2,
  'history keeps the resolved episode');
select throws_ok($$select public.sor_ops_sync_alerts('[{"key":"Bad Key!","severity":"critical","message":"x"}]'::jsonb)$$,
  '23514', null, 'malformed alert keys are refused');
select throws_ok($$select public.sor_ops_sync_alerts('[{"key":"dup","severity":"warning","message":"x"},{"key":"dup","severity":"warning","message":"y"}]'::jsonb)$$,
  '22023', null, 'duplicate keys are refused');
select throws_ok($$select public.sor_ops_sync_alerts('[{"key":"cost","severity":"info","message":"x"}]'::jsonb)$$,
  '23514', null, 'unknown severities are refused');

-- ------------------------------------------------------------ workspace cost
select is((public.sor_workspace_usage(tests.id('b1'), tests.id('a4')) ->> 'ai_cost_usd_today')::numeric, 0.75::numeric,
  'a workspace sees its own AI cost of the day (other workspaces excluded)');

select * from finish();
rollback;
