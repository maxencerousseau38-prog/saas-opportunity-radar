-- Job system (Implementation Blueprint §3 M5, §11; ADR-004): server-only
-- tables, atomic creation with idempotency, leases, retries, cancellation,
-- dead letter, poison messages and orphan recovery.
begin;
select no_plan();
select tests.seed();

create function tests.req(p_user uuid, p_key text, p_payload jsonb,
                          p_kind public.job_kind default 'product_enrichment', p_hash text default null)
returns uuid language sql set search_path = '' as $$
  select r.job_id from public.sor_request_job(p_kind, tests.id('b1'), p_user, p_key,
    coalesce(p_hash, encode(pg_catalog.sha256(convert_to(p_payload::text, 'UTF8')), 'hex')), p_payload) r
$$;
grant execute on all functions in schema tests to service_role;

-- ------------------------------------------------------------ privileges
select ok(not has_table_privilege('authenticated', 'public.job_executions', 'SELECT'), 'job_executions is server-only');
select ok(not has_table_privilege('authenticated', 'public.agent_step_runs', 'SELECT'), 'agent_step_runs is server-only');
select ok(not has_table_privilege('authenticated', 'public.provider_usage', 'SELECT'), 'provider_usage is server-only');
select ok(not has_table_privilege('anon', 'public.job_executions', 'SELECT'), 'anon cannot read jobs');
select ok(not has_function_privilege('authenticated', 'public.sor_request_job(public.job_kind,uuid,uuid,text,text,jsonb)', 'EXECUTE'),
  'browsers cannot create jobs directly');
select ok(not has_function_privilege('authenticated', 'public.sor_worker_claim(uuid,text,integer)', 'EXECUTE'),
  'browsers cannot call worker RPCs');
select ok(not has_schema_privilege('authenticated', 'pgmq', 'USAGE')
          and not has_function_privilege('authenticated', 'pgmq.send(text,jsonb,integer)', 'EXECUTE'),
  'browsers cannot reach the queue');
select ok(not has_schema_privilege('anon', 'pgmq', 'USAGE'), 'anon cannot reach the queue');
select ok(has_function_privilege('service_role', 'public.sor_worker_read(integer,integer)', 'EXECUTE'),
  'the worker can read the queue');
select ok(to_regclass('pgmq.q_sor_jobs') is not null, 'the sor_jobs queue exists');

-- ------------------------------------------------------------ creation and idempotency
select tests.as_service_role();
select throws_ok($$select tests.req(tests.id('a4'), 'viewer-key-1', jsonb_build_object('product_id', tests.id('d1')))$$,
  '42501', null, 'a viewer cannot create a job');
select throws_ok($$select tests.req(tests.id('a6'), 'outsider-key', jsonb_build_object('product_id', tests.id('d1')))$$,
  '42501', null, 'a non-member cannot create a job');
select throws_ok($$select tests.req(tests.id('a3'), 'excluded-key', jsonb_build_object('product_id', tests.id('d3')))$$,
  '23514', null, 'an excluded product cannot be enriched');
select throws_ok($$select tests.req(tests.id('a3'), 'candidate-key', jsonb_build_object('product_id', tests.id('d2')))$$,
  'P0002', null, 'a non-active product cannot be enriched');
select throws_ok($$select tests.req(tests.id('a3'), 'extra-key-1', jsonb_build_object('product_id', tests.id('d1'), 'x', 1))$$,
  '22023', null, 'unexpected payload keys are refused');
select throws_ok($$select tests.req(tests.id('a3'), 'import-bad-1', '{"csv": 1, "row_count": 1}'::jsonb, 'catalog_import')$$,
  '22023', null, 'an import needs a CSV text');
select throws_ok($$select tests.req(tests.id('a3'), 'import-bad-2', '{"csv": "a", "row_count": 5000}'::jsonb, 'catalog_import')$$,
  '22023', null, 'an import is limited to import_max_rows rows');
select throws_ok($$select tests.req(tests.id('a3'), 'import-bad-3', '{"csv": "a", "row_count": 1}'::jsonb, 'feedback_import')$$,
  '22023', null, 'a feedback import needs a rights declaration');
select throws_ok($$select tests.req(tests.id('a3'), 'discovery-key', '{}'::jsonb, 'discovery_run')$$,
  '22023', null, 'job kinds of later sprints are refused');

select tests.as_owner_role();
update public.saas_products set website_url = 'https://product-one.test/' where id = tests.id('d1');
select tests.as_service_role();

create temporary table j (name text primary key, id uuid) on commit drop;
grant all on j to service_role;
insert into j select 'first', tests.req(tests.id('a3'), 'enrich-d1-0001', jsonb_build_object('product_id', tests.id('d1')));
select is((select state::text from public.job_executions where id = (select id from j where name = 'first')), 'queued',
  'a job is created queued');
select ok((select queue_message_id from public.job_executions where id = (select id from j where name = 'first')) is not null,
  'its queue message is sent in the same transaction');
select is(tests.req(tests.id('a3'), 'enrich-d1-0001', jsonb_build_object('product_id', tests.id('d1'))),
  (select id from j where name = 'first'), 'the same key and payload return the same job');
select throws_ok($$select tests.req(tests.id('a3'), 'enrich-d1-0001', jsonb_build_object('product_id', tests.id('d1')), 'product_enrichment', repeat('0', 64))$$,
  'P0001', 'IDEMPOTENCY_CONFLICT', 'the same key with another payload is a conflict');
select ok(tests.req(tests.id('a2'), 'enrich-d1-0001', jsonb_build_object('product_id', tests.id('d1')))
          <> (select id from j where name = 'first'), 'idempotency is scoped to the requester');
select tests.req(tests.id('a3'), 'enrich-d1-0002', jsonb_build_object('product_id', tests.id('d1')));
select throws_ok($$select tests.req(tests.id('a3'), 'enrich-d1-0003', jsonb_build_object('product_id', tests.id('d1')))$$,
  '54000', null, 'the per-workspace concurrency limit is enforced');

-- ------------------------------------------------------------ worker cycle
select is((select count(*)::int from public.sor_worker_read(10, 30)), 3, 'the worker reads the three messages');
select is((select count(*)::int from public.sor_worker_read(10, 30)), 0, 'read messages stay invisible during the visibility timeout');

select is((select state::text from public.sor_worker_claim((select id from j where name = 'first'), 'worker-a', 60)),
  'running', 'the worker claims a due job');
select is((select count(*)::int from public.sor_worker_claim((select id from j where name = 'first'), 'worker-b', 60)), 0,
  'a leased job cannot be claimed by another worker');
select is(public.sor_worker_heartbeat((select id from j where name = 'first'), 'worker-a', 60,
  (select queue_message_id from public.job_executions where id = (select id from j where name = 'first'))), false,
  'a heartbeat extends the lease and reports no cancellation');
select throws_ok($$select public.sor_worker_heartbeat((select id from j where name = 'first'), 'worker-b', 60, null)$$,
  '55000', 'LEASE_LOST', 'only the lease owner can heartbeat');

-- Stale lease recovery: an expired lease can be claimed again (crash).
select tests.as_owner_role();
update public.job_executions set lease_expires_at = now() - interval '1 second' where id = (select id from j where name = 'first');
select tests.as_service_role();
select is((select attempt_count from public.sor_worker_claim((select id from j where name = 'first'), 'worker-b', 60)), 2,
  'an expired lease is recovered by another worker (attempt 2)');
select throws_ok($$select public.sor_worker_finish((select id from j where name = 'first'), 'worker-a', 'completed', 'completed', null, null)$$,
  '55000', 'LEASE_LOST', 'the crashed worker can no longer finish the job');

-- Retry with backoff.
select lives_ok($$select public.sor_worker_retry((select id from j where name = 'first'), 'worker-b', 300, 'HTTP_503', 'upstream')$$,
  'a transient failure schedules a retry');
select is((select state::text || '/' || last_error_code from public.job_executions where id = (select id from j where name = 'first')),
  'retrying/HTTP_503', 'the job waits for its next attempt');
select is((select count(*)::int from public.sor_worker_claim((select id from j where name = 'first'), 'worker-b', 60)), 0,
  'a retrying job is not claimed before next_attempt_at');

select tests.as_owner_role();
update public.job_executions set next_attempt_at = now() - interval '1 second' where id = (select id from j where name = 'first');
select tests.as_service_role();
select is((select attempt_count from public.sor_worker_claim((select id from j where name = 'first'), 'worker-c', 60)), 3,
  'the retry is claimed once due');
select lives_ok($$select public.sor_worker_finish((select id from j where name = 'first'), 'worker-c', 'completed', 'completed', null, null,
                   '{"evidence": 3}'::jsonb, '{"cost_usd": 0}'::jsonb)$$, 'the worker finishes the job');
select is((select state::text || '/' || terminal_reason::text || '/' || (result ->> 'evidence') from public.job_executions
            where id = (select id from j where name = 'first')), 'completed/completed/3', 'terminal state, reason and result are stored');
select tests.as_owner_role();
select is((select count(*)::int from pgmq.q_sor_jobs
            where msg_id = (select queue_message_id from public.job_executions where id = (select id from j where name = 'first'))), 0,
  'the message is archived at the terminal state');
select tests.as_service_role();
select is((select count(*)::int from public.sor_worker_claim((select id from j where name = 'first'), 'worker-d', 60)), 0,
  'a duplicate delivery of a finished job does nothing');

-- ------------------------------------------------------------ cancellation
insert into j select 'second', id from public.job_executions where idempotency_key = 'enrich-d1-0002';
select throws_ok($$select public.sor_cancel_job((select id from j where name = 'second'), tests.id('b1'), tests.id('a4'))$$,
  '42501', null, 'a viewer cannot cancel');
select throws_ok($$select public.sor_cancel_job((select id from j where name = 'second'), tests.id('b2'), tests.id('a5'))$$,
  'P0002', null, 'another workspace cannot even see the job');
select is(public.sor_cancel_job((select id from j where name = 'second'), tests.id('b1'), tests.id('a3'))::text, 'cancelled',
  'a queued job is cancelled at once');
select throws_ok($$select public.sor_cancel_job((select id from j where name = 'second'), tests.id('b1'), tests.id('a3'))$$,
  '55000', null, 'a finished job cannot be cancelled');

insert into j select 'third', id from public.job_executions where requested_by = tests.id('a2');
select is((select state::text from public.sor_worker_claim((select id from j where name = 'third'), 'worker-a', 60)), 'running', 'claimed');
select is(public.sor_cancel_job((select id from j where name = 'third'), tests.id('b1'), tests.id('a2'))::text, 'running',
  'a running job is only flagged for cancellation');
select is(public.sor_worker_heartbeat((select id from j where name = 'third'), 'worker-a', 60, null), true,
  'the heartbeat surfaces the cancellation request');
select lives_ok($$select public.sor_worker_finish((select id from j where name = 'third'), 'worker-a', 'cancelled', 'cancelled', null, null)$$,
  'the worker stops cooperatively');

-- ------------------------------------------------------------ dead letter, poison, orphans
insert into j select 'fourth', tests.req(tests.id('a3'), 'enrich-d1-0004', jsonb_build_object('product_id', tests.id('d1')));
select tests.as_owner_role();
update public.job_executions set attempt_count = max_attempts, state = 'retrying' where id = (select id from j where name = 'fourth');
select tests.as_service_role();
select is((select count(*)::int from public.sor_worker_claim((select id from j where name = 'fourth'), 'worker-a', 60)), 0,
  'an exhausted job is not claimed');
select is((select state::text || '/' || terminal_reason::text from public.job_executions where id = (select id from j where name = 'fourth')),
  'dead_letter/dead_letter', 'it goes to the dead letter state');

select tests.as_owner_role();
create temporary table poison on commit drop as select msg_id from pgmq.send('sor_jobs', '{"bad": true}'::jsonb, 0) as msg_id;
grant select on poison to service_role;
select tests.as_service_role();
select lives_ok($$select public.sor_worker_finish_poison((select msg_id from poison), 'schema')$$,
  'a poison message is archived');
select is((select count(*)::int from public.audit_logs where action = 'queue.poison_message'), 1, 'and audited');

insert into j select 'fifth', tests.req(tests.id('a3'), 'enrich-d1-0005', jsonb_build_object('product_id', tests.id('d1')));
select tests.as_owner_role();
delete from pgmq.q_sor_jobs where msg_id = (select queue_message_id from public.job_executions where id = (select id from j where name = 'fifth'));
update public.job_executions set created_at = now() - interval '1 hour' where id = (select id from j where name = 'fifth');
select tests.as_service_role();
select is(public.sor_worker_requeue_orphans(60), 1, 'a job whose message disappeared is re-sent');
select tests.as_owner_role();
select is((select count(*)::int from pgmq.q_sor_jobs
            where msg_id = (select queue_message_id from public.job_executions where id = (select id from j where name = 'fifth'))), 1,
  'with a new message');

select * from finish();
rollback;
