-- Test helpers and fixtures for the pgTAP suite (Implementation Blueprint §14).
-- This file intentionally does NOT roll back: the helpers it creates in the
-- `tests` schema are used by the other test files. It only ever runs against
-- the disposable local/CI test database (`supabase test db`).

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

-- Fixed identifiers keep the test files readable.
--   users:      a1 owner, a2 admin, a3 member, a4 viewer (workspace W1)
--               a5 owner of workspace W2, a6 user without any membership
--   workspaces: b1 (W1), b2 (W2)
--   companies:  c1 (owns P1, P2), c3 (owns P3)
--   products:   d1 P1 active+eligible, d2 P2 candidate, d3 P3 active+excluded,
--               d4 P4 active+needs_review
create or replace function tests.id(p_suffix text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select ('00000000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid
$$;

-- Act as a signed-in user for the rest of the transaction.
create or replace function tests.authenticate_as(p_user uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Act as the anonymous API role.
create or replace function tests.as_anon()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end;
$$;

-- Back to the session user (the migration/test owner).
create or replace function tests.as_owner_role()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'none', true);
end;
$$;

-- Fixtures shared by the test files. Call as the session user, inside the
-- test file's transaction (rolled back at the end of each file).
create or replace function tests.seed()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_source uuid;
begin
  insert into auth.users (id, email) values
    (tests.id('a1'), 'owner@test.local'),
    (tests.id('a2'), 'admin@test.local'),
    (tests.id('a3'), 'member@test.local'),
    (tests.id('a4'), 'viewer@test.local'),
    (tests.id('a5'), 'other-owner@test.local'),
    (tests.id('a6'), 'newcomer@test.local');

  insert into public.workspaces (id, name, created_by) values
    (tests.id('b1'), 'W1', tests.id('a1')),
    (tests.id('b2'), 'W2', tests.id('a5'));
  insert into public.workspace_members (workspace_id, user_id, role) values
    (tests.id('b1'), tests.id('a1'), 'owner'),
    (tests.id('b1'), tests.id('a2'), 'admin'),
    (tests.id('b1'), tests.id('a3'), 'member'),
    (tests.id('b1'), tests.id('a4'), 'viewer'),
    (tests.id('b2'), tests.id('a5'), 'owner');
  insert into public.workspace_settings (workspace_id) values (tests.id('b1')), (tests.id('b2'));

  insert into public.companies (id, name, slug) values
    (tests.id('c1'), 'Company One', 'company-one'),
    (tests.id('c3'), 'Company Three', 'company-three');

  insert into public.saas_products (id, company_id, name, slug, record_status, exclusion_status) values
    (tests.id('d1'), tests.id('c1'), 'Product One', 'product-one', 'active', 'eligible'),
    (tests.id('d2'), tests.id('c1'), 'Product Two', 'product-two', 'candidate', 'unassessed'),
    (tests.id('d3'), tests.id('c3'), 'Product Three', 'product-three', 'active', 'excluded'),
    (tests.id('d4'), tests.id('c3'), 'Product Four', 'product-four', 'active', 'needs_review');

  insert into public.product_categories (product_id, category_id, is_primary)
  select tests.id('d1'), id, true from public.categories where slug = 'marketing-growth-marketing-analytics';

  select id into v_source from public.sources where source_key = 'official_website';
  insert into public.source_records (id, source_id, canonical_url) values
    (tests.id('e1'), v_source, 'https://product-one.test/'),
    (tests.id('e3'), v_source, 'https://product-three.test/');
  insert into public.source_snapshots (id, source_record_id, content_hash, fetch_status) values
    (tests.id('e2'), tests.id('e1'), repeat('a', 64), 'ok'),
    (tests.id('e4'), tests.id('e3'), repeat('b', 64), 'ok');
  insert into public.evidence_items
    (id, product_id, source_snapshot_id, claim_type, claim_text, evidence_type,
     fact_status, reliability_level, extraction_method) values
    (tests.id('f1'), tests.id('d1'), tests.id('e2'), 'feature', 'Has dashboards',
     'official_statement', 'confirmed', 1, 'structured_parse'),
    (tests.id('f3'), tests.id('d3'), tests.id('e4'), 'feature', 'Has payouts',
     'official_statement', 'confirmed', 1, 'structured_parse');
  insert into public.product_features (id, product_id, name, availability, evidence_id) values
    (tests.id('f11'), tests.id('d1'), 'Dashboards', 'available', tests.id('f1')),
    (tests.id('f33'), tests.id('d3'), 'Payouts', 'available', tests.id('f3'));
end;
$$;

select plan(1);
select ok(to_regprocedure('tests.seed()') is not null, 'test helpers are installed');
select * from finish();
