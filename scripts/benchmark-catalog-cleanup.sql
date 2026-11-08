\set ON_ERROR_STOP on

begin;

-- Refuse to delete a benchmark product if any row in any FK-dependent table
-- still references it. This blocks CASCADE, SET NULL and indirect changes too.
-- Child fixture rows are never deleted manually; the harness must explicitly
-- handle them before a parent cleanup (the current fixture schema has none).
do $$
declare
  fk record;
  dependent_rows bigint;
  delete_trigger text;
begin
  select format('%I.%I (%I)', trigger_ns.nspname, trigger_rel.relname, trigger_row.tgname)
    into delete_trigger
    from pg_trigger as trigger_row
    join pg_class as trigger_rel on trigger_rel.oid = trigger_row.tgrelid
    join pg_namespace as trigger_ns on trigger_ns.oid = trigger_rel.relnamespace
   where trigger_row.tgrelid = 'public.saas_products'::regclass
     and (trigger_row.tgtype & 8) <> 0
     and not trigger_row.tgisinternal
     and trigger_row.tgenabled <> 'D'
   limit 1;
  if delete_trigger is not null then
    raise exception 'Refusing fixture product cleanup: enabled DELETE trigger % could have indirect effects', delete_trigger;
  end if;

  for fk in
    select child_ns.nspname as child_schema,
           child_rel.relname as child_table,
           constraint_row.conname as constraint_name,
           (
             select string_agg(
                      format('child.%I = parent.%I', child_att.attname, parent_att.attname),
                      ' AND ' order by key_columns.ordinality
                    )
               from unnest(constraint_row.conkey, constraint_row.confkey)
                    with ordinality as key_columns(child_attnum, parent_attnum, ordinality)
               join pg_attribute as child_att
                 on child_att.attrelid = constraint_row.conrelid
                and child_att.attnum = key_columns.child_attnum
               join pg_attribute as parent_att
                 on parent_att.attrelid = constraint_row.confrelid
                and parent_att.attnum = key_columns.parent_attnum
           ) as join_predicate
      from pg_constraint as constraint_row
      join pg_class as child_rel on child_rel.oid = constraint_row.conrelid
      join pg_namespace as child_ns on child_ns.oid = child_rel.relnamespace
     where constraint_row.contype = 'f'
       and constraint_row.confrelid = 'public.saas_products'::regclass
  loop
    execute format(
      'select count(*) from %I.%I as child join public.saas_products as parent on %s where parent.slug like %L',
      fk.child_schema, fk.child_table, fk.join_predicate, 'sorbench-s75c-p-%'
    ) into dependent_rows;
    if dependent_rows > 0 then
      raise exception 'Refusing fixture product cleanup: FK %.% (%), % dependent rows remain',
        fk.child_schema, fk.child_table, fk.constraint_name, dependent_rows;
    end if;
  end loop;
end
$$;

with deleted as (
  delete from public.saas_products
   where slug like 'sorbench-s75c-p-%'
   returning 1
)
select count(*)::integer from deleted;

-- Product fixture rows are explicitly removed first. Before deleting fixture
-- companies, reject every other remaining FK reference, including indirect
-- cascade or SET NULL paths. No dependent table is modified by this script.
do $$
declare
  fk record;
  dependent_rows bigint;
  delete_trigger text;
begin
  select format('%I.%I (%I)', trigger_ns.nspname, trigger_rel.relname, trigger_row.tgname)
    into delete_trigger
    from pg_trigger as trigger_row
    join pg_class as trigger_rel on trigger_rel.oid = trigger_row.tgrelid
    join pg_namespace as trigger_ns on trigger_ns.oid = trigger_rel.relnamespace
   where trigger_row.tgrelid = 'public.companies'::regclass
     and (trigger_row.tgtype & 8) <> 0
     and not trigger_row.tgisinternal
     and trigger_row.tgenabled <> 'D'
   limit 1;
  if delete_trigger is not null then
    raise exception 'Refusing fixture company cleanup: enabled DELETE trigger % could have indirect effects', delete_trigger;
  end if;

  for fk in
    select child_ns.nspname as child_schema,
           child_rel.relname as child_table,
           constraint_row.conname as constraint_name,
           (
             select string_agg(
                      format('child.%I = parent.%I', child_att.attname, parent_att.attname),
                      ' AND ' order by key_columns.ordinality
                    )
               from unnest(constraint_row.conkey, constraint_row.confkey)
                    with ordinality as key_columns(child_attnum, parent_attnum, ordinality)
               join pg_attribute as child_att
                 on child_att.attrelid = constraint_row.conrelid
                and child_att.attnum = key_columns.child_attnum
               join pg_attribute as parent_att
                 on parent_att.attrelid = constraint_row.confrelid
                and parent_att.attnum = key_columns.parent_attnum
           ) as join_predicate
      from pg_constraint as constraint_row
      join pg_class as child_rel on child_rel.oid = constraint_row.conrelid
      join pg_namespace as child_ns on child_ns.oid = child_rel.relnamespace
     where constraint_row.contype = 'f'
       and constraint_row.confrelid = 'public.companies'::regclass
  loop
    execute format(
      'select count(*) from %I.%I as child join public.companies as parent on %s where parent.slug like %L',
      fk.child_schema, fk.child_table, fk.join_predicate, 'sorbench-s75c-co-%'
    ) into dependent_rows;
    if dependent_rows > 0 then
      raise exception 'Refusing fixture company cleanup: FK %.% (%), % dependent rows remain',
        fk.child_schema, fk.child_table, fk.constraint_name, dependent_rows;
    end if;
  end loop;
end
$$;

with deleted as (
  delete from public.companies
   where slug like 'sorbench-s75c-co-%'
   returning 1
)
select count(*)::integer from deleted;

select (select count(*) from public.saas_products where slug like 'sorbench-s75c-p-%')::integer,
       (select count(*) from public.companies where slug like 'sorbench-s75c-co-%')::integer;

commit;
