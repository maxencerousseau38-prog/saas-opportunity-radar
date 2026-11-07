-- Sprint 7 (S7.5b) — atomic agent-step start (closes the S7.5a window).
--
-- S7.5a made step completion and failure conditional on the attempt, and
-- checked the attempt before a step starts. Between that check and the
-- unconditional upsert of the step row, a worker that froze past its lease
-- could still reset the row of a newer attempt (its `attempt` and `state`).
-- This function does the check and the write in one transaction, with the
-- job row locked (the same row a reclaim updates): the step starts only if
-- the caller still holds the lease for this attempt, and never downgrades a
-- row owned by a newer attempt. Otherwise: LEASE_LOST (55000), handled by
-- the worker as a lost lease.

create or replace function public.sor_step_start(
  p_job_id uuid, p_worker_id text, p_attempt integer, p_agent_key text, p_step_key text,
  p_contract_version text, p_prompt_version text, p_input_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job record;
  v_id uuid;
begin
  if p_job_id is null or p_worker_id is null or p_attempt is null
     or coalesce(p_agent_key, '') = '' or coalesce(p_step_key, '') = '' or coalesce(p_contract_version, '') = '' then
    raise exception 'VALIDATION_ERROR: step start' using errcode = '22023';
  end if;

  select j.state, j.lease_owner, j.attempt_count into v_job
    from public.job_executions j where j.id = p_job_id
    for update;
  if not found or v_job.state <> 'running' or v_job.lease_owner is distinct from p_worker_id
     or v_job.attempt_count <> p_attempt then
    raise exception 'LEASE_LOST: job taken over by a newer attempt' using errcode = '55000';
  end if;

  insert into public.agent_step_runs as s
    (job_execution_id, agent_key, step_key, contract_version, prompt_version, input_hash,
     state, attempt, started_at)
  values
    (p_job_id, p_agent_key, p_step_key, p_contract_version, p_prompt_version, p_input_hash,
     'running', p_attempt, now())
  on conflict (job_execution_id, agent_key, step_key) do update
     set contract_version = excluded.contract_version,
         prompt_version = excluded.prompt_version,
         input_hash = excluded.input_hash,
         state = 'running',
         attempt = excluded.attempt,
         started_at = excluded.started_at,
         completed_at = null,
         error_code = null,
         error_message = null
   where s.attempt <= excluded.attempt
  returning s.id into v_id;

  if v_id is null then
    raise exception 'LEASE_LOST: step owned by a newer attempt' using errcode = '55000';
  end if;
  return v_id;
end;
$$;

revoke all on function public.sor_step_start(uuid, text, integer, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.sor_step_start(uuid, text, integer, text, text, text, text, text)
  to service_role;
