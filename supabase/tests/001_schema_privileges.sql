-- Grants, RLS coverage and default privileges (Implementation Blueprint §12, CLAUDE.md §7).
begin;
select no_plan();

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'every table in public has row level security enabled');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (has_table_privilege('anon', c.oid, 'SELECT')
        or has_table_privilege('anon', c.oid, 'INSERT')
        or has_table_privilege('anon', c.oid, 'UPDATE')
        or has_table_privilege('anon', c.oid, 'DELETE')
        or has_any_column_privilege('anon', c.oid, 'SELECT')
        or has_any_column_privilege('anon', c.oid, 'INSERT')
        or has_any_column_privilege('anon', c.oid, 'UPDATE'))),
  0, 'anon has no privilege on any public table');

select is(
  (select count(*)::int from unnest(array[
      'companies','sources','saas_products','categories','product_categories','source_records',
      'source_snapshots','evidence_items','entity_identifiers','catalog_field_provenance',
      'evidence_conflicts','product_features','product_integrations','pricing_plans',
      'company_signals','customer_feedback','competitor_links','product_exclusion_assessments',
      'fx_rates','company_people']) as t(name)
    where has_table_privilege('authenticated', 'public.' || name, 'INSERT')
       or has_table_privilege('authenticated', 'public.' || name, 'UPDATE')
       or has_table_privilege('authenticated', 'public.' || name, 'DELETE')
       or has_table_privilege('authenticated', 'public.' || name, 'TRUNCATE')
       or has_any_column_privilege('authenticated', 'public.' || name, 'INSERT')
       or has_any_column_privilege('authenticated', 'public.' || name, 'UPDATE')),
  0, 'the browser role cannot write the global catalog');

select is(
  (select count(*)::int from unnest(array[
      'entity_identifiers','product_exclusion_assessments','platform_operators','audit_logs',
      'rate_limit_counters','platform_limits','exclusion_rules']) as t(name)
    where has_any_column_privilege('authenticated', 'public.' || name, 'SELECT')
       or has_any_column_privilege('authenticated', 'public.' || name, 'INSERT')
       or has_any_column_privilege('authenticated', 'public.' || name, 'UPDATE')
       or has_table_privilege('authenticated', 'public.' || name, 'DELETE')),
  0, 'server-only tables are invisible to the browser role');

select ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anon cannot use the private schema');

select ok(has_function_privilege('authenticated', 'public.create_workspace(text)', 'EXECUTE'),
  'authenticated users can bootstrap a workspace');
select ok(not has_function_privilege('anon', 'public.create_workspace(text)', 'EXECUTE'),
  'anon cannot bootstrap a workspace');
select ok(not has_function_privilege('authenticated', 'public.sor_transfer_ownership(uuid,uuid,uuid)', 'EXECUTE'),
  'ownership transfer is not callable by the browser role');
select ok(not has_function_privilege('anon', 'public.sor_transfer_ownership(uuid,uuid,uuid)', 'EXECUTE'),
  'ownership transfer is not callable by anon');
select ok(has_function_privilege('service_role', 'public.sor_transfer_ownership(uuid,uuid,uuid)', 'EXECUTE'),
  'ownership transfer is callable by the server role');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0, 'anon cannot execute any function in public');

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and cmd = 'ALL'),
  0, 'no FOR ALL policies');

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and not (roles @> array['authenticated']::name[])),
  0, 'every policy targets the authenticated role only');

-- Default privileges: a table created later by the migration role is not exposed.
create table public.__default_privilege_probe (id int);
select ok(not has_table_privilege('anon', 'public.__default_privilege_probe', 'SELECT'),
  'new public tables are not readable by anon by default');
select ok(not has_table_privilege('authenticated', 'public.__default_privilege_probe', 'SELECT'),
  'new public tables are not readable by authenticated by default');

select * from finish();
rollback;
