-- Catalog RLS: only active + eligible products and their dependent rows are visible.
begin;
select no_plan();
select tests.seed();

select tests.authenticate_as(tests.id('a6'));

select ok(exists (select 1 from public.saas_products where id = tests.id('d1')),
  'an active eligible product is visible');
select ok(not exists (select 1 from public.saas_products where id = tests.id('d2')),
  'a candidate product is hidden');
select ok(not exists (select 1 from public.saas_products where id = tests.id('d3')),
  'an excluded product is hidden');
select ok(not exists (select 1 from public.saas_products where id = tests.id('d4')),
  'a product under exclusion review is hidden');

select ok(exists (select 1 from public.product_features where id = tests.id('f11')),
  'features of a visible product are visible');
select ok(not exists (select 1 from public.product_features where id = tests.id('f33')),
  'features of an excluded product are hidden');
select ok(exists (select 1 from public.evidence_items where id = tests.id('f1')),
  'evidence of a visible product is visible');
select ok(not exists (select 1 from public.evidence_items where id = tests.id('f3')),
  'evidence of an excluded product is hidden');
select ok(exists (select 1 from public.source_snapshots where id = tests.id('e2')),
  'snapshots behind visible evidence are visible');
select ok(not exists (select 1 from public.source_snapshots where id = tests.id('e4')),
  'snapshots behind hidden evidence are hidden');
select ok(exists (select 1 from public.source_records where id = tests.id('e1')),
  'source records behind visible evidence are visible');
select ok(not exists (select 1 from public.source_records where id = tests.id('e3')),
  'source records behind hidden evidence are hidden');
select ok(exists (select 1 from public.companies where id = tests.id('c1')),
  'a company with a visible product is visible');
select ok(not exists (select 1 from public.companies where id = tests.id('c3')),
  'a company without any visible product is hidden');
select is((select count(*)::int from public.categories where is_permanently_excluded), 0,
  'permanently excluded categories are never visible');
select is((select count(*)::int from public.categories where parent_id is null
             and slug in ('marketing-growth','sales-crm','data-analytics','automation-ai',
                          'business-operations','ecommerce','developer-tools')), 7,
  'the seven PRD parent categories are visible (others may be added, PRD §4.2.E)');

select throws_ok($$select * from public.entity_identifiers$$, '42501', null,
  'identity data is server-only');
select throws_ok($$update public.saas_products set name = 'x' where id = tests.id('d1')$$, '42501', null,
  'the browser role cannot update the catalog');

select tests.as_anon();
select throws_ok($$select * from public.saas_products$$, '42501', null,
  'anon cannot read the catalog');

select * from finish();
rollback;
