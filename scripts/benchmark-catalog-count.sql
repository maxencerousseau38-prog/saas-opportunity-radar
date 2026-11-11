\set ON_ERROR_STOP on
set role authenticated;

-- Full-scan count query shape, with RLS applied as an authenticated user.
select count(*)
  from private.catalog_filtered(
    null::uuid,
    '{"text":"benchmark automation","current_year":2026}'::jsonb
  );

reset role;
