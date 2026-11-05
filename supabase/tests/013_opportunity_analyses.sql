-- M7 opportunity analyses (Sprint 5): privileges, RLS per role, request for
-- every subject type, frozen scope and thresholds, job/analysis state sync,
-- evidence index scope, final write with the database-side consistency
-- checks of §9, deletion, retry and report exports.
begin;
select no_plan();
select tests.seed();

-- ------------------------------------------------------------ privileges
select is(
  (select count(*)::int from unnest(array['opportunity_analyses','analysis_subject_products','analysis_evidence',
      'analysis_dimension_scores','dimension_score_evidence','analysis_findings','finding_evidence']) t(name)
    where has_table_privilege('authenticated', 'public.' || name, 'INSERT')
       or has_any_column_privilege('authenticated', 'public.' || name, 'UPDATE')
       or has_table_privilege('authenticated', 'public.' || name, 'DELETE')
       or has_any_column_privilege('anon', 'public.' || name, 'SELECT')),
  0, 'browsers never write analyses, scores, findings or evidence links; anon reads nothing');
select ok(has_table_privilege('authenticated', 'public.opportunity_analyses', 'SELECT'),
  'members read analyses through RLS');
select ok(not has_any_column_privilege('authenticated', 'public.report_exports', 'SELECT')
      and not has_table_privilege('authenticated', 'public.report_exports', 'INSERT'),
  'report exports are server-only');
select is(
  (select count(*)::int from unnest(array[
      'public.sor_request_analysis(uuid,uuid,text,text,public.analysis_type,jsonb,jsonb)',
      'public.sor_analysis_add_evidence(uuid,uuid,uuid[])', 'public.sor_analysis_needs_review(uuid,jsonb)',
      'public.sor_analysis_finalize(uuid,jsonb)', 'public.sor_delete_analysis(uuid,uuid,uuid,uuid)',
      'public.sor_retry_analysis(uuid,uuid,uuid,text,text)',
      'public.sor_request_job(public.job_kind,uuid,uuid,text,text,jsonb)',
      'public.sor_save_report_export(uuid,text,text,text,text)',
      'public.sor_delete_pain_point_run(uuid,uuid,uuid,uuid)']) f(sig)
    where has_function_privilege('authenticated', sig, 'EXECUTE') or has_function_privilege('anon', sig, 'EXECUTE')
       or not has_function_privilege('service_role', sig, 'EXECUTE')),
  0, 'analysis RPCs are service-role only');

-- ------------------------------------------------------------ fixtures
select tests.as_owner_role();
insert into public.saas_products (id, company_id, name, slug, record_status, exclusion_status) values
  (tests.id('d5'), tests.id('c1'), 'Product Five', 'product-five', 'active', 'eligible');
insert into public.competitor_links (product_id, competitor_product_id, relationship_type) values
  (tests.id('d1'), tests.id('d5'), 'direct'),
  (tests.id('d1'), tests.id('d3'), 'indirect');      -- excluded: omitted and counted
insert into public.source_records (id, source_id, canonical_url)
  select tests.id('e5'), id, 'https://product-five.test/' from public.sources where source_key = 'official_website';
insert into public.source_snapshots (id, source_record_id, content_hash, fetch_status) values
  (tests.id('e6'), tests.id('e5'), repeat('e', 64), 'ok');
insert into public.evidence_items
  (id, product_id, source_snapshot_id, claim_type, claim_text, evidence_type, fact_status, monetization_signal,
   reliability_level, verification_status, verified_at, extraction_method) values
  (tests.id('f5'), tests.id('d1'), tests.id('e2'), 'paid_customer_signal', 'Named paying customer',
   'customer_case_study', 'confirmed', 'customer_verified', 1, 'verified', now(), 'manual_entry'),
  (tests.id('f6'), tests.id('d5'), tests.id('e6'), 'feature', 'Has exports',
   'official_statement', 'confirmed', null, 2, 'verified', now(), 'structured_parse');
insert into public.generated_opportunities (id, workspace_id, name, description, problem_statement, target_persona,
  proposed_solution, value_proposition, differentiation, validation_needed, exclusion_status,
  generator_contract_version, generator_prompt_version) values
  (tests.id('ab1'), tests.id('b1'), 'Address: exports', 'd', 'Exports time out', 'Ops', 'Fast exports', 'v', 'x', 'y',
   'eligible', 'opportunity-hypothesis.v1', 'p9.1'),
  (tests.id('ab2'), tests.id('b1'), 'Review me', 'd', 'p', 'Ops', 's', 'v', 'x', 'y',
   'needs_review', 'opportunity-hypothesis.v1', 'p9.1'),
  (tests.id('ac3'), tests.id('b2'), 'Other workspace', 'd', 'p', 'Ops', 's', 'v', 'x', 'y',
   'eligible', 'opportunity-hypothesis.v1', 'p9.1');
insert into public.generated_opportunity_products (opportunity_id, product_id, role) values
  (tests.id('ab1'), tests.id('d1'), 'evidence_source'),
  (tests.id('ab1'), tests.id('d3'), 'existing_competitor');
select tests.as_service_role();

create temporary table an (name text primary key, analysis_id uuid, job_id uuid, created boolean) on commit drop;
grant all on an to service_role;

-- ------------------------------------------------------------ request
select throws_ok($$select * from public.sor_request_analysis(tests.id('b1'), tests.id('a4'), 'key-an-viewer', repeat('a', 64),
  'opportunity', jsonb_build_object('type', 'product', 'product_id', tests.id('d1')), '{}')$$,
  '42501', null, 'a viewer cannot start an analysis');
select throws_ok($$select * from public.sor_request_analysis(tests.id('b1'), tests.id('a5'), 'key-an-other', repeat('a', 64),
  'opportunity', jsonb_build_object('type', 'product', 'product_id', tests.id('d1')), '{}')$$,
  '42501', null, 'a non-member cannot start an analysis');
select throws_ok($$select * from public.sor_request_analysis(tests.id('b1'), tests.id('a3'), 'key-an-excl', repeat('a', 64),
  'opportunity', jsonb_build_object('type', 'product', 'product_id', tests.id('d3')), '{}')$$,
  '23514', null, 'an excluded product cannot be analysed');
select throws_ok($$select * from public.sor_request_analysis(tests.id('b1'), tests.id('a3'), 'key-an-review', repeat('a', 64),
  'opportunity', jsonb_build_object('type', 'product', 'product_id', tests.id('d4')), '{}')$$,
  '23514', null, 'a product under review cannot be analysed');
select throws_ok($$select * from public.sor_request_analysis(tests.id('b1'), tests.id('a3'), 'key-an-cand', repeat('a', 64),
  'opportunity', jsonb_build_object('type', 'product', 'product_id', tests.id('d2')), '{}')$$,
  'P0002', null, 'a candidate product is not found');
select throws_ok($$select * from public.sor_request_analysis(tests.id('b1'), tests.id('a3'), 'key-an-cmp', repeat('a', 64),
  'comparison', jsonb_build_object('type', 'product_set', 'product_ids', jsonb_build_array(tests.id('d1'), tests.id('d5'))), '{}')$$,
  '22023', null, 'comparison analyses are not available yet (Phase 2)');
select throws_ok($$select * from public.sor_request_analysis(tests.id('b1'), tests.id('a3'), 'key-an-set1', repeat('a', 64),
  'opportunity', jsonb_build_object('type', 'product_set', 'product_ids', jsonb_build_array(tests.id('d1'))), '{}')$$,
  '22023', null, 'a product set needs at least two products');
select throws_ok($$select * from public.sor_request_analysis(tests.id('b1'), tests.id('a3'), 'key-an-set-x', repeat('a', 64),
  'opportunity', jsonb_build_object('type', 'product_set', 'product_ids', jsonb_build_array(tests.id('d1'), tests.id('d3'))), '{}')$$,
  '23514', null, 'an excluded product cannot be in a product set');
select throws_ok($$select * from public.sor_request_analysis(tests.id('b1'), tests.id('a3'), 'key-an-cat-x', repeat('a', 64),
  'opportunity', '{"type": "category", "category_slug": "excluded-affiliate-marketing"}', '{}')$$,
  '23514', null, 'a permanently excluded category cannot be analysed');
select throws_ok($$select * from public.sor_request_analysis(tests.id('b1'), tests.id('a3'), 'key-an-g2', repeat('a', 64),
  'opportunity', jsonb_build_object('type', 'generated_opportunity', 'generated_opportunity_id', tests.id('ab2')), '{}')$$,
  '23514', null, 'a hypothesis under review cannot be analysed');
select throws_ok($$select * from public.sor_request_analysis(tests.id('b1'), tests.id('a3'), 'key-an-g3', repeat('a', 64),
  'opportunity', jsonb_build_object('type', 'generated_opportunity', 'generated_opportunity_id', tests.id('ac3')), '{}')$$,
  'P0002', null, 'a hypothesis of another workspace is not found');
select throws_ok($$select * from public.sor_request_analysis(tests.id('b1'), tests.id('a3'), 'key-an-cl', repeat('a', 64),
  'opportunity', jsonb_build_object('type', 'pain_point_cluster', 'cluster_id', tests.id('ac9')), '{}')$$,
  'P0002', null, 'an unknown cluster is not found');

insert into an select 'p', * from public.sor_request_analysis(tests.id('b1'), tests.id('a3'), 'key-an-product', repeat('a', 64),
  'opportunity', jsonb_build_object('type', 'product', 'product_id', tests.id('d1')),
  '{"analysis_depth": "standard", "context": {"target_country": "FR"}, "options": {}}');
select is((select created from an where name = 'p'), true, 'a product analysis is created');
select is(
  (select array_agg(product_id::text || ':' || role order by product_id::text || ':' || role) from public.analysis_subject_products where analysis_id = (select analysis_id from an where name = 'p')),
  (select array_agg(x order by x) from unnest(array[tests.id('d1')::text || ':subject', tests.id('d5')::text || ':competitor']) x),
  'the scope freezes the subject and its visible competitors only');
select is((select (subject_snapshot ->> 'omitted_excluded_count')::int from public.opportunity_analyses
            where id = (select analysis_id from an where name = 'p')), 1, 'the excluded competitor is counted, not analysed');
select is((select user_context -> 'build_thresholds' from public.opportunity_analyses
            where id = (select analysis_id from an where name = 'p')),
  '{"min_score": 75, "min_wtp": 10}'::jsonb, 'BUILD thresholds are frozen at request time');
select is((select analysis_version || '/' || scoring_rules_version || '/' || analysis_depth || '/' || target_market
             from public.opportunity_analyses where id = (select analysis_id from an where name = 'p')),
  'opportunity-analysis.v1/scoring-1/standard/FR', 'versions, depth and market are recorded');
select is((select payload ->> 'analysis_id' from public.job_executions where id = (select job_id from an where name = 'p')),
  (select analysis_id::text from an where name = 'p'), 'the job points to the analysis');
select is((select analysis_id from public.sor_request_analysis(tests.id('b1'), tests.id('a3'), 'key-an-product', repeat('a', 64),
  'opportunity', jsonb_build_object('type', 'product', 'product_id', tests.id('d1')), '{}')),
  (select analysis_id from an where name = 'p'), 'replaying the same key returns the same analysis');
select throws_ok($$select * from public.sor_request_analysis(tests.id('b1'), tests.id('a3'), 'key-an-product', repeat('b', 64),
  'opportunity', jsonb_build_object('type', 'product', 'product_id', tests.id('d5')), '{}')$$,
  'P0001', null, 'same key, other payload: conflict');

insert into an select 'g', * from public.sor_request_analysis(tests.id('b1'), tests.id('a3'), 'key-an-gen', repeat('c', 64),
  'opportunity', jsonb_build_object('type', 'generated_opportunity', 'generated_opportunity_id', tests.id('ab1')), '{}');
select is(
  (select array_agg(product_id::text || ':' || role order by product_id::text || ':' || role) from public.analysis_subject_products where analysis_id = (select analysis_id from an where name = 'g')),
  (select array_agg(x order by x) from unnest(array[tests.id('d1')::text || ':opportunity_source']) x),
  'a hypothesis scope keeps its visible evidence-source products');
select is((select subject_generated_opportunity_id from public.opportunity_analyses where id = (select analysis_id from an where name = 'g')),
  tests.id('ab1'), 'the hypothesis is the subject');

insert into an select 'c', * from public.sor_request_analysis(tests.id('b1'), tests.id('a3'), 'key-an-cat', repeat('d', 64),
  'opportunity', '{"type": "category", "category_slug": "marketing-growth-marketing-analytics"}', '{"analysis_depth": "quick"}');
select is((select subject_snapshot ->> 'selection_rule' || '/' || (subject_snapshot ->> 'max_products')
             from public.opportunity_analyses where id = (select analysis_id from an where name = 'c')),
  'most_evidence_items_then_name/5', 'the category selection rule and depth cap are recorded');
select is(public.sor_cancel_job((select job_id from an where name = 'c'), tests.id('b1'), tests.id('a3'))::text,
  'cancelled', 'a queued analysis can be cancelled');
select is((select status::text from public.opportunity_analyses where id = (select analysis_id from an where name = 'c')),
  'cancelled', 'the cancelled job cancels the analysis');

select tests.as_owner_role();
update public.workspace_settings
   set research_preferences = '{"stricter_build_thresholds": {"min_score": 82, "min_wtp": 4}}' where workspace_id = tests.id('b1');
select tests.as_service_role();
insert into an select 's', * from public.sor_request_analysis(tests.id('b1'), tests.id('a3'), 'key-an-set', repeat('e', 64),
  'opportunity', jsonb_build_object('type', 'product_set', 'product_ids', jsonb_build_array(tests.id('d1'), tests.id('d5'))), '{}');
select is((select user_context -> 'build_thresholds' from public.opportunity_analyses
            where id = (select analysis_id from an where name = 's')),
  '{"min_score": 82, "min_wtp": 10}'::jsonb, 'a workspace can raise the BUILD thresholds, never lower them');

-- ------------------------------------------------------------ RLS
select tests.authenticate_as(tests.id('a4'));
select is((select count(*)::int from public.opportunity_analyses), 4, 'a viewer reads the analyses of the workspace');
select is((select count(*)::int from public.analysis_subject_products), 6, 'and their frozen scope');
select tests.authenticate_as(tests.id('a5'));
select is((select count(*)::int from public.opportunity_analyses), 0, 'another workspace reads nothing');
select tests.authenticate_as(tests.id('a3'));
select throws_ok($$update public.opportunity_analyses set verdict = 'build_candidate'$$, '42501', null,
  'a member cannot write a verdict');
select throws_ok($$insert into public.analysis_evidence (analysis_id, evidence_item_id) values ((select analysis_id from an where name = 'p'), tests.id('f1'))$$,
  '42501', null, 'a member cannot add evidence to an analysis');
select tests.as_service_role();

-- ------------------------------------------------------------ evidence index
select throws_ok($$select public.sor_analysis_add_evidence((select analysis_id from an where name = 'p'), null, array[tests.id('f1')])$$,
  '55000', null, 'the evidence index is written only while the job runs');
select tests.as_owner_role();
update public.job_executions set state = 'running', lease_owner = 'w', lease_expires_at = now() + interval '1 minute',
       attempt_count = 1 where id = (select job_id from an where name = 'p');
select tests.as_service_role();
select is((select status::text from public.opportunity_analyses where id = (select analysis_id from an where name = 'p')),
  'running', 'the analysis follows its running job');
select is(public.sor_analysis_add_evidence((select analysis_id from an where name = 'p'), null,
  array[tests.id('f1'), tests.id('f5'), tests.id('f6')]), 3, 'scope evidence enters the index');
select is(public.sor_analysis_add_evidence((select analysis_id from an where name = 'p'), null, array[tests.id('f1')]),
  0, 'adding evidence twice is idempotent');
select throws_ok($$select public.sor_analysis_add_evidence((select analysis_id from an where name = 'p'), null, array[tests.id('f3')])$$,
  '23514', null, 'evidence of an excluded product outside the scope is refused');

-- ------------------------------------------------------------ finalize
create function pg_temp.dims(p_wtp text, p_rating int, p_ev uuid) returns jsonb language sql as $$
  select jsonb_agg(case when k = 'willingness_to_pay' and p_wtp = 'missing' then
           jsonb_build_object('dimension_key', k, 'assessment_status', 'insufficient_evidence', 'rating', null,
                              'explanation', 'No payment evidence', 'missing_information', '["payments"]'::jsonb, 'evidence', '[]'::jsonb)
         else jsonb_build_object('dimension_key', k, 'assessment_status', 'assessed', 'rating', p_rating,
                                 'explanation', 'Evidence-backed', 'evidence',
                                 jsonb_build_array(jsonb_build_object('evidence_id', p_ev, 'support_type', 'supports')))
         end)
    from unnest(array['customer_demand','willingness_to_pay','product_gap','market_attractiveness',
                      'competitive_differentiation','feasibility_distribution']) k
$$;
create function pg_temp.result(p_dims jsonb, p_score jsonb, p_verdict text, p_findings jsonb, p_report jsonb)
returns jsonb language sql as $$
  select jsonb_build_object('dimensions', p_dims, 'score', p_score, 'verdict', p_verdict,
    'verdict_reasons', '[{"rule": 2, "code": "INCOMPLETE_COVERAGE", "result": "triggered"}]'::jsonb,
    'findings', p_findings, 'executive_summary', 'Simulated analysis (fake provider)',
    'report', p_report, 'limitations', '[{"code": "fake_provider"}]'::jsonb)
$$;
grant execute on function pg_temp.dims(text, int, uuid), pg_temp.result(jsonb, jsonb, text, jsonb, jsonb) to service_role;

-- 85 % coverage, rating 4: 68 provisional points, never a final score.
select throws_ok($$select public.sor_analysis_finalize((select analysis_id from an where name = 'p'),
  pg_temp.result(pg_temp.dims('missing', 4, tests.id('f1')),
    '{"score_total": 68, "provisional_points": 68, "score_coverage": 85, "willingness_to_pay_score": null, "confidence_score": 30, "decision_band": null}',
    'validate_first', '[]', '{"sections": []}'))$$,
  '23514', null, 'a final score at partial coverage is refused');
select throws_ok($$select public.sor_analysis_finalize((select analysis_id from an where name = 'p'),
  pg_temp.result(pg_temp.dims('missing', 4, tests.id('f1')),
    '{"score_total": null, "provisional_points": 68, "score_coverage": 85, "willingness_to_pay_score": null, "confidence_score": 30, "decision_band": null}',
    'build_candidate', '[]', '{"sections": []}'))$$,
  '23514', null, 'an incomplete analysis cannot be BUILD CANDIDATE');
select throws_ok($$select public.sor_analysis_finalize((select analysis_id from an where name = 'p'),
  pg_temp.result(pg_temp.dims('missing', 4, tests.id('f1')),
    '{"score_total": null, "provisional_points": 68, "score_coverage": 85, "willingness_to_pay_score": null, "confidence_score": 30, "decision_band": null}',
    'validate_first', '[]', jsonb_build_object('claims', jsonb_build_array(jsonb_build_object('evidence_id', tests.id('f3'))))))$$,
  '23514', null, 'a report citing evidence outside the index is refused');
select throws_ok($$select public.sor_analysis_finalize((select analysis_id from an where name = 'p'),
  pg_temp.result(pg_temp.dims('missing', 4, tests.id('f3')),
    '{"score_total": null, "provisional_points": 68, "score_coverage": 85, "willingness_to_pay_score": null, "confidence_score": 30, "decision_band": null}',
    'validate_first', '[]', '{}'))$$,
  '23503', null, 'a dimension cannot cite evidence outside the index');
select throws_ok($t$do $x$ begin
  perform public.sor_analysis_finalize((select analysis_id from an where name = 'p'),
    pg_temp.result(pg_temp.dims('missing', 4, tests.id('f1')),
      '{"score_total": null, "provisional_points": 68, "score_coverage": 85, "willingness_to_pay_score": null, "confidence_score": 30, "decision_band": null}',
      'validate_first',
      '[{"id": "00000000-0000-4000-8000-0000000000a1", "finding_type": "risk", "title": "Crowded", "description": "d", "priority": 2,
         "confidence": 50, "is_hypothesis": false, "severity": null, "dimension_key": null, "source_agent": "O8", "evidence": []}]', '{}'));
  set constraints all immediate;
  set constraints all deferred;
end $x$$t$, '23514', null, 'a non-hypothesis finding without evidence is refused at commit');
set constraints all deferred;
select throws_ok($t$do $x$ begin
  perform public.sor_analysis_finalize((select analysis_id from an where name = 'p'),
    pg_temp.result(jsonb_set(pg_temp.dims('missing', 4, tests.id('f1')), '{0,evidence}', '[]'),
      '{"score_total": null, "provisional_points": 68, "score_coverage": 85, "willingness_to_pay_score": null, "confidence_score": 30, "decision_band": null}',
      'validate_first', '[]', '{}'));
  set constraints all immediate;
  set constraints all deferred;
end $x$$t$, '23514', null, 'an assessed dimension without supporting evidence is refused at commit');
set constraints all deferred;
select throws_ok($$select public.sor_analysis_finalize((select analysis_id from an where name = 'p'),
  pg_temp.result(pg_temp.dims('missing', 4, tests.id('f1')),
    '{"score_total": null, "provisional_points": 68, "score_coverage": 85, "willingness_to_pay_score": null, "confidence_score": 30, "decision_band": null}',
    'validate_first',
    jsonb_build_array(jsonb_build_object('id', '00000000-0000-4000-8000-0000000000a2', 'finding_type', 'kill_criterion',
      'title', 'Fatal', 'description', 'd', 'priority', 1, 'confidence', 80, 'is_hypothesis', false, 'severity', 'critical',
      'is_substantiated', true, 'dimension_key', null, 'source_agent', 'O8',
      'evidence', jsonb_build_array(jsonb_build_object('evidence_id', tests.id('f5'), 'support_type', 'supports')))), '{}'))$$,
  '23514', null, 'a substantiated critical kill criterion must give REJECT');
select throws_ok($$select public.sor_analysis_finalize((select analysis_id from an where name = 'p'),
  pg_temp.result(pg_temp.dims('missing', 4, tests.id('f1')),
    '{"score_total": null, "provisional_points": 68, "score_coverage": 85, "willingness_to_pay_score": null, "confidence_score": 30, "decision_band": null}',
    'reject',
    jsonb_build_array(jsonb_build_object('id', '00000000-0000-4000-8000-0000000000a2', 'finding_type', 'kill_criterion',
      'title', 'Fatal', 'description', 'd', 'priority', 1, 'confidence', 80, 'is_hypothesis', false, 'severity', 'critical',
      'is_substantiated', false, 'dimension_key', null, 'source_agent', 'O8',
      'evidence', jsonb_build_array(jsonb_build_object('evidence_id', tests.id('f5'), 'support_type', 'supports')))), '{}'))$$,
  '23514', null, 'the database recomputes kill-criterion substantiation');

select lives_ok($t$do $x$ begin
  perform public.sor_analysis_finalize((select analysis_id from an where name = 'p'),
    pg_temp.result(pg_temp.dims('missing', 4, tests.id('f1')),
      '{"score_total": null, "provisional_points": 68, "score_coverage": 85, "willingness_to_pay_score": null, "confidence_score": 30, "decision_band": null}',
      'validate_first',
      '[{"id": "00000000-0000-4000-8000-0000000000a3", "finding_type": "risk", "title": "Crowded", "description": "d", "priority": 2,
         "confidence": 50, "is_hypothesis": true, "severity": null, "dimension_key": null, "source_agent": "O8", "evidence": []}]',
      jsonb_build_object('claims', jsonb_build_array(jsonb_build_object('evidence_id', tests.id('f1'))))));
  set constraints all immediate;
  set constraints all deferred;
end $x$$t$, 'an incomplete analysis is stored as VALIDATE FIRST');
set constraints all deferred;
select is((select row(score_total, provisional_points, score_coverage, willingness_to_pay_score, decision_band, verdict)::text
             from public.opportunity_analyses where id = (select analysis_id from an where name = 'p')),
  '(,68.00,85.00,,,validate_first)', 'provisional points on 85 % coverage, no final score, no band');
select is((select count(*)::int from public.analysis_dimension_scores where analysis_id = (select analysis_id from an where name = 'p')
             and assessment_status = 'insufficient_evidence' and rating is null), 1, 'the missing dimension stays unrated');
select lives_ok($t$do $x$ begin
  perform public.sor_analysis_finalize((select analysis_id from an where name = 'p'),
    pg_temp.result(pg_temp.dims('missing', 4, tests.id('f1')),
      '{"score_total": null, "provisional_points": 68, "score_coverage": 85, "willingness_to_pay_score": null, "confidence_score": 30, "decision_band": null}',
      'validate_first',
      '[{"id": "00000000-0000-4000-8000-0000000000a3", "finding_type": "risk", "title": "Crowded", "description": "d", "priority": 2,
         "confidence": 50, "is_hypothesis": true, "severity": null, "dimension_key": null, "source_agent": "O8", "evidence": []}]', '{}'));
  set constraints all immediate;
  set constraints all deferred;
end $x$$t$, 'a redelivered final write is idempotent');
set constraints all deferred;
select is((select count(*)::int from public.analysis_findings where analysis_id = (select analysis_id from an where name = 'p')),
  1, 'no duplicated findings');

-- BUILD CANDIDATE gates checked by the database.
create function pg_temp.full(p_conf int) returns jsonb language sql as $$
  select pg_temp.result(pg_temp.dims('full', 5, tests.id('f5')),
    jsonb_build_object('score_total', 100, 'provisional_points', 100, 'score_coverage', 100,
                       'willingness_to_pay_score', 15, 'confidence_score', p_conf, 'decision_band', 'priority'),
    'build_candidate', '[]', '{}')
$$;
grant execute on function pg_temp.full(int) to service_role;
select throws_ok($$select public.sor_analysis_finalize((select analysis_id from an where name = 'p'), pg_temp.full(60))$$,
  '23514', null, 'BUILD CANDIDATE needs a confidence of at least 70');
select lives_ok($$select public.sor_analysis_finalize((select analysis_id from an where name = 'p'), pg_temp.full(80))$$,
  'BUILD CANDIDATE with every database-checkable gate');
select tests.as_owner_role();
update public.evidence_items set verification_status = 'unverified', verified_at = null where id = tests.id('f5');
select tests.as_service_role();
select throws_ok($$select public.sor_analysis_finalize((select analysis_id from an where name = 'p'), pg_temp.full(80))$$,
  '23514', null, 'BUILD CANDIDATE needs verified paying-customer evidence in the index');
select tests.as_owner_role();
update public.evidence_items set verification_status = 'verified', verified_at = now() where id = tests.id('f5');
select tests.as_service_role();

-- ------------------------------------------------------------ completion
select tests.as_owner_role();
update public.job_executions set state = 'completed', terminal_reason = 'completed', lease_owner = null,
       lease_expires_at = null where id = (select job_id from an where name = 'p');
select tests.as_service_role();
select is((select status::text || '/' || terminal_reason::text from public.opportunity_analyses
            where id = (select analysis_id from an where name = 'p')), 'completed/completed', 'the analysis completes with its job');
select throws_ok($$select public.sor_analysis_finalize((select analysis_id from an where name = 'p'), pg_temp.full(80))$$,
  '55000', null, 'a completed analysis is never rewritten');

-- ------------------------------------------------------------ exports
select throws_ok($$select * from public.sor_request_job('report_export', tests.id('b1'), tests.id('a3'), 'key-exp-gen', repeat('a', 64),
  jsonb_build_object('analysis_id', (select analysis_id from an where name = 'g'), 'format', 'markdown'))$$,
  '55000', null, 'an analysis without a report cannot be exported');
select throws_ok($$select * from public.sor_request_job('report_export', tests.id('b2'), tests.id('a5'), 'key-exp-other', repeat('a', 64),
  jsonb_build_object('analysis_id', (select analysis_id from an where name = 'p'), 'format', 'json'))$$,
  'P0002', null, 'an analysis of another workspace cannot be exported');
select throws_ok($$select * from public.sor_request_job('report_export', tests.id('b1'), tests.id('a3'), 'key-exp-pdf', repeat('a', 64),
  jsonb_build_object('analysis_id', (select analysis_id from an where name = 'p'), 'format', 'pdf'))$$,
  '22023', null, 'only JSON and Markdown exports exist (PD-18 A)');
create temporary table ex (job_id uuid, created boolean) on commit drop;
grant all on ex to service_role;
insert into ex select * from public.sor_request_job('report_export', tests.id('b1'), tests.id('a3'), 'key-exp-md', repeat('a', 64),
  jsonb_build_object('analysis_id', (select analysis_id from an where name = 'p'), 'format', 'markdown'));
select is((select created from ex), true, 'a completed analysis can be exported');
select throws_ok($$select public.sor_save_report_export((select job_id from ex), 'markdown', 'report.md', 'text/markdown; charset=utf-8', '# R')$$,
  '55000', null, 'an export is saved only by its running job');
select tests.as_owner_role();
update public.job_executions set state = 'running', lease_owner = 'w', lease_expires_at = now() + interval '1 minute',
       attempt_count = 1 where id = (select job_id from ex);
select tests.as_service_role();
select ok(public.sor_save_report_export((select job_id from ex), 'markdown', 'report.md', 'text/markdown; charset=utf-8', '# R') is not null,
  'the export is stored');
select is(public.sor_save_report_export((select job_id from ex), 'markdown', 'report.md', 'text/markdown; charset=utf-8', '# R2'),
  (select id from public.report_exports where job_execution_id = (select job_id from ex)), 'saving twice keeps one export');
select throws_ok($$select public.sor_save_report_export((select job_id from ex), 'json', 'report.json', 'application/json', '{}')$$,
  '22023', null, 'the format is the one requested');

select tests.as_owner_role();
update public.job_executions set state = 'completed', terminal_reason = 'completed', lease_owner = null,
       lease_expires_at = null where id = (select job_id from ex);
select tests.as_service_role();

-- ------------------------------------------------------------ retry and delete
select throws_ok($$select * from public.sor_retry_analysis(tests.id('b1'), tests.id('a3'), (select analysis_id from an where name = 'p'), 'key-retry-p', repeat('a', 64))$$,
  '55000', null, 'a completed analysis is not retried');
select tests.as_owner_role();
update public.job_executions set state = 'failed', terminal_reason = 'failed' where id = (select job_id from an where name = 's');
select tests.as_service_role();
select is((select status::text from public.opportunity_analyses where id = (select analysis_id from an where name = 's')),
  'failed', 'a failed job fails the analysis');
select is((select created from public.sor_retry_analysis(tests.id('b1'), tests.id('a3'), (select analysis_id from an where name = 's'),
  'key-retry-s', repeat('a', 64))), true, 'a failed analysis can be retried');
select is((select status::text || '/' || coalesce(verdict::text, 'none') from public.opportunity_analyses
            where id = (select analysis_id from an where name = 's')), 'queued/none', 'the retried analysis restarts without results');

select throws_ok($$select public.sor_delete_analysis(tests.id('b1'), tests.id('a3'), (select analysis_id from an where name = 'p'), gen_random_uuid())$$,
  '42501', null, 'a member cannot delete an analysis');
select throws_ok($$select public.sor_delete_analysis(tests.id('b1'), tests.id('a2'), (select analysis_id from an where name = 'g'), gen_random_uuid())$$,
  '55000', null, 'an unfinished analysis cannot be deleted');
select lives_ok($$select public.sor_delete_analysis(tests.id('b1'), tests.id('a2'), (select analysis_id from an where name = 'p'), gen_random_uuid())$$,
  'an admin deletes a finished analysis');
select is((select count(*)::int from public.analysis_evidence where analysis_id = (select analysis_id from an where name = 'p'))
        + (select count(*)::int from public.report_exports where analysis_id = (select analysis_id from an where name = 'p')),
  0, 'its evidence index and exports are deleted with it');
select is((select count(*)::int from public.audit_logs where action = 'opportunity_analysis.delete'
            and resource_id = (select analysis_id from an where name = 'p')), 1, 'the deletion is audit-logged');
select ok(exists (select 1 from public.evidence_items where id = tests.id('f5')), 'catalog evidence is never deleted');

select * from finish();
rollback;
