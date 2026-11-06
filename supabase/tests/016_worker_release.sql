-- Graceful worker shutdown (Sprint 7): the lease owner releases a running
-- job; the attempt is given back and the message is visible at once.
begin;
select no_plan();
select tests.seed();

select ok(not has_function_privilege('authenticated', 'public.sor_worker_release(uuid,text,text)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.sor_worker_release(uuid,text,text)', 'EXECUTE'),
  'browsers cannot release jobs');
select ok(has_function_privilege('service_role', 'public.sor_worker_release(uuid,text,text)', 'EXECUTE'),
  'the worker can release its jobs');

select tests.as_owner_role();
update public.saas_products set website_url = 'https://product-one.test/' where id = tests.id('d1');
select tests.as_service_role();

create temporary table rj (id uuid, msg bigint) on commit drop;
grant all on rj to service_role;
insert into rj (id)
  select r.job_id from public.sor_request_job('product_enrichment', tests.id('b1'), tests.id('a3'), 'release-key-0001',
    encode(pg_catalog.sha256(convert_to('release', 'UTF8')), 'hex'), jsonb_build_object('product_id', tests.id('d1'))) r;
update rj set msg = (select queue_message_id from public.job_executions where id = rj.id);

-- Claim it (attempt 1) with a long lease and an invisible message.
select is((select attempt_count from public.sor_worker_claim((select id from rj), 'worker-a', 300)), 1,
  'the job is claimed by worker A');
select tests.as_owner_role();
select pgmq.set_vt('sor_jobs', (select msg from rj), 300);
select tests.as_service_role();

select throws_ok($$select public.sor_worker_release((select id from rj), 'worker-b', 'shutdown')$$,
  '55000', null, 'only the lease owner can release');
select lives_ok($$select public.sor_worker_release((select id from rj), 'worker-a', 'SIGTERM')$$,
  'the owner releases the job on shutdown');
select is((select state::text || '/' || attempt_count || '/' || coalesce(lease_owner, 'none') || '/' || last_error_code
             from public.job_executions where id = (select id from rj)),
  'retrying/0/none/WORKER_SHUTDOWN', 'the job is due again, its attempt given back, no lease');
select tests.as_owner_role();
-- set_vt uses clock_timestamp(); now() is frozen at the transaction start.
select ok((select vt <= clock_timestamp() from pgmq.q_sor_jobs where msg_id = (select msg from rj)),
  'its message is visible at once');
select tests.as_service_role();
select throws_ok($$select public.sor_worker_release((select id from rj), 'worker-a', 'again')$$,
  '55000', null, 'a released job cannot be released twice');

-- Another worker claims it right away, as attempt 1 again.
select is((select attempt_count || '/' || lease_owner from public.sor_worker_claim((select id from rj), 'worker-b', 60)),
  '1/worker-b', 'worker B picks the job up immediately');

select * from finish();
rollback;
