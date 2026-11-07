-- Atomic agent-step start (S7.5b): a step starts only for the lease owner of
-- the current attempt, and never downgrades a row owned by a newer attempt.
begin;
select no_plan();
select tests.seed();

select ok(not has_function_privilege('authenticated', 'public.sor_step_start(uuid,text,integer,text,text,text,text,text)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.sor_step_start(uuid,text,integer,text,text,text,text,text)', 'EXECUTE'),
  'browsers cannot start agent steps');
select ok(has_function_privilege('service_role', 'public.sor_step_start(uuid,text,integer,text,text,text,text,text)', 'EXECUTE'),
  'the worker can start agent steps');

select tests.as_owner_role();
update public.saas_products set website_url = 'https://product-one.test/' where id = tests.id('d1');
select tests.as_service_role();

create temporary table sj (id uuid, step uuid) on commit drop;
grant all on sj to service_role;
insert into sj (id)
  select r.job_id from public.sor_request_job('product_enrichment', tests.id('b1'), tests.id('a3'), 'step-start-key-1',
    encode(pg_catalog.sha256(convert_to('step-start', 'UTF8')), 'hex'), jsonb_build_object('product_id', tests.id('d1'))) r;

select is((select attempt_count from public.sor_worker_claim((select id from sj), 'worker-a', 300)), 1,
  'worker A claims the job (attempt 1)');

select throws_ok($$select public.sor_step_start((select id from sj), 'worker-a', 1, '', 's', 'c1', null, 'h')$$,
  '22023', null, 'an agent key is required');
select throws_ok($$select public.sor_step_start((select id from sj), 'worker-b', 1, 'agent', 'step', 'c1', null, 'h1')$$,
  '55000', null, 'a worker that does not hold the lease cannot start a step');
select throws_ok($$select public.sor_step_start((select id from sj), 'worker-a', 2, 'agent', 'step', 'c1', null, 'h1')$$,
  '55000', null, 'the attempt must be the current one');

update sj set step = public.sor_step_start((select id from sj), 'worker-a', 1, 'agent', 'step', 'c1', 'p1', 'h1');
select is((select state || '/' || attempt || '/' || input_hash from public.agent_step_runs where id = (select step from sj)),
  'running/1/h1', 'the lease owner starts the step for its attempt');
select is(public.sor_step_start((select id from sj), 'worker-a', 1, 'agent', 'step', 'c1', 'p1', 'h2'),
  (select step from sj), 'restarting a step of the same attempt reuses its row');
select is((select count(*)::int from public.agent_step_runs where job_execution_id = (select id from sj)), 1,
  'one row per (job, agent, step)');

-- Worker A freezes past its lease; worker B recovers the job (attempt 2).
select tests.as_owner_role();
update public.job_executions set lease_expires_at = now() - interval '1 second' where id = (select id from sj);
select tests.as_service_role();
select is((select attempt_count || '/' || lease_owner from public.sor_worker_claim((select id from sj), 'worker-b', 300)),
  '2/worker-b', 'worker B recovers the job as attempt 2');
select is(public.sor_step_start((select id from sj), 'worker-b', 2, 'agent', 'step', 'c1', 'p1', 'h3'),
  (select step from sj), 'worker B restarts the step');
select throws_ok($$select public.sor_step_start((select id from sj), 'worker-a', 1, 'agent', 'step', 'c1', 'p1', 'h1')$$,
  '55000', 'LEASE_LOST: job taken over by a newer attempt', 'the frozen worker cannot take the step back');
select is((select state || '/' || attempt || '/' || input_hash from public.agent_step_runs where id = (select step from sj)),
  'running/2/h3', 'the newer attempt''s step row is untouched');

-- Defence in depth: even with the lease, a row of a newer attempt is never downgraded.
select tests.as_owner_role();
update public.agent_step_runs set attempt = 3 where id = (select step from sj);
select tests.as_service_role();
select throws_ok($$select public.sor_step_start((select id from sj), 'worker-b', 2, 'agent', 'step', 'c1', 'p1', 'h4')$$,
  '55000', 'LEASE_LOST: step owned by a newer attempt', 'a step row of a newer attempt is never reset');
select is((select attempt || '/' || input_hash from public.agent_step_runs where id = (select step from sj)),
  '3/h3', 'the row keeps its newer attempt');

-- A finished job accepts no new step.
select tests.as_owner_role();
update public.agent_step_runs set attempt = 2 where id = (select step from sj);
select tests.as_service_role();
select lives_ok($$select public.sor_worker_finish((select id from sj), 'worker-b', 'completed', 'completed', null, null)$$,
  'worker B finishes the job');
select throws_ok($$select public.sor_step_start((select id from sj), 'worker-b', 2, 'agent', 'other', 'c1', null, 'h5')$$,
  '55000', null, 'a finished job accepts no new step');

select * from finish();
rollback;
