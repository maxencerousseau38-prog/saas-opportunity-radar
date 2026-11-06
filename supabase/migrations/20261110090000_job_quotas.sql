-- Sprint 7 (S7.2) — job quotas and rate limits.
-- Source: docs/IMPLEMENTATION_BLUEPRINT.md §10 ("Rate limits: fixed-window
-- counters in rate_limit_counters keyed by user and route class; job-creating
-- POSTs limited by api_rate_limit_job_posts_per_hour"), §13 (budgets) and §15
-- Sprint 7 ("quotas"); CLAUDE.md §11 (per-workspace quotas).
--
-- Every job-creating request goes through private.create_job, so the limits
-- are enforced there, in the same transaction as the job row and the queue
-- message:
--   * concurrency per workspace (M5, unchanged): LIMIT_EXCEEDED;
--   * jobs per workspace per UTC day (new): LIMIT_EXCEEDED;
--   * job-creating requests per user per hour (M4 limit, enforced now):
--     RATE_LIMITED.
-- An idempotent replay returns the existing job and consumes nothing; a
-- refused request rolls back with its job row and its counter increment.
-- A per-workspace advisory lock serialises the checks, so concurrent requests
-- cannot overshoot a limit.

insert into public.platform_limits(key, value, description) values
  ('workspace_max_jobs_per_day', '200', 'Jobs a workspace may create per UTC day (S7.2 default, [ASSUMPTION] to tune on staging)')
on conflict (key) do nothing;

-- Fixed-window counter. Raises RATE_LIMITED with the seconds left in the
-- window; old windows of the same bucket are purged on the way.
create or replace function private.consume_rate_limit(p_bucket text, p_limit integer, p_window interval)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_start timestamptz := pg_catalog.date_bin(p_window, now(), timestamptz '2000-01-01 00:00:00+00');
  v_count integer;
begin
  insert into public.rate_limit_counters (bucket_key, window_start, request_count)
  values (p_bucket, v_start, 1)
  on conflict (bucket_key, window_start)
    do update set request_count = public.rate_limit_counters.request_count + 1
  returning request_count into v_count;
  if v_count > p_limit then
    raise exception 'RATE_LIMITED: job posts retry_after=%',
      greatest(1, ceil(extract(epoch from (v_start + p_window - clock_timestamp())))::integer)
      using errcode = '54000';
  end if;
  delete from public.rate_limit_counters c where c.bucket_key = p_bucket and c.window_start < v_start;
  return v_count;
end;
$$;

create or replace function private.utc_day_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select pg_catalog.date_trunc('day', now(), 'UTC')
$$;

-- M5 job creation, with the S7.2 quotas. Signature and behaviour otherwise
-- unchanged (callers: sor_request_job and the domain request/retry RPCs).
create or replace function private.create_job(
  p_kind public.job_kind, p_workspace_id uuid, p_requested_by uuid,
  p_idempotency_key text, p_request_hash text, p_payload jsonb)
returns table (job_id uuid, created boolean)
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_existing public.job_executions;
  v_active integer;
  v_today integer;
begin
  insert into public.job_executions (job_kind, workspace_id, requested_by, idempotency_key, request_hash,
                                     payload, max_attempts)
  values (p_kind, p_workspace_id, p_requested_by, p_idempotency_key, p_request_hash, coalesce(p_payload, '{}'),
          private.limit_int('job_max_attempts', 5))
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    select * into v_existing from public.job_executions j
     where j.job_kind = p_kind and j.idempotency_key = p_idempotency_key
       and ((p_workspace_id is null and j.workspace_id is null)
            or (j.workspace_id = p_workspace_id and j.requested_by is not distinct from p_requested_by));
    if v_existing.id is null then
      raise exception 'INVALID_STATE: idempotency race' using errcode = '55000';
    end if;
    if v_existing.request_hash <> p_request_hash then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return query select v_existing.id, false;
    return;
  end if;

  if p_workspace_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sor_jobs:' || p_workspace_id::text, 0));
    select count(*) into v_active from public.job_executions j
     where j.workspace_id = p_workspace_id and j.state in ('queued', 'running', 'retrying') and j.id <> v_id;
    if v_active >= private.limit_int('max_concurrent_jobs_per_workspace', 3) then
      raise exception 'LIMIT_EXCEEDED: concurrent jobs' using errcode = '54000';
    end if;
    select count(*) into v_today from public.job_executions j
     where j.workspace_id = p_workspace_id and j.created_at >= private.utc_day_start() and j.id <> v_id;
    if v_today >= private.limit_int('workspace_max_jobs_per_day', 200) then
      raise exception 'LIMIT_EXCEEDED: daily jobs retry_after=%',
        greatest(1, ceil(extract(epoch from (private.utc_day_start() + interval '1 day' - clock_timestamp())))::integer)
        using errcode = '54000';
    end if;
  end if;

  if p_requested_by is not null then
    perform private.consume_rate_limit('job_post:' || p_requested_by::text,
      private.limit_int('api_rate_limit_job_posts_per_hour', 30), interval '1 hour');
  end if;

  perform private.send_job_message(v_id, p_kind);
  return query select v_id, true;
end;
$$;

-- Usage shown in Settings (PRD §14.3 "État des quotas"). Service role only;
-- the API checks membership first and the function checks it again.
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
    'hour_resets_at', v_hour + interval '1 hour');
end;
$$;

revoke all on function private.consume_rate_limit(text, integer, interval) from public, anon, authenticated;
revoke all on function private.utc_day_start() from public, anon, authenticated;
revoke all on function private.create_job(public.job_kind, uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.sor_workspace_usage(uuid, uuid) from public, anon, authenticated;
grant execute on function public.sor_workspace_usage(uuid, uuid) to service_role;
