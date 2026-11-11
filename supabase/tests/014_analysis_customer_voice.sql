-- Customer voice of an opportunity analysis: the analysis-owned pain point run
-- (created once, scope = visible analysis products, status follows the job).
begin;
select no_plan();
select tests.seed();

select is(
  (select count(*)::int from unnest(array['public.sor_analysis_pain_run(uuid,integer)',
      'public.sor_analysis_finish_pain_run(uuid,public.run_status)']) f(sig)
    where has_function_privilege('authenticated', sig, 'EXECUTE') or has_function_privilege('anon', sig, 'EXECUTE')
       or not has_function_privilege('service_role', sig, 'EXECUTE')),
  0, 'customer-voice RPCs are service-role only');

select tests.as_owner_role();
insert into public.saas_products (id, company_id, name, slug, record_status, exclusion_status) values
  (tests.id('d5'), tests.id('c1'), 'Product Five', 'product-five', 'active', 'eligible');
insert into public.competitor_links (product_id, competitor_product_id, relationship_type) values
  (tests.id('d1'), tests.id('d5'), 'direct');
select tests.as_service_role();

create temporary table an (name text primary key, analysis_id uuid, job_id uuid, created boolean) on commit drop;
grant all on an to service_role;
insert into an select 'a', * from public.sor_request_analysis(tests.id('b1'), tests.id('a3'), 'key-voice-a', repeat('a', 64),
  'opportunity', jsonb_build_object('type', 'product', 'product_id', tests.id('d1')), '{}');
insert into an select 'b', * from public.sor_request_analysis(tests.id('b1'), tests.id('a3'), 'key-voice-b', repeat('b', 64),
  'opportunity', jsonb_build_object('type', 'product', 'product_id', tests.id('d5')), '{}');

select throws_ok($$select public.sor_analysis_pain_run((select analysis_id from an where name = 'a'), 500)$$,
  '55000', null, 'only a running analysis job creates its pain point run');
select tests.as_owner_role();
update public.job_executions set state = 'running', lease_owner = 'w', lease_expires_at = now() + interval '1 minute',
       attempt_count = 1 where id in (select job_id from an);
select tests.as_service_role();

create temporary table pr (name text primary key, run_id uuid) on commit drop;
grant all on pr to service_role;
insert into pr select 'a', public.sor_analysis_pain_run((select analysis_id from an where name = 'a'), 500);
select is(public.sor_analysis_pain_run((select analysis_id from an where name = 'a'), 500),
  (select run_id from pr where name = 'a'), 'the run is created once per analysis');
select is((select array_agg(product_id order by product_id) from public.pain_point_run_products
            where run_id = (select run_id from pr where name = 'a')),
  (select array_agg(x order by x) from unnest(array[tests.id('d1'), tests.id('d5')]) x),
  'its scope is the visible analysis scope (subject and competitors)');
select is((select status::text || '/' || scope_type::text || '/' || (parameters ->> 'max_feedback_items')
             from public.pain_point_runs where id = (select run_id from pr where name = 'a')),
  'running/product_set/500', 'the run is running, product set, with the feedback cap');
select is((select title from public.pain_point_runs where id = (select run_id from pr where name = 'a')),
  'Analyse d’opportunité : Product One', 'the run is named after the analysis subject');
select throws_ok($$select public.sor_analysis_pain_run((select analysis_id from an where name = 'b'), 5)$$,
  '22023', null, 'the feedback cap is bounded');
select throws_ok($$select public.sor_analysis_finish_pain_run((select analysis_id from an where name = 'a'), 'failed')$$,
  '22023', null, 'the worker ends the run as completed or partial only');
select lives_ok($$select public.sor_analysis_finish_pain_run((select analysis_id from an where name = 'a'), 'completed')$$,
  'the worker completes the run');
select is((select status::text from public.pain_point_runs where id = (select run_id from pr where name = 'a')),
  'completed', 'the run is completed');

insert into pr select 'b', public.sor_analysis_pain_run((select analysis_id from an where name = 'b'), 200);
select tests.as_owner_role();
update public.job_executions set state = 'failed', terminal_reason = 'failed', last_error_message = 'boom'
 where id = (select job_id from an where name = 'b');
select tests.as_service_role();
select is((select status::text || '/' || coalesce(error_summary, '') from public.pain_point_runs
            where id = (select run_id from pr where name = 'b')),
  'failed/boom', 'a failed analysis job fails its running pain point run');
select is((select status::text from public.opportunity_analyses where id = (select analysis_id from an where name = 'b')),
  'failed', 'and the analysis');

select * from finish();
rollback;
