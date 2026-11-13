-- Privilege manifest (Sprint 7, S7.4a; security review): the exact
-- privileges of the browser roles on every object of the exposed schema, and
-- the structural rules of Technical Blueprint §11.2. Any new table, column
-- grant or browser-executable function makes this test fail until it is
-- reviewed and added here on purpose (Implementation Blueprint §12: "every
-- cell is a pgTAP assertion").
begin;
select no_plan();

-- ------------------------------------------------------------ structure
select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity), 0,
  'RLS is enabled on every table of the exposed schema');
select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('v', 'm')), 0,
  'no view in the exposed schema (a view would bypass RLS)');
select is((select count(*)::integer from pg_policies where schemaname = 'public' and cmd = 'ALL'), 0,
  'no FOR ALL policy');
select is((select count(*)::integer from pg_policies where schemaname = 'public' and roles <> '{authenticated}'), 0,
  'every policy is TO authenticated');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public', 'private') and p.prokind = 'f'
              and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
              and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), 0,
  'every function of public and private pins its search_path');
select ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anon cannot reach the private schema');
select ok(not has_schema_privilege('authenticated', 'pgmq', 'USAGE')
          and not has_schema_privilege('anon', 'pgmq', 'USAGE'), 'browser roles cannot reach the queue schema');

-- ------------------------------------------------------------ anon: nothing
select is((select count(*)::integer from information_schema.role_table_grants
            where grantee = 'anon' and table_schema = 'public'), 0, 'anon holds no table privilege');
select is((select count(*)::integer from information_schema.column_privileges
            where grantee = 'anon' and table_schema = 'public'), 0, 'anon holds no column privilege');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public', 'private')
              and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
              and has_function_privilege('anon', p.oid, 'EXECUTE')), 0,
  'anon can execute no function of public or private');

-- ------------------------------------------------------------ authenticated: exact manifest
select is((select string_agg(t || ':' || p, ' ' order by t) from (
    select table_name t, string_agg(privilege_type, ',' order by privilege_type) p
      from information_schema.role_table_grants
     where grantee = 'authenticated' and table_schema = 'public' group by 1) x),
  'analysis_dimension_scores:SELECT '
    || 'analysis_evidence:SELECT '
    || 'analysis_findings:SELECT '
    || 'analysis_subject_products:SELECT '
    || 'catalog_correction_reports:SELECT '
    || 'catalog_field_provenance:SELECT '
    || 'categories:SELECT '
    || 'collection_items:DELETE,INSERT,SELECT '
    || 'collections:DELETE,INSERT,SELECT '
    || 'companies:SELECT '
    || 'company_people:SELECT '
    || 'company_signals:SELECT '
    || 'competitor_links:SELECT '
    || 'customer_feedback:SELECT '
    || 'dimension_score_evidence:SELECT '
    || 'discovery_candidate_evidence:SELECT '
    || 'discovery_candidates:SELECT '
    || 'discovery_runs:SELECT '
    || 'evidence_conflicts:SELECT '
    || 'evidence_items:SELECT '
    || 'external_research_sessions:SELECT '
    || 'finding_evidence:SELECT '
    || 'fx_rates:SELECT '
    || 'generated_opportunities:SELECT '
    || 'generated_opportunity_clusters:SELECT '
    || 'generated_opportunity_products:SELECT '
    || 'market_gap_clusters:SELECT '
    || 'market_gap_evidence:SELECT '
    || 'market_gaps:SELECT '
    || 'opportunity_analyses:SELECT '
    || 'pain_point_cluster_snapshots:SELECT '
    || 'pain_point_clusters:SELECT '
    || 'pain_point_evidence:SELECT '
    || 'pain_point_run_products:SELECT '
    || 'pain_point_runs:SELECT '
    || 'pricing_plans:SELECT '
    || 'product_acquisition_channels:SELECT '
    || 'product_categories:SELECT '
    || 'product_features:SELECT '
    || 'product_integrations:SELECT '
    || 'product_visual_assets:SELECT '
    || 'saas_products:SELECT '
    || 'saved_searches:DELETE,INSERT,SELECT '
    || 'source_records:SELECT '
    || 'source_snapshots:SELECT '
    || 'sources:SELECT '
    || 'tag_assignments:DELETE,INSERT,SELECT '
    || 'tags:DELETE,INSERT,SELECT '
    || 'workspace_members:DELETE,INSERT,SELECT '
    || 'workspace_product_states:DELETE,INSERT,SELECT '
    || 'workspace_settings:SELECT '
    || 'workspaces:SELECT',
  'table privileges of authenticated match the reviewed manifest');

select is((select string_agg(t || '.' || pr || '(' || c || ')', ' ' order by t, pr) from (
    select table_name t, privilege_type pr, string_agg(column_name, ',' order by column_name) c
      from information_schema.column_privileges cp
     where grantee = 'authenticated' and table_schema = 'public' and privilege_type in ('INSERT', 'UPDATE')
       and not exists (select 1 from information_schema.role_table_grants g
                        where g.grantee = 'authenticated' and g.table_schema = 'public'
                          and g.table_name = cp.table_name and g.privilege_type = cp.privilege_type)
     group by 1, 2) x),
  'catalog_correction_reports.INSERT(field_key,message,product_id,report_type,reported_by,workspace_id) '
    || 'collection_items.UPDATE(notes) '
    || 'collections.UPDATE(description,name) '
    || 'generated_opportunities.UPDATE(is_favorite,notes,status) '
    || 'saved_searches.UPDATE(filters,is_pinned,name,search_text,sort_key) '
    || 'tags.UPDATE(color,name) '
    || 'workspace_members.UPDATE(role) '
    || 'workspace_product_states.UPDATE(is_favorite,is_hidden,last_viewed_at,personal_notes,status,updated_by) '
    || 'workspace_settings.UPDATE(ai_preferences,research_preferences,updated_by) '
    || 'workspaces.UPDATE(name)',
  'column-level INSERT/UPDATE grants of authenticated match the reviewed manifest');

select is((select string_agg(n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ' | '
                             order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public', 'private')
              and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
              and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  'private.assert_evidence_for_product(p_evidence_id uuid, p_product_id uuid) | '
    || 'private.can_admin(p_workspace_id uuid) | '
    || 'private.can_edit(p_workspace_id uuid) | '
    || 'private.catalog_channel_matches(p_product_id uuid, p_filter jsonb) | '
    || 'private.catalog_filtered(p_workspace_id uuid, p_plan jsonb) | '
    || 'private.catalog_sort_value(p_sort text, p_seed integer, p_id uuid, p_first_discovered_at timestamp with time zone, p_start_year integer, p_team_size integer, p_monetization_score integer, p_last_activity_at timestamp with time zone, p_text_rank real) | '
    || 'private.has_workspace_role(p_workspace_id uuid, p_roles workspace_role[]) | '
    || 'private.is_visible_company(p_company_id uuid) | '
    || 'private.is_visible_evidence(p_evidence_id uuid) | '
    || 'private.is_visible_product(p_product_id uuid) | '
    || 'private.is_workspace_member(p_workspace_id uuid) | '
    || 'private.refresh_product_search_vector() | '
    || 'private.set_updated_at() | '
    || 'private.trg_category_exclusion_guard() | '
    || 'private.trg_competitor_evidence_scope() | '
    || 'private.trg_evidence_entity_consistency() | '
    || 'private.trg_evidence_scope_product() | '
    || 'private.trg_exclusion_guard() | '
    || 'private.trg_feedback_evidence_consistency() | '
    || 'private.trg_provenance_scope() | '
    || 'private.valid_country_codes(p text[]) | '
    || 'private.visual_rank(p_rights_status text, p_asset_type text) | '
    || 'public.catalog_count(p_workspace_id uuid, p_plan jsonb) | '
    || 'public.catalog_count_v2(p_workspace_id uuid, p_plan jsonb) | '
    || 'public.catalog_discover_metadata(p_product_ids uuid[]) | '
    || 'public.catalog_search(p_workspace_id uuid, p_plan jsonb, p_sort text, p_seed integer, p_after_value numeric, p_after_id uuid, p_limit integer) | '
    || 'public.catalog_search_v2(p_workspace_id uuid, p_plan jsonb, p_sort text, p_seed integer, p_after_value numeric, p_after_id uuid, p_limit integer) | '
    || 'public.create_workspace(p_name text) | '
    || 'public.workspace_member_directory(p_workspace_id uuid)',
  'functions executable by authenticated match the reviewed manifest');

select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prosecdef
              and has_function_privilege('authenticated', p.oid, 'EXECUTE')
              and p.proname not in ('create_workspace', 'workspace_member_directory')), 0,
  'only two security-definer functions are callable from the browser');
select is((select count(*)::integer from information_schema.role_usage_grants
            where grantee in ('anon', 'authenticated') and object_schema = 'public'), 0,
  'browser roles hold no sequence or type usage grant in public');

select * from finish();
rollback;
