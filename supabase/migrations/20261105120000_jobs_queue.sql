-- M5 — jobs, agent steps, provider usage, queue (Implementation Blueprint §3 M5, §11; ADR-004).
-- PGMQ verification gate passed on 4 November 2026 (Supabase CLI 3.0.0 local
-- stack): pgmq 1.5.1; pgmq.create(text), send(text, jsonb[, integer]),
-- read(text, integer, integer[, jsonb]), set_vt(text, bigint, integer),
-- archive(text, bigint) and delete(text, bigint) as used below.

create extension if not exists pgmq;

-- Queue functions and tables are never reachable from browser roles.
revoke all on schema pgmq from public, anon, authenticated;
revoke all on all tables in schema pgmq from public, anon, authenticated;
revoke all on all functions in schema pgmq from public, anon, authenticated;

select pgmq.create('sor_jobs');

create type public.job_kind as enum (
  'product_enrichment','product_refresh','source_sync','catalog_import',
  'feedback_import','discovery_run','pain_point_run','opportunity_analysis',
  'report_export','data_export'
);
create type public.job_state as enum (
  'queued','running','retrying','completed','partial','failed','cancelled','dead_letter'
);
create type public.terminal_reason as enum (
  'completed','partial','failed','cancelled','dead_letter','budget_exhausted'
);
create type public.run_status as enum (
  'queued','running','completed','partial','failed','cancelled','needs_review'
);

create table public.job_executions (
  id uuid primary key default gen_random_uuid(),
  job_kind public.job_kind not null,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  request_hash text not null check (length(request_hash) = 64),
  payload jsonb not null default '{}'::jsonb,
  state public.job_state not null default 'queued',
  terminal_reason public.terminal_reason,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  queue_message_id bigint,
  lease_owner text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  next_attempt_at timestamptz,
  cancel_requested_at timestamptz,
  budget jsonb not null default '{}'::jsonb,
  usage jsonb not null default '{}'::jsonb,
  -- Sprint 3 addition: per-job outcome shown to users (import row results,
  -- enrichment summary). Never contains secrets or raw source text.
  result jsonb not null default '{}'::jsonb,
  last_error_code text,
  last_error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((state in ('completed','partial','failed','cancelled','dead_letter')) = (terminal_reason is not null)),
  check (state <> 'running' or (lease_owner is not null and lease_expires_at is not null))
);
create unique index job_idempotency_ws on public.job_executions(workspace_id, requested_by, job_kind, idempotency_key)
  where workspace_id is not null;
create unique index job_idempotency_system on public.job_executions(job_kind, idempotency_key)
  where workspace_id is null;
create index job_state_idx on public.job_executions(state, next_attempt_at);
create index job_lease_idx on public.job_executions(lease_expires_at) where state = 'running';
create index job_workspace_idx on public.job_executions(workspace_id, created_at desc);
create index job_product_idx on public.job_executions((payload ->> 'product_id'), created_at desc)
  where job_kind = 'product_enrichment';

create table public.agent_step_runs (
  id uuid primary key default gen_random_uuid(),
  job_execution_id uuid not null references public.job_executions(id) on delete cascade,
  agent_key text not null,
  step_key text not null,
  contract_version text not null,
  prompt_version text,
  state text not null default 'queued'
    check (state in ('queued','running','completed','failed','skipped')),
  attempt integer not null default 1,
  input_hash text,
  output_json jsonb,
  output_hash text,
  warnings jsonb not null default '[]'::jsonb,
  evidence_ids uuid[] not null default '{}',
  provider text,
  model text,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(12,6),
  latency_ms integer,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (job_execution_id, agent_key, step_key),
  check (state <> 'completed' or output_json is not null)
);

alter table public.evidence_items
  add constraint evidence_extracted_by_step_fk
  foreign key (extracted_by_step_id) references public.agent_step_runs(id) on delete set null;
create index evidence_step_idx on public.evidence_items(extracted_by_step_id) where extracted_by_step_id is not null;

create table public.provider_usage (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  job_execution_id uuid references public.job_executions(id) on delete set null,
  agent_step_run_id uuid references public.agent_step_runs(id) on delete set null,
  provider text not null,
  model text not null,
  operation text not null check (operation in ('structured_output','embedding','repair')),
  input_tokens integer,
  output_tokens integer,
  estimated_cost_usd numeric(12,6),
  reported_cost_usd numeric(12,6),
  latency_ms integer,
  outcome text not null check (outcome in ('ok','schema_invalid','timeout','provider_error','budget_refused')),
  created_at timestamptz not null default now()
);

create index agent_step_job_idx on public.agent_step_runs(job_execution_id);
create index provider_usage_workspace_idx on public.provider_usage(workspace_id, created_at desc);
create index provider_usage_job_idx on public.provider_usage(job_execution_id);

do $$
declare t text;
begin
  foreach t in array array['job_executions','agent_step_runs','provider_usage'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;
-- Server-only: no grants to anon/authenticated and no policies.

-- Limits used by the job system and the Sprint 3 pipeline. AI budgets stay
-- at zero until PD-24 fixes them: only the fake provider (no cost) can run.
insert into public.platform_limits(key, value, description) values
  ('enrichment_max_pages', '5', 'Official-website pages fetched per enrichment job'),
  ('enrichment_max_seconds', '600', 'Wall-clock budget of an enrichment job'),
  ('import_max_rows', '1000', 'Rows per CSV import'),
  ('ai_max_cost_usd_per_job', '0', 'PD-24 pending: 0 until the benchmark fixes AI budgets (fake provider only)'),
  ('evidence_max_age_days', '365', 'Freshness window used by the verifier before a claim is stale')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.limit_int(p_key text, p_default integer)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce((select (l.value #>> '{}')::integer from public.platform_limits l where l.key = p_key), p_default)
$$;

create or replace function private.send_job_message(p_job_id uuid, p_kind public.job_kind, p_delay integer default 0)
returns bigint
language plpgsql
set search_path = ''
as $$
declare v_msg bigint;
begin
  select s into v_msg from pgmq.send('sor_jobs',
    jsonb_build_object('schema_version', 'job.v1', 'kind', p_kind, 'job_execution_id', p_job_id),
    greatest(p_delay, 0)) as s;
  update public.job_executions set queue_message_id = v_msg where id = p_job_id;
  return v_msg;
end;
$$;

create or replace function private.archive_job_message(p_message_id bigint)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_message_id is not null then
    perform pgmq.archive('sor_jobs', p_message_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Job creation (one transaction: job row + queue message)
-- ---------------------------------------------------------------------------
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
    select count(*) into v_active from public.job_executions j
     where j.workspace_id = p_workspace_id and j.state in ('queued', 'running', 'retrying') and j.id <> v_id;
    if v_active >= private.limit_int('max_concurrent_jobs_per_workspace', 3) then
      raise exception 'LIMIT_EXCEEDED: concurrent jobs' using errcode = '54000';
    end if;
  end if;

  perform private.send_job_message(v_id, p_kind);
  return query select v_id, true;
end;
$$;

-- Generic request RPC for job kinds without a domain row (§3 M5 table).
create or replace function public.sor_request_job(
  p_kind public.job_kind, p_workspace_id uuid, p_requested_by uuid,
  p_idempotency_key text, p_request_hash text, p_payload jsonb)
returns table (job_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.saas_products;
  v_rows integer;
begin
  if p_kind not in ('product_enrichment', 'catalog_import', 'feedback_import') then
    raise exception 'VALIDATION_ERROR: job kind not available' using errcode = '22023';
  end if;
  if not exists (select 1 from public.workspace_members m
                  where m.workspace_id = p_workspace_id and m.user_id = p_requested_by
                    and m.role in ('owner', 'admin', 'member')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'VALIDATION_ERROR: request hash' using errcode = '22023';
  end if;

  if p_kind = 'product_enrichment' then
    if (p_payload ->> 'product_id') is null
       or (p_payload - 'product_id') <> '{}'::jsonb then
      raise exception 'VALIDATION_ERROR: payload' using errcode = '22023';
    end if;
    select * into v_product from public.saas_products p where p.id = (p_payload ->> 'product_id')::uuid;
    if v_product.id is null or v_product.record_status <> 'active' then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_product.exclusion_status <> 'eligible' then
      raise exception 'EXCLUDED_SUBJECT: product is not eligible' using errcode = '23514';
    end if;
    if v_product.website_url is null then
      raise exception 'VALIDATION_ERROR: product has no official URL' using errcode = '22023';
    end if;
  else
    -- Imports carry the raw CSV; the worker parses and validates every row.
    v_rows := (p_payload ->> 'row_count')::integer;
    if coalesce(jsonb_typeof(p_payload -> 'csv'), '') <> 'string' or length(p_payload ->> 'csv') > 2000000
       or v_rows is null or v_rows < 1 or v_rows > private.limit_int('import_max_rows', 1000) then
      raise exception 'VALIDATION_ERROR: csv' using errcode = '22023';
    end if;
    if p_kind = 'feedback_import' and coalesce(jsonb_typeof(p_payload -> 'rights_declaration'), '') <> 'object' then
      raise exception 'VALIDATION_ERROR: rights declaration' using errcode = '22023';
    end if;
  end if;

  return query select * from private.create_job(p_kind, p_workspace_id, p_requested_by,
                                                 p_idempotency_key, p_request_hash, p_payload);
end;
$$;

-- Cooperative cancellation (member+ of the job's workspace).
create or replace function public.sor_cancel_job(p_job_id uuid, p_workspace_id uuid, p_actor uuid)
returns public.job_state
language plpgsql
security definer
set search_path = ''
as $$
declare v_job public.job_executions;
begin
  if not exists (select 1 from public.workspace_members m
                  where m.workspace_id = p_workspace_id and m.user_id = p_actor
                    and m.role in ('owner', 'admin', 'member')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_job from public.job_executions j
   where j.id = p_job_id and j.workspace_id = p_workspace_id for update;
  if v_job.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_job.state in ('completed', 'partial', 'failed', 'cancelled', 'dead_letter') then
    raise exception 'INVALID_STATE: job already finished' using errcode = '55000';
  end if;
  if v_job.state in ('queued', 'retrying') then
    update public.job_executions
       set state = 'cancelled', terminal_reason = 'cancelled', cancel_requested_at = now(),
           completed_at = now(), lease_owner = null, lease_expires_at = null
     where id = p_job_id;
    perform private.archive_job_message(v_job.queue_message_id);
    return 'cancelled';
  end if;
  update public.job_executions set cancel_requested_at = coalesce(cancel_requested_at, now()) where id = p_job_id;
  return v_job.state;
end;
$$;

-- ---------------------------------------------------------------------------
-- Worker RPCs (service_role only)
-- ---------------------------------------------------------------------------
create or replace function public.sor_worker_read(p_qty integer, p_vt_seconds integer)
returns table (msg_id bigint, read_ct integer, message jsonb)
language sql
security definer
set search_path = ''
as $$
  select r.msg_id, r.read_ct, r.message
    from pgmq.read('sor_jobs', greatest(p_vt_seconds, 1), least(greatest(p_qty, 1), 50)) r
$$;

create or replace function public.sor_worker_claim(p_job_id uuid, p_worker_id text, p_lease_seconds integer)
returns setof public.job_executions
language plpgsql
security definer
set search_path = ''
as $$
declare v_job public.job_executions;
begin
  if coalesce(p_worker_id, '') = '' or p_lease_seconds < 1 then
    raise exception 'VALIDATION_ERROR: worker' using errcode = '22023';
  end if;
  select * into v_job from public.job_executions j where j.id = p_job_id for update skip locked;
  if v_job.id is null then
    return;   -- unknown job, or another worker holds the row right now
  end if;
  if v_job.state in ('completed', 'partial', 'failed', 'cancelled', 'dead_letter') then
    -- A redelivered message for a finished job: archive it, do nothing else.
    perform private.archive_job_message(v_job.queue_message_id);
    return;
  end if;
  if v_job.state in ('queued', 'retrying') and v_job.next_attempt_at is not null and v_job.next_attempt_at > now() then
    return;   -- not yet due
  end if;
  if v_job.state = 'running' and v_job.lease_expires_at > now() then
    return;   -- leased elsewhere
  end if;
  if v_job.cancel_requested_at is not null then
    update public.job_executions
       set state = 'cancelled', terminal_reason = 'cancelled', completed_at = now(),
           lease_owner = null, lease_expires_at = null
     where id = v_job.id;
    perform private.archive_job_message(v_job.queue_message_id);
    return;
  end if;
  if v_job.attempt_count + 1 > v_job.max_attempts then
    update public.job_executions
       set state = 'dead_letter', terminal_reason = 'dead_letter', completed_at = now(),
           lease_owner = null, lease_expires_at = null,
           last_error_code = coalesce(last_error_code, 'MAX_ATTEMPTS')
     where id = v_job.id;
    perform private.archive_job_message(v_job.queue_message_id);
    return;
  end if;
  return query
    update public.job_executions
       set state = 'running', attempt_count = attempt_count + 1, lease_owner = p_worker_id,
           lease_expires_at = now() + make_interval(secs => p_lease_seconds), heartbeat_at = now(),
           next_attempt_at = null, started_at = coalesce(started_at, now())
     where id = v_job.id
    returning *;
end;
$$;

-- Extends the lease and the message visibility; returns true when a
-- cancellation was requested. Raises LEASE_LOST if the lease is not ours.
create or replace function public.sor_worker_heartbeat(
  p_job_id uuid, p_worker_id text, p_lease_seconds integer, p_message_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_cancel timestamptz;
begin
  update public.job_executions
     set lease_expires_at = now() + make_interval(secs => p_lease_seconds), heartbeat_at = now()
   where id = p_job_id and state = 'running' and lease_owner = p_worker_id
  returning cancel_requested_at into v_cancel;
  if not found then
    raise exception 'LEASE_LOST' using errcode = '55000';
  end if;
  if p_message_id is not null then
    perform pgmq.set_vt('sor_jobs', p_message_id, p_lease_seconds);
  end if;
  return v_cancel is not null;
end;
$$;

create or replace function public.sor_worker_retry(
  p_job_id uuid, p_worker_id text, p_delay_seconds integer, p_error_code text, p_error_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_msg bigint;
begin
  update public.job_executions
     set state = 'retrying', next_attempt_at = now() + make_interval(secs => greatest(p_delay_seconds, 0)),
         lease_owner = null, lease_expires_at = null,
         last_error_code = left(p_error_code, 100), last_error_message = left(p_error_message, 500)
   where id = p_job_id and state = 'running' and lease_owner = p_worker_id
  returning queue_message_id into v_msg;
  if not found then
    raise exception 'LEASE_LOST' using errcode = '55000';
  end if;
  if v_msg is not null then
    perform pgmq.set_vt('sor_jobs', v_msg, greatest(p_delay_seconds, 0));
  end if;
end;
$$;

create or replace function public.sor_worker_finish(
  p_job_id uuid, p_worker_id text, p_state public.job_state, p_terminal_reason public.terminal_reason,
  p_error_code text, p_error_message text, p_result jsonb default null, p_usage jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_msg bigint;
begin
  if p_state not in ('completed', 'partial', 'failed', 'cancelled', 'dead_letter') or p_terminal_reason is null then
    raise exception 'VALIDATION_ERROR: terminal state' using errcode = '22023';
  end if;
  update public.job_executions
     set state = p_state, terminal_reason = p_terminal_reason, completed_at = now(),
         lease_owner = null, lease_expires_at = null,
         last_error_code = coalesce(left(p_error_code, 100), last_error_code),
         last_error_message = coalesce(left(p_error_message, 500), last_error_message),
         result = coalesce(p_result, result), usage = coalesce(p_usage, usage)
   where id = p_job_id and state = 'running' and lease_owner = p_worker_id
  returning queue_message_id into v_msg;
  if not found then
    raise exception 'LEASE_LOST' using errcode = '55000';
  end if;
  perform private.archive_job_message(v_msg);
end;
$$;

-- Outbox safety net: re-sends a message for due jobs whose message is gone.
create or replace function public.sor_worker_requeue_orphans(p_older_than_seconds integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job record;
  v_count integer := 0;
begin
  for v_job in
    select j.id, j.job_kind from public.job_executions j
     where j.state in ('queued', 'retrying')
       and j.created_at < now() - make_interval(secs => greatest(p_older_than_seconds, 0))
       and (j.queue_message_id is null
            or not exists (select 1 from pgmq.q_sor_jobs q where q.msg_id = j.queue_message_id))
     for update skip locked
  loop
    perform private.send_job_message(v_job.id, v_job.job_kind);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- A message whose envelope fails JobEnvelopeSchema: archived, audited, never retried.
create or replace function public.sor_worker_finish_poison(p_message_id bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pgmq.archive('sor_jobs', p_message_id);
  insert into public.audit_logs (actor_kind, action, resource_type, metadata)
    values ('worker', 'queue.poison_message', 'queue_message',
            jsonb_build_object('message_id', p_message_id, 'reason', left(coalesce(p_reason, ''), 300)));
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.sor_request_job(public.job_kind, uuid, uuid, text, text, jsonb)',
    'public.sor_cancel_job(uuid, uuid, uuid)',
    'public.sor_worker_read(integer, integer)',
    'public.sor_worker_claim(uuid, text, integer)',
    'public.sor_worker_heartbeat(uuid, text, integer, bigint)',
    'public.sor_worker_retry(uuid, text, integer, text, text)',
    'public.sor_worker_finish(uuid, text, public.job_state, public.terminal_reason, text, text, jsonb, jsonb)',
    'public.sor_worker_requeue_orphans(integer)',
    'public.sor_worker_finish_poison(bigint, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array[
    'private.limit_int(text, integer)',
    'private.send_job_message(uuid, public.job_kind, integer)',
    'private.archive_job_message(bigint)',
    'private.create_job(public.job_kind, uuid, uuid, text, text, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
