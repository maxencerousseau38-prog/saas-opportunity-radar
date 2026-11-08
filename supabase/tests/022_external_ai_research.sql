-- Ask AI research notes are private to workspace members and server-written.
begin;
select no_plan();
select tests.seed();

select ok(has_table_privilege('authenticated', 'public.external_research_sessions', 'SELECT'),
  'workspace members can read external research through RLS');
select ok(not has_table_privilege('anon', 'public.external_research_sessions', 'SELECT'),
  'anonymous users cannot read research');
select ok(not has_table_privilege('authenticated', 'public.external_research_sessions', 'INSERT')
          and not has_table_privilege('authenticated', 'public.external_research_sessions', 'UPDATE')
          and not has_table_privilege('authenticated', 'public.external_research_sessions', 'DELETE'),
  'browser roles cannot write external research directly');
select ok(has_table_privilege('service_role', 'public.external_research_sessions', 'INSERT')
          and has_table_privilege('service_role', 'public.external_research_sessions', 'UPDATE')
          and has_table_privilege('service_role', 'public.external_research_sessions', 'DELETE'),
  'server routes can persist research after workspace authorization');

select tests.as_service_role();
insert into public.external_research_sessions
  (id, workspace_id, created_by, subject_type, subject_snapshot, destination, strategy,
   included_sections, context_version, context_json, prompt_version, prompt_text)
values
  (tests.id('r1'), tests.id('b1'), tests.id('a3'), 'product',
   jsonb_build_object('product_ids', jsonb_build_array(tests.id('d1')), 'label', 'Product One'),
   'claude', 'better_alternative', array['features'], 'sor-context.v1',
   jsonb_build_object('evidence_index', jsonb_build_array()), 'sor-prompt.v1', 'Research prompt');

select tests.authenticate_as(tests.id('a3'));
select is((select count(*)::int from public.external_research_sessions), 1,
  'a member sees research in their workspace');
select tests.authenticate_as(tests.id('a5'));
select is((select count(*)::int from public.external_research_sessions), 0,
  'a different workspace cannot see the research');
select tests.as_anon();
select throws_ok($$select * from public.external_research_sessions$$, '42501', null,
  'anonymous role cannot query research');

select tests.as_service_role();
select throws_ok($$insert into public.external_research_sessions
  (workspace_id, created_by, subject_type, subject_snapshot, destination, strategy,
   context_version, context_json, prompt_version, prompt_text, status, answer_text)
  values (tests.id('b1'), tests.id('a3'), 'product', '{}', 'claude', 'red_team',
   'sor-context.v1', '{}', 'sor-prompt.v1', 'prompt', 'prompt_ready', 'answer')$$,
  '23514', null, 'a draft cannot carry an imported answer');

select * from finish();
rollback;
