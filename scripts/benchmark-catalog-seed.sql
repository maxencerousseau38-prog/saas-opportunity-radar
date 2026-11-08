\set ON_ERROR_STOP on
\if :{?scale}
\else
  \echo 'scale is required'
  \quit 2
\endif
begin;

insert into public.companies (name, slug, website_url, primary_domain, country_code)
select 'Benchmark Company ' || n,
       'sorbench-s75c-co-' || lpad(n::text, 5, '0'),
       'https://company-' || n || '.example.test',
       'company-' || n || '.example.test',
       'US'
  from generate_series(1, :scale::integer) as n;

insert into public.saas_products (
  company_id, name, slug, website_url, primary_domain, tagline,
  short_description, description, record_status, exclusion_status
)
select c.id,
       'Benchmark Automation SaaS ' || n,
       'sorbench-s75c-p-' || lpad(n::text, 5, '0'),
       'https://product-' || n || '.example.test',
       'product-' || n || '.example.test',
       'Benchmark workflow automation for growing teams',
       'Synthetic catalog entry for repeatable performance measurement',
       'Benchmark catalog workload with synthetic SaaS metadata and searchable automation text.',
       'active',
       'eligible'
  from generate_series(1, :scale::integer) as n
  join public.companies c
    on c.slug = 'sorbench-s75c-co-' || lpad(n::text, 5, '0');

analyze public.companies;
analyze public.saas_products;

commit;
