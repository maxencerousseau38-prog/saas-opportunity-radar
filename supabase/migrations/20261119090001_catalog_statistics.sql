-- First bulk catalog collection: planner statistics after a bulk load
-- (10 November 2026). Measured in CI as a viewer with 8,527 real products
-- loaded a moment earlier: Discover's search and count took 24.7 s each and
-- hit the 8 s statement timeout of the browser role, because the tables had
-- the statistics of a 6-product catalog (autovacuum had not analysed them
-- yet) and the planner chose nested scans. After ANALYZE the same search
-- takes 0.7 s on a local PostgreSQL. The catalog ingester calls this after
-- each load. Service role only; ANALYZE is read-only for the data.
create or replace function public.sor_catalog_refresh_statistics()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  analyze public.saas_products, public.companies, public.product_categories, public.evidence_items,
          public.source_records, public.source_snapshots, public.entity_identifiers,
          public.catalog_field_provenance, public.product_exclusion_assessments;
end;
$$;

revoke all on function public.sor_catalog_refresh_statistics() from public, anon, authenticated;
grant execute on function public.sor_catalog_refresh_statistics() to service_role;
