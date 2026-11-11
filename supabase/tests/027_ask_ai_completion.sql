-- S8.4 Ask AI completion: category and Pain Point Cluster subjects and the
-- discovery, customer voice and opportunity analysis strategies are accepted;
-- unknown values are still refused; grants are unchanged (server writes only).
begin;
select no_plan();
select tests.seed();

select ok(not has_table_privilege('authenticated', 'public.external_research_sessions', 'INSERT')
          and not has_table_privilege('authenticated', 'public.external_research_sessions', 'UPDATE')
          and not has_table_privilege('authenticated', 'public.external_research_sessions', 'DELETE'),
  'browser roles still cannot write external research directly');

create function tests.research(p_subject text, p_strategy text) returns void
language sql set search_path = '' as $$
  insert into public.external_research_sessions
    (workspace_id, created_by, subject_type, subject_snapshot, destination, strategy,
     context_version, context_json, prompt_version, prompt_text)
  values (tests.id('b1'), tests.id('a3'), p_subject, jsonb_build_object('label', 'Synthetic'),
          'perplexity', p_strategy, 'sor-context.v2', '{}', 'sor-prompt.v2', 'Synthetic prompt')
$$;
grant execute on function tests.research(text, text) to service_role;
select tests.as_service_role();

select lives_ok($$select tests.research('category', 'saas_discovery')$$,
  'a category subject with the SaaS discovery strategy is accepted');
select lives_ok($$select tests.research('pain_point_cluster', 'customer_voice')$$,
  'a Pain Point Cluster subject with the customer voice strategy is accepted');
select lives_ok($$select tests.research('product_set', 'opportunity_analysis')$$,
  'the opportunity analysis strategy is accepted');
select lives_ok($$select tests.research('product', 'better_alternative')$$,
  'existing subjects and strategies stay valid');
select throws_ok($$select tests.research('market', 'customer_voice')$$, '23514', null,
  'an unknown subject type is refused');
select throws_ok($$select tests.research('category', 'auto_build')$$, '23514', null,
  'an unknown strategy is refused');

select * from finish();
rollback;
