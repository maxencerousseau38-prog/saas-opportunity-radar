-- M6 Pain Point Intelligence (Sprint 4): privileges, RLS per role, scope and
-- integrity triggers, run request, job/run state sync, worker RPCs
-- (idempotent), cluster corrections, run deletion and retry.
begin;
select no_plan();
select tests.seed();

-- ------------------------------------------------------------ privileges
select ok(to_regtype('extensions.vector') is not null, 'the vector type is installed');
select is(
  (select count(*)::int from unnest(array['feedback_problems','feedback_problem_embeddings']) t(name)
    where has_any_column_privilege('authenticated', 'public.' || name, 'SELECT')
       or has_any_column_privilege('authenticated', 'public.' || name, 'INSERT')
       or has_any_column_privilege('authenticated', 'public.' || name, 'UPDATE')
       or has_table_privilege('authenticated', 'public.' || name, 'DELETE')),
  0, 'extracted problems and embeddings are server-only');
select is(
  (select count(*)::int from unnest(array['pain_point_runs','pain_point_run_products','pain_point_clusters',
      'pain_point_evidence','pain_point_cluster_snapshots','market_gaps','market_gap_clusters','market_gap_evidence',
      'generated_opportunity_clusters','generated_opportunity_products']) t(name)
    where has_table_privilege('authenticated', 'public.' || name, 'INSERT')
       or has_any_column_privilege('authenticated', 'public.' || name, 'UPDATE')
       or has_table_privilege('authenticated', 'public.' || name, 'DELETE')),
  0, 'browsers never write runs, clusters, gaps or evidence links');
select ok(has_column_privilege('authenticated', 'public.generated_opportunities', 'status', 'UPDATE')
      and has_column_privilege('authenticated', 'public.generated_opportunities', 'notes', 'UPDATE')
      and not has_column_privilege('authenticated', 'public.generated_opportunities', 'name', 'UPDATE')
      and not has_table_privilege('authenticated', 'public.generated_opportunities', 'INSERT'),
  'browsers update only status, favourite and notes of generated opportunities');
select is(
  (select count(*)::int from unnest(array[
      'public.sor_request_pain_point_run(uuid,uuid,text,text,text,public.pain_scope_type,uuid[],uuid,jsonb)',
      'public.sor_pain_save_problems(uuid,uuid,text,text,jsonb)', 'public.sor_pain_save_embeddings(jsonb)',
      'public.sor_pain_mark_duplicates(jsonb)', 'public.sor_pain_save_clusters(uuid,jsonb)',
      'public.sor_pain_save_insights(uuid,jsonb,jsonb)',
      'public.sor_cluster_correction(uuid,uuid,uuid,uuid,timestamptz,jsonb,jsonb,jsonb)',
      'public.sor_delete_pain_point_run(uuid,uuid,uuid,uuid)',
      'public.sor_retry_pain_point_run(uuid,uuid,uuid,text,text)']) f(sig)
    where has_function_privilege('authenticated', sig, 'EXECUTE') or has_function_privilege('anon', sig, 'EXECUTE')
       or not has_function_privilege('service_role', sig, 'EXECUTE')),
  0, 'pain point RPCs are service-role only');

-- ------------------------------------------------------------ fixtures
select tests.as_owner_role();
insert into public.saas_products (id, company_id, name, slug, record_status, exclusion_status) values
  (tests.id('d5'), tests.id('c1'), 'Product Five', 'product-five', 'active', 'eligible'),
  (tests.id('d6'), tests.id('c1'), 'Product Six', 'product-six', 'active', 'eligible');
insert into public.job_executions (id, job_kind, workspace_id, requested_by, idempotency_key, request_hash, payload,
                                   state, lease_owner, lease_expires_at, attempt_count)
values (tests.id('ab3'), 'feedback_import', tests.id('b1'), tests.id('a3'), 'feedback-key-1', repeat('c', 64),
        '{"csv": "", "row_count": 1, "rights_declaration": {}}', 'running', 'w', now() + interval '1 minute', 1);
select tests.as_service_role();
create temporary table fb (name text primary key, feedback_id uuid, evidence_id uuid) on commit drop;
grant all on fb to service_role;
insert into fb select v.name, (r ->> 'feedback_id')::uuid, (r ->> 'evidence_id')::uuid
  from (values ('f1', tests.id('d1'), 'Exports to CSV time out', 'h1'),
               ('f2', tests.id('d1'), 'CSV export keeps timing out', 'h2'),
               ('f3', tests.id('d5'), 'The export never finishes', null),
               ('f6', tests.id('d6'), 'Support is slow', 'h3')) v(name, product, text, author),
       lateral public.sor_import_feedback_row(tests.id('ab3'), v.product,
         jsonb_build_object('source_url', 'https://reviews.test/' || v.name, 'source_name', 'Survey', 'text', v.text,
                            'content_storage_status', 'stored_excerpt', 'deduplication_hash', md5(v.name) || md5(v.name),
                            'author_reference_hash', v.author, 'published_at', '2026-03-01T00:00:00Z')) r;
select is((select count(*)::int from fb where feedback_id is not null), 4, 'four feedback items imported');

-- ------------------------------------------------------------ run request
select throws_ok($$select * from public.sor_request_pain_point_run(tests.id('b1'), tests.id('a4'), 'key-run-viewer', repeat('a', 64),
  'Run', 'product', array[tests.id('d1')], null, '{}')$$, '42501', null, 'a viewer cannot start a run');
select throws_ok($$select * from public.sor_request_pain_point_run(tests.id('b1'), tests.id('a5'), 'key-run-other', repeat('a', 64),
  'Run', 'product', array[tests.id('d1')], null, '{}')$$, '42501', null, 'a non-member cannot start a run');
select throws_ok($$select * from public.sor_request_pain_point_run(tests.id('b1'), tests.id('a3'), 'key-run-excl', repeat('a', 64),
  'Run', 'product', array[tests.id('d3')], null, '{}')$$, '23514', null, 'an excluded product cannot be in scope');
select throws_ok($$select * from public.sor_request_pain_point_run(tests.id('b1'), tests.id('a3'), 'key-run-cand', repeat('a', 64),
  'Run', 'product', array[tests.id('d2')], null, '{}')$$, 'P0002', null, 'a candidate product is not found');
select throws_ok($$select * from public.sor_request_pain_point_run(tests.id('b1'), tests.id('a3'), 'key-run-set1', repeat('a', 64),
  'Run', 'product_set', array[tests.id('d1')], null, '{}')$$, '22023', null, 'a product set needs two products');
select throws_ok($$select * from public.sor_request_pain_point_run(tests.id('b1'), tests.id('a3'), 'key-run-cat-x', repeat('a', 64),
  'Run', 'category', null, (select id from public.categories where slug = 'excluded-affiliate-marketing'), '{}')$$,
  '23514', null, 'a permanently excluded category cannot be a scope');

create temporary table runs (name text primary key, run_id uuid, job_id uuid, created boolean) on commit drop;
grant all on runs to service_role;
insert into runs select 'set', * from public.sor_request_pain_point_run(tests.id('b1'), tests.id('a3'), 'key-run-set', repeat('a', 64),
  'Exports', 'product_set', array[tests.id('d1'), tests.id('d5')], null, '{"max_feedback_items": 100}');
select is((select created from runs where name = 'set'), true, 'a product-set run is created');
select is((select count(*)::int from public.pain_point_run_products where run_id = (select run_id from runs where name = 'set')),
  2, 'the scope is frozen');
select is((select payload ->> 'run_id' from public.job_executions where id = (select job_id from runs where name = 'set')),
  (select run_id::text from runs where name = 'set'), 'the job points to the run');
select is((select parameters ->> 'max_feedback_items' from public.pain_point_runs where id = (select run_id from runs where name = 'set')),
  '100', 'parameters are stored');
select is((select run_id from public.sor_request_pain_point_run(tests.id('b1'), tests.id('a3'), 'key-run-set', repeat('a', 64),
  'Exports', 'product_set', array[tests.id('d1'), tests.id('d5')], null, '{"max_feedback_items": 100}')),
  (select run_id from runs where name = 'set'), 'replaying the same key returns the same run');
select throws_ok($$select * from public.sor_request_pain_point_run(tests.id('b1'), tests.id('a3'), 'key-run-set', repeat('b', 64),
  'Other', 'product', array[tests.id('d1')], null, '{}')$$, 'P0001', null, 'same key, other payload: conflict');
insert into runs select 'cat', * from public.sor_request_pain_point_run(tests.id('b1'), tests.id('a3'), 'key-run-cat', repeat('c', 64),
  'Category', 'category', null, (select id from public.categories where slug = 'marketing-growth-marketing-analytics'), '{}');
select is((select array_agg(product_id) from public.pain_point_run_products where run_id = (select run_id from runs where name = 'cat')),
  array[tests.id('d1')], 'a category scope freezes its visible products');

-- ------------------------------------------------------------ job ↔ run state
select tests.as_owner_role();
update public.job_executions set state = 'running', lease_owner = 'w', lease_expires_at = now() + interval '1 minute'
 where id = (select job_id from runs where name = 'set');
select is((select status::text from public.pain_point_runs where id = (select run_id from runs where name = 'set')),
  'running', 'the run follows its running job');
select ok((select started_at is not null from public.pain_point_runs where id = (select run_id from runs where name = 'set')),
  'the start time is recorded');
select tests.as_service_role();
select is(public.sor_cancel_job((select job_id from runs where name = 'cat'), tests.id('b1'), tests.id('a3'))::text,
  'cancelled', 'a queued run can be cancelled');
select is((select status::text from public.pain_point_runs where id = (select run_id from runs where name = 'cat')),
  'cancelled', 'the cancelled job cancels the run');

-- ------------------------------------------------------------ worker RPCs
create temporary table probs (name text primary key, id uuid) on commit drop;
grant all on probs to service_role;
insert into probs select 'p1', id from public.sor_pain_save_problems((select feedback_id from fb where name = 'f1'), null,
  'problem-extraction.v1', 'p3.1', '[{"is_primary": true, "problem_statement": "CSV export times out", "problem_category": "performance",
  "severity": 4, "switching_intent": "unknown", "resolution_status": "unresolved", "confidence": 80}]') id;
insert into probs select 'p2', id from public.sor_pain_save_problems((select feedback_id from fb where name = 'f2'), null,
  'problem-extraction.v1', 'p3.1', '[{"is_primary": true, "problem_statement": "Export times out", "problem_category": "performance",
  "severity": 3, "switching_intent": "unknown", "resolution_status": "unknown", "confidence": 70}]') id;
insert into probs select 'p3', id from public.sor_pain_save_problems((select feedback_id from fb where name = 'f3'), null,
  'problem-extraction.v1', 'p3.1', '[{"is_primary": true, "problem_statement": "Export never finishes", "problem_category": "performance",
  "severity": null, "switching_intent": "unknown", "resolution_status": "unknown", "confidence": 60}]') id;
insert into probs select 'p6', id from public.sor_pain_save_problems((select feedback_id from fb where name = 'f6'), null,
  'problem-extraction.v1', 'p3.1', '[{"is_primary": true, "problem_statement": "Slow support", "problem_category": "support",
  "severity": 2, "switching_intent": "unknown", "resolution_status": "unknown", "confidence": 60}]') id;
select is((select id from public.sor_pain_save_problems((select feedback_id from fb where name = 'f1'), null,
  'problem-extraction.v1', 'p3.1', '[{"is_primary": true, "problem_statement": "other", "problem_category": "ux", "switching_intent": "unknown", "resolution_status": "unknown", "confidence": 1}]') id),
  (select id from probs where name = 'p1'), 'problems of a feedback item are reused for the same extractor version');
select is((select product_id from public.feedback_problems where id = (select id from probs where name = 'p3')), tests.id('d5'),
  'a problem takes the product of its feedback');
select tests.as_owner_role();
select throws_ok($$update public.feedback_problems set product_id = tests.id('d1') where id = (select id from probs where name = 'p3')$$,
  '23514', null, 'a problem cannot move to another product than its feedback');
select tests.as_service_role();

select is(public.sor_pain_save_embeddings(jsonb_build_array(
  jsonb_build_object('problem_id', (select id from probs where name = 'p1'), 'model', 'fake-embedding-1', 'dimensions', 3, 'embedding', '[1,0,0]'),
  jsonb_build_object('problem_id', (select id from probs where name = 'p2'), 'model', 'fake-embedding-1', 'dimensions', 3, 'embedding', '[0.9,0.1,0]'))),
  2, 'embeddings are stored');
select is(public.sor_pain_save_embeddings(jsonb_build_array(
  jsonb_build_object('problem_id', (select id from probs where name = 'p1'), 'model', 'fake-embedding-1', 'dimensions', 3, 'embedding', '[1,0,0]'))),
  0, 'storing an embedding twice is a no-op');
select throws_ok($$select public.sor_pain_save_embeddings(jsonb_build_array(
  jsonb_build_object('problem_id', (select id from probs where name = 'p3'), 'model', 'fake-embedding-1', 'dimensions', 4, 'embedding', '[1,0,0]')))$$,
  '23514', null, 'the declared dimensions must match the vector');
select is(public.sor_pain_mark_duplicates(jsonb_build_array(
  jsonb_build_object('feedback_id', (select feedback_id from fb where name = 'f3'), 'duplicate_of', (select feedback_id from fb where name = 'f1')),
  jsonb_build_object('feedback_id', (select feedback_id from fb where name = 'f2'), 'duplicate_of', (select feedback_id from fb where name = 'f1')))),
  1, 'near duplicates are marked only within the same product');

create temporary table stats (s jsonb) on commit drop;
grant all on stats to service_role;
insert into stats values ('{"feedback_count": 2, "distinct_author_count": 2, "distinct_author_count_status": "verified",
  "distinct_company_count": null, "distinct_company_count_status": "unknown", "affected_product_count": 2,
  "product_distribution": [], "resolution_breakdown": {"resolved": 0, "unresolved": 1, "unknown": 1},
  "frequency_label": "unknown", "severity_score": 3.5, "confidence_score": 45, "last_observed_at": "2026-03-01T00:00:00Z"}');
select is(public.sor_pain_save_clusters((select run_id from runs where name = 'set'), jsonb_build_array(jsonb_build_object(
  'id', tests.id('c901'), 'name', 'Exports time out', 'description', 'CSV exports time out', 'problem_category', 'performance',
  'target_persona', null, 'algorithm_version', 'cluster-1', 'stats', (select s from stats),
  'members', jsonb_build_array(
    jsonb_build_object('problem_id', (select id from probs where name = 'p1'), 'membership_source', 'algorithm'),
    jsonb_build_object('problem_id', (select id from probs where name = 'p2'), 'membership_source', 'algorithm'),
    jsonb_build_object('problem_id', (select id from probs where name = 'p3'), 'membership_source', 'verifier', 'removed', true))))),
  1, 'a cluster is stored');
select is((select feedback_count || '/' || distinct_author_count_status || '/' || review_status
             from public.pain_point_clusters where id = tests.id('c901')),
  '2/verified/machine_proposed', 'statistics are applied');
select is((select count(*)::int from public.pain_point_evidence where cluster_id = tests.id('c901') and removed_at is not null),
  1, 'a verifier outlier is kept as a removed member (traceability)');
select is((select count(*)::int from public.pain_point_cluster_snapshots where cluster_id = tests.id('c901')), 1, 'a history snapshot is taken');
select is(public.sor_pain_save_clusters((select run_id from runs where name = 'set'), jsonb_build_array(jsonb_build_object(
  'id', tests.id('c901'), 'name', 'X', 'description', 'Y', 'problem_category', 'performance', 'algorithm_version', 'cluster-1',
  'stats', (select s from stats), 'members', '[]'::jsonb))), 1, 'replaying the clusters inserts nothing');
select is((select count(*)::int from public.pain_point_cluster_snapshots where cluster_id = tests.id('c901')), 1, 'no duplicate snapshot');
select throws_ok($$select public.sor_pain_save_clusters((select run_id from runs where name = 'set'), jsonb_build_array(jsonb_build_object(
  'id', tests.id('c902'), 'name', 'Support', 'description', 'Slow support', 'problem_category', 'support', 'algorithm_version', 'cluster-1',
  'stats', (select s from stats), 'members', jsonb_build_array(jsonb_build_object('problem_id', (select id from probs where name = 'p6'),
  'membership_source', 'algorithm')))))$$, '23514', null, 'a problem outside the run scope cannot join a cluster');

-- insights
select throws_ok($$select public.sor_pain_save_insights((select run_id from runs where name = 'set'), jsonb_build_array(jsonb_build_object(
  'id', tests.id('9a1'), 'title', 'G', 'gap_type', 'shared_problem', 'description', 'D', 'confidence', 50,
  'cluster_ids', jsonb_build_array(tests.id('c901')), 'evidence', jsonb_build_array(jsonb_build_object('evidence_id', tests.id('f3'))))), '[]')$$,
  '23514', null, 'gap evidence must belong to the run scope');
select throws_ok($$select public.sor_pain_save_insights((select run_id from runs where name = 'set'), '[]', jsonb_build_array(jsonb_build_object(
  'id', tests.id('9b0'), 'name', 'N', 'description', 'D', 'problem_statement', 'P', 'target_persona', 'T', 'proposed_solution', 'S',
  'value_proposition', 'V', 'differentiation', 'X', 'validation_needed', 'Interview', 'exclusion_status', 'excluded',
  'generator_contract_version', 'v1', 'generator_prompt_version', 'p1')))$$,
  '23514', null, 'an excluded hypothesis is never stored');
select is(public.sor_pain_save_insights((select run_id from runs where name = 'set'),
  jsonb_build_array(jsonb_build_object('id', tests.id('9a2'), 'title', 'Exports fail at scale', 'gap_type', 'shared_problem',
    'description', 'D', 'confidence', 50, 'cluster_ids', jsonb_build_array(tests.id('c901')),
    'evidence', jsonb_build_array(jsonb_build_object('evidence_id', (select evidence_id from fb where name = 'f1'))))),
  jsonb_build_array(jsonb_build_object('id', tests.id('9b1'), 'name', 'Fast exports', 'description', 'D', 'problem_statement', 'P',
    'target_persona', 'T', 'proposed_solution', 'S', 'value_proposition', 'V', 'differentiation', 'X', 'validation_needed', 'Interview',
    'exclusion_status', 'eligible', 'generator_contract_version', 'v1', 'generator_prompt_version', 'p1',
    'cluster_ids', jsonb_build_array(tests.id('c901')),
    'products', jsonb_build_array(jsonb_build_object('product_id', tests.id('d1'), 'role', 'existing_competitor'),
                                  jsonb_build_object('product_id', tests.id('d3'), 'role', 'existing_competitor')))))
  ->> 'opportunities', '1', 'gaps and hypotheses are stored');
select is((select count(*)::int from public.generated_opportunity_products where opportunity_id = tests.id('9b1')), 1,
  'an excluded product is never linked to a hypothesis');

-- ------------------------------------------------------------ RLS
select tests.authenticate_as(tests.id('a4'));
select is((select count(*)::int from public.pain_point_clusters), 1, 'a viewer reads the workspace clusters');
select is((select count(*)::int from public.pain_point_evidence), 3, 'and their evidence links');
select is((select count(*)::int from public.market_gaps), 1, 'and gaps');
update public.generated_opportunities set notes = 'viewer' where id = tests.id('9b1');
select tests.as_owner_role();
select is((select coalesce(notes, '(none)') from public.generated_opportunities where id = tests.id('9b1')), '(none)',
  'a viewer cannot update a generated opportunity');
select tests.authenticate_as(tests.id('a3'));
update public.generated_opportunities set status = 'to_research', notes = 'look', is_favorite = true where id = tests.id('9b1');
select throws_ok($$update public.generated_opportunities set name = 'renamed' where id = tests.id('9b1')$$, '42501', null,
  'a member cannot rename a hypothesis');
select tests.as_owner_role();
select is((select status::text || '/' || notes || '/' || is_favorite from public.generated_opportunities where id = tests.id('9b1')),
  'to_research/look/true', 'a member updates status, notes and favourite');
select tests.authenticate_as(tests.id('a5'));
select is((select count(*)::int from public.pain_point_runs) + (select count(*)::int from public.pain_point_clusters)
        + (select count(*)::int from public.generated_opportunities) + (select count(*)::int from public.market_gaps), 0,
  'another workspace sees nothing');
select tests.as_anon();
select throws_ok($$select count(*) from public.pain_point_clusters$$, '42501', null, 'anon has no access');

-- ------------------------------------------------------------ collections hold hypotheses
select tests.authenticate_as(tests.id('a3'));
insert into public.collections (id, workspace_id, name, created_by) values (tests.id('7c1'), tests.id('b1'), 'Ideas', tests.id('a3'));
insert into public.collection_items (collection_id, workspace_id, generated_opportunity_id, added_by)
values (tests.id('7c1'), tests.id('b1'), tests.id('9b1'), tests.id('a3'));
select is((select count(*)::int from public.collection_items where generated_opportunity_id = tests.id('9b1')), 1,
  'a generated opportunity can be saved in a collection');
select throws_ok($$insert into public.collection_items (collection_id, workspace_id, product_id, generated_opportunity_id, added_by)
  values (tests.id('7c1'), tests.id('b1'), tests.id('d1'), tests.id('9b1'), tests.id('a3'))$$, '23514', null,
  'a collection item has exactly one target');

insert into public.tags (id, workspace_id, name, created_by) values (tests.id('7d1'), tests.id('b1'), 'Prioritaire', tests.id('a3'));
insert into public.tag_assignments (workspace_id, tag_id, generated_opportunity_id, assigned_by)
values (tests.id('b1'), tests.id('7d1'), tests.id('9b1'), tests.id('a3'));
select is((select count(*)::int from public.tag_assignments where generated_opportunity_id = tests.id('9b1')), 1,
  'a generated opportunity can be tagged');
select throws_ok($$insert into public.tag_assignments (workspace_id, tag_id, product_id, generated_opportunity_id, assigned_by)
  values (tests.id('b1'), tests.id('7d1'), tests.id('d1'), tests.id('9b1'), tests.id('a3'))$$, '23514', null,
  'a tag assignment has exactly one target');

-- ------------------------------------------------------------ corrections
select tests.as_service_role();
select throws_ok($$select public.sor_cluster_correction(tests.id('b1'), tests.id('a4'), tests.id('c901'), null, null, '{"name": "x"}', null, null)$$,
  '42501', null, 'a viewer cannot correct a cluster');
select throws_ok($$select public.sor_cluster_correction(tests.id('b2'), tests.id('a5'), tests.id('c901'), null, null, '{"name": "x"}', null, null)$$,
  'P0002', null, 'a cluster of another workspace is not found');
select throws_ok($$select public.sor_cluster_correction(tests.id('b1'), tests.id('a3'), tests.id('c901'), null, now() - interval '1 day', '{"name": "x"}', null, null)$$,
  '55000', null, 'a stale correction is refused');
select throws_ok($$select public.sor_cluster_correction(tests.id('b1'), tests.id('a3'), tests.id('c901'), null, null,
  jsonb_build_object('remove_problem_ids', jsonb_build_array((select id from probs where name = 'p3'))), null, null)$$,
  '22023', null, 'only current members can be removed');
select is(public.sor_cluster_correction(tests.id('b1'), tests.id('a3'), tests.id('c901'), tests.id('99'), null,
  jsonb_build_object('name', 'CSV exports time out', 'remove_problem_ids', jsonb_build_array((select id from probs where name = 'p2'))),
  jsonb_set((select s from stats), '{feedback_count}', '1'), null) ->> 'review_status', 'user_corrected',
  'a correction marks the cluster as corrected');
select is((select name || '/' || feedback_count from public.pain_point_clusters where id = tests.id('c901')),
  'CSV exports time out/1', 'the name and the recomputed statistics are saved');
select is((select removed_by from public.pain_point_evidence where cluster_id = tests.id('c901')
            and feedback_problem_id = (select id from probs where name = 'p2')), tests.id('a3'), 'the removal records its author');
select is((select count(*)::int from public.pain_point_cluster_snapshots where cluster_id = tests.id('c901')), 2, 'history grows');
select is((select action from public.audit_logs where resource_id = tests.id('c901')), 'pain_point_cluster.correct', 'the correction is audited');
select is(public.sor_cluster_correction(tests.id('b1'), tests.id('a3'), tests.id('c901'), null, null,
  '{"review_status": "user_confirmed"}', null, null) ->> 'review_status', 'user_confirmed', 'a user can confirm a cluster');

-- ------------------------------------------------------------ delete and retry
select throws_ok($$select public.sor_delete_pain_point_run(tests.id('b1'), tests.id('a3'), (select run_id from runs where name = 'cat'), null)$$,
  '42501', null, 'only an admin deletes a run');
select throws_ok($$select public.sor_delete_pain_point_run(tests.id('b1'), tests.id('a2'), (select run_id from runs where name = 'set'), null)$$,
  '55000', null, 'a running run cannot be deleted');
select tests.as_owner_role();
update public.job_executions set state = 'completed', terminal_reason = 'completed' where id = (select job_id from runs where name = 'set');
select tests.as_service_role();
select is((select status::text from public.pain_point_runs where id = (select run_id from runs where name = 'set')), 'completed',
  'the run completes with its job');
select throws_ok($$select public.sor_delete_pain_point_run(tests.id('b1'), tests.id('a2'), (select run_id from runs where name = 'set'), null)$$,
  '55000', null, 'clusters used by a generated opportunity block deletion');
select throws_ok($$select * from public.sor_retry_pain_point_run(tests.id('b1'), tests.id('a3'), (select run_id from runs where name = 'set'), 'retry-key-1', repeat('e', 64))$$,
  '55000', null, 'a completed run cannot be retried');
select is((select created from public.sor_retry_pain_point_run(tests.id('b1'), tests.id('a3'), (select run_id from runs where name = 'cat'), 'retry-key-2', repeat('e', 64))),
  true, 'a cancelled run can be retried');
select is((select status::text from public.pain_point_runs where id = (select run_id from runs where name = 'cat')), 'queued',
  'the retried run is queued again');
select tests.as_owner_role();
update public.job_executions set state = 'cancelled', terminal_reason = 'cancelled'
 where id = (select job_execution_id from public.pain_point_runs where id = (select run_id from runs where name = 'cat'));
select tests.as_service_role();
select lives_ok($$select public.sor_delete_pain_point_run(tests.id('b1'), tests.id('a2'), (select run_id from runs where name = 'cat'), null)$$,
  'an admin deletes a finished run');
select is((select count(*)::int from public.pain_point_runs where id = (select run_id from runs where name = 'cat')), 0, 'the run is gone');

select * from finish();
rollback;
