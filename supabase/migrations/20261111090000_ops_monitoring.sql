-- Sprint 7 (S7.3) — monitoring, alerts and cost tracking.
-- Source: Technical Blueprint §15 ("Alerts (Sprint 7): dead-letter count,
-- stale leases, budget exhaustion rate, provider error rate, cost per day"),
-- Implementation Blueprint §13 (telemetry, budgets, product metrics from SQL
-- over existing tables) and §15 Sprint 7.
--
-- * sor_ops_snapshot(): one read of the platform state, computed from the
--   job, provider-usage and queue tables (no new tracking infrastructure):
--   queue state, stuck jobs (lease expired and not recovered, due job never
--   picked up), terminal outcomes over 24 h, recent failures, provider errors
--   over 1 h, AI cost today / 7 days / by provider / by workspace, and the
--   alert thresholds.
-- * Alerts are evaluated by deterministic code (@sor/domain, evaluateOpsAlerts)
--   and recorded here by sor_ops_sync_alerts: one open row per alert key,
--   refreshed while it holds, resolved when it stops; the function returns
--   the transitions so the worker logs each change once.
-- Everything is server-only: no grants to browser roles.

insert into public.platform_limits(key, value, description) values
  ('ops_stale_lease_grace_seconds', '300', 'A running job whose lease expired this long ago is stuck (not recovered)'),
  ('ops_queue_wait_alert_seconds', '900', 'A due queued/retrying job not picked up for this long is stuck in the queue'),
  ('ops_alert_dead_letters_per_day', '1', 'Dead-letter jobs over 24 h that open an alert'),
  ('ops_alert_failure_rate_pct', '25', 'Failed + dead-letter share of finished jobs over 24 h (min 10 finished)'),
  ('ops_alert_budget_exhaustion_rate_pct', '20', 'budget_exhausted share of finished jobs over 24 h (min 10 finished)'),
  ('ops_alert_provider_error_rate_pct', '20', 'AI provider error share over 1 h, per provider (min 20 calls)'),
  ('ops_alert_ai_cost_usd_per_day', '5', 'AI cost per UTC day that opens an alert ([ASSUMPTION] until PD-24 fixes budgets)'),
  ('ops_alert_min_sample', '10', 'Minimum finished jobs before a 24 h rate alert can open'),
  ('ops_alert_min_provider_calls', '20', 'Minimum provider calls over 1 h before an error-rate alert can open')
on conflict (key) do nothing;

create table public.ops_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_key text not null check (alert_key ~ '^[a-z_]{3,60}(:[a-z0-9_.-]{1,60})?$'),
  severity text not null check (severity in ('warning', 'critical')),
  message text not null check (length(message) between 1 and 500),
  details jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (resolved_at is null or resolved_at >= opened_at)
);
create unique index ops_alerts_open_key on public.ops_alerts(alert_key) where resolved_at is null;
create index ops_alerts_recent_idx on public.ops_alerts(opened_at desc);
alter table public.ops_alerts enable row level security;
revoke all on table public.ops_alerts from anon, authenticated;   -- server-only, no policies

create index if not exists job_completed_idx on public.job_executions(completed_at desc) where completed_at is not null;
create index if not exists provider_usage_created_idx on public.provider_usage(created_at desc);

-- ---------------------------------------------------------------------------
-- Snapshot
-- ---------------------------------------------------------------------------
create or replace function public.sor_ops_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_day timestamptz := pg_catalog.date_trunc('day', now(), 'UTC');
  v_grace integer := private.limit_int('ops_stale_lease_grace_seconds', 300);
  v_wait integer := private.limit_int('ops_queue_wait_alert_seconds', 900);
begin
  return jsonb_build_object(
    'generated_at', v_now,
    'queue', (
      select jsonb_build_object(
        'queued', count(*) filter (where j.state = 'queued'),
        'running', count(*) filter (where j.state = 'running'),
        'retrying', count(*) filter (where j.state = 'retrying'),
        'oldest_due_wait_seconds', coalesce(floor(extract(epoch from (v_now - min(coalesce(j.next_attempt_at, j.created_at))
          filter (where j.state in ('queued', 'retrying') and coalesce(j.next_attempt_at, j.created_at) <= v_now))))::integer, 0),
        'messages', (select count(*) from pgmq.q_sor_jobs))
        from public.job_executions j where j.state in ('queued', 'running', 'retrying')),
    'stuck', (
      with s as (
        select j.id, j.job_kind, j.workspace_id, j.state, j.attempt_count,
               case when j.state = 'running' then 'lease_expired' else 'queue_wait' end as reason,
               case when j.state = 'running' then j.lease_expires_at
                    else coalesce(j.next_attempt_at, j.created_at) end as since
          from public.job_executions j
         where (j.state = 'running' and j.lease_expires_at < v_now - make_interval(secs => v_grace))
            or (j.state in ('queued', 'retrying')
                and coalesce(j.next_attempt_at, j.created_at) < v_now - make_interval(secs => v_wait)))
      select jsonb_build_object(
        'stale_leases', (select count(*) from s where s.reason = 'lease_expired'),
        'queue_wait', (select count(*) from s where s.reason = 'queue_wait'),
        'jobs', coalesce((select jsonb_agg(to_jsonb(x) order by x.since) from (
          select s.id, s.job_kind, s.workspace_id, s.state, s.attempt_count, s.reason, s.since
            from s order by s.since limit 20) x), '[]'::jsonb))),
    'jobs_24h', (
      select jsonb_build_object(
        'finished', count(*),
        'completed', count(*) filter (where j.state = 'completed'),
        'partial', count(*) filter (where j.state = 'partial'),
        'failed', count(*) filter (where j.state = 'failed'),
        'cancelled', count(*) filter (where j.state = 'cancelled'),
        'dead_letter', count(*) filter (where j.state = 'dead_letter'),
        'budget_exhausted', count(*) filter (where j.terminal_reason = 'budget_exhausted'))
        from public.job_executions j
       where j.completed_at >= v_now - interval '24 hours'),
    'recent_failures', coalesce((select jsonb_agg(to_jsonb(x) order by x.completed_at desc) from (
      select j.id, j.job_kind, j.workspace_id, j.state, j.terminal_reason, j.attempt_count,
             j.last_error_code, j.completed_at
        from public.job_executions j
       where j.state in ('failed', 'dead_letter') and j.completed_at >= v_now - interval '24 hours'
       order by j.completed_at desc limit 20) x), '[]'::jsonb),
    'providers_1h', coalesce((select jsonb_agg(to_jsonb(x) order by x.provider) from (
      select u.provider,
             count(*) filter (where u.outcome <> 'budget_refused') as calls,
             count(*) filter (where u.outcome in ('schema_invalid', 'timeout', 'provider_error')) as errors
        from public.provider_usage u
       where u.created_at >= v_now - interval '1 hour'
       group by u.provider) x), '[]'::jsonb),
    'cost', jsonb_build_object(
      'today_usd', (select coalesce(sum(coalesce(u.reported_cost_usd, u.estimated_cost_usd)), 0)::float8
                      from public.provider_usage u where u.created_at >= v_day),
      'last_7_days', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'usd', d.usd) order by d.day) from (
        select (pg_catalog.date_trunc('day', u.created_at, 'UTC') at time zone 'UTC')::date as day,
               sum(coalesce(u.reported_cost_usd, u.estimated_cost_usd))::float8 as usd
          from public.provider_usage u
         where u.created_at >= v_day - interval '6 days'
         group by 1) d), '[]'::jsonb),
      'by_provider_today', coalesce((select jsonb_agg(jsonb_build_object('provider', p.provider, 'usd', p.usd) order by p.usd desc) from (
        select u.provider, coalesce(sum(coalesce(u.reported_cost_usd, u.estimated_cost_usd)), 0)::float8 as usd
          from public.provider_usage u where u.created_at >= v_day group by u.provider) p), '[]'::jsonb),
      'top_workspaces_today', coalesce((select jsonb_agg(jsonb_build_object('workspace_id', w.workspace_id, 'usd', w.usd) order by w.usd desc) from (
        select u.workspace_id, coalesce(sum(coalesce(u.reported_cost_usd, u.estimated_cost_usd)), 0)::float8 as usd
          from public.provider_usage u
         where u.created_at >= v_day and u.workspace_id is not null
         group by u.workspace_id order by 2 desc limit 5) w), '[]'::jsonb)),
    'thresholds', jsonb_build_object(
      'stale_lease_grace_seconds', v_grace,
      'queue_wait_alert_seconds', v_wait,
      'dead_letters_per_day', private.limit_int('ops_alert_dead_letters_per_day', 1),
      'failure_rate_pct', private.limit_int('ops_alert_failure_rate_pct', 25),
      'budget_exhaustion_rate_pct', private.limit_int('ops_alert_budget_exhaustion_rate_pct', 20),
      'provider_error_rate_pct', private.limit_int('ops_alert_provider_error_rate_pct', 20),
      'ai_cost_usd_per_day', coalesce((select (l.value #>> '{}')::float8 from public.platform_limits l
                                        where l.key = 'ops_alert_ai_cost_usd_per_day'), 5),
      'min_sample', private.limit_int('ops_alert_min_sample', 10),
      'min_provider_calls', private.limit_int('ops_alert_min_provider_calls', 20)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Alert state: open / refresh / resolve, returns the transitions
-- ---------------------------------------------------------------------------
create or replace function public.sor_ops_sync_alerts(p_alerts jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alert jsonb;
  v_key text;
  v_keys text[] := '{}';
  v_opened text[] := '{}';
  v_resolved text[];
begin
  if jsonb_typeof(p_alerts) <> 'array' or jsonb_array_length(p_alerts) > 100 then
    raise exception 'VALIDATION_ERROR: alerts' using errcode = '22023';
  end if;
  -- Several workers may sync at the same time: one at a time.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sor_ops_alerts', 0));

  for v_alert in select * from jsonb_array_elements(p_alerts) loop
    v_key := v_alert ->> 'key';
    if v_key is null or v_key = any(v_keys) then
      raise exception 'VALIDATION_ERROR: alert key' using errcode = '22023';
    end if;
    v_keys := v_keys || v_key;
    update public.ops_alerts a
       set severity = v_alert ->> 'severity', message = v_alert ->> 'message',
           details = coalesce(v_alert -> 'details', '{}'::jsonb), last_seen_at = now()
     where a.alert_key = v_key and a.resolved_at is null;
    if not found then
      insert into public.ops_alerts (alert_key, severity, message, details)
      values (v_key, v_alert ->> 'severity', v_alert ->> 'message', coalesce(v_alert -> 'details', '{}'::jsonb));
      v_opened := v_opened || v_key;
    end if;
  end loop;

  with r as (
    update public.ops_alerts a set resolved_at = now()
     where a.resolved_at is null and not (a.alert_key = any(v_keys))
    returning a.alert_key)
  select coalesce(array_agg(r.alert_key order by r.alert_key), '{}') into v_resolved from r;

  return jsonb_build_object(
    'opened', to_jsonb(v_opened),
    'resolved', to_jsonb(v_resolved),
    'open', (select count(*) from public.ops_alerts a where a.resolved_at is null));
end;
$$;

-- ---------------------------------------------------------------------------
-- Workspace usage (S7.2) + today's AI cost for the workspace (PRD §14.2/14.3)
-- ---------------------------------------------------------------------------
create or replace function public.sor_workspace_usage(p_workspace_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hour timestamptz := pg_catalog.date_bin(interval '1 hour', now(), timestamptz '2000-01-01 00:00:00+00');
begin
  if not exists (select 1 from public.workspace_members m
                  where m.workspace_id = p_workspace_id and m.user_id = p_user_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'active_jobs', (select count(*) from public.job_executions j
                     where j.workspace_id = p_workspace_id and j.state in ('queued', 'running', 'retrying')),
    'max_concurrent_jobs', private.limit_int('max_concurrent_jobs_per_workspace', 3),
    'jobs_today', (select count(*) from public.job_executions j
                    where j.workspace_id = p_workspace_id and j.created_at >= private.utc_day_start()),
    'max_jobs_per_day', private.limit_int('workspace_max_jobs_per_day', 200),
    'day_resets_at', private.utc_day_start() + interval '1 day',
    'my_job_requests_this_hour', coalesce((select c.request_count from public.rate_limit_counters c
                                            where c.bucket_key = 'job_post:' || p_user_id::text
                                              and c.window_start = v_hour), 0),
    'max_job_requests_per_hour', private.limit_int('api_rate_limit_job_posts_per_hour', 30),
    'hour_resets_at', v_hour + interval '1 hour',
    'ai_cost_usd_today', (select coalesce(sum(coalesce(u.reported_cost_usd, u.estimated_cost_usd)), 0)::float8
                            from public.provider_usage u
                           where u.workspace_id = p_workspace_id and u.created_at >= private.utc_day_start()));
end;
$$;

revoke all on function public.sor_ops_snapshot() from public, anon, authenticated;
revoke all on function public.sor_ops_sync_alerts(jsonb) from public, anon, authenticated;
revoke all on function public.sor_workspace_usage(uuid, uuid) from public, anon, authenticated;
grant execute on function public.sor_ops_snapshot() to service_role;
grant execute on function public.sor_ops_sync_alerts(jsonb) to service_role;
grant execute on function public.sor_workspace_usage(uuid, uuid) to service_role;
