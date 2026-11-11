\set ON_ERROR_STOP on

-- Two independent baselines: row count plus a fingerprint of every column in
-- each row. JSONB serialization includes nullable and newly added columns.
with outside_products as (
  select p.id, md5(to_jsonb(p)::text) as row_fingerprint
    from public.saas_products as p
   where p.slug not like 'sorbench-s75c-p-%'
)
select count(*)::integer,
       coalesce(md5(string_agg(row_fingerprint, E'\n' order by id)), md5(''))
  from outside_products;

with outside_companies as (
  select c.id, md5(to_jsonb(c)::text) as row_fingerprint
    from public.companies as c
   where c.slug not like 'sorbench-s75c-co-%'
)
select count(*)::integer,
       coalesce(md5(string_agg(row_fingerprint, E'\n' order by id)), md5(''))
  from outside_companies;
