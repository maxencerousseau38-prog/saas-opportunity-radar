-- Sprint 7 — graceful worker shutdown (Implementation Blueprint §11 "Worker
-- loop"; PD-27: Render sends SIGTERM before stopping the worker).
--
-- A job interrupted by a planned shutdown is not a failure: the worker
-- releases its lease so another worker (or the restarted one) picks it up at
-- once, instead of waiting for the lease and the message visibility to
-- expire. The attempt consumed by the claim is given back; completed agent
-- steps are reused by the next attempt (step input hashes), so no work is
-- repeated. Only the lease owner can release, only while running.
create or replace function public.sor_worker_release(p_job_id uuid, p_worker_id text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_msg bigint;
begin
  update public.job_executions
     set state = 'retrying', next_attempt_at = now(),
         attempt_count = greatest(attempt_count - 1, 0),
         lease_owner = null, lease_expires_at = null,
         last_error_code = 'WORKER_SHUTDOWN',
         last_error_message = left(coalesce(p_reason, 'worker shutdown'), 500)
   where id = p_job_id and state = 'running' and lease_owner = p_worker_id
  returning queue_message_id into v_msg;
  if not found then
    raise exception 'LEASE_LOST' using errcode = '55000';
  end if;
  if v_msg is not null then
    perform pgmq.set_vt('sor_jobs', v_msg, 0);
  end if;
end;
$$;

revoke all on function public.sor_worker_release(uuid, text, text) from public, anon, authenticated;
grant execute on function public.sor_worker_release(uuid, text, text) to service_role;
