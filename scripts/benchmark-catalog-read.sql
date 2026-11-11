-- pgbench script (no psql meta-commands: pgbench rejects them; a failing
-- statement is reported as a failed transaction).
set role authenticated;

-- Catalog page query shape, with RLS applied as an authenticated user.
select id
  from private.catalog_filtered(
    null::uuid,
    '{"text":"benchmark automation","current_year":2026}'::jsonb
  )
 order by first_discovered_at desc, id desc
 limit 30;

reset role;
