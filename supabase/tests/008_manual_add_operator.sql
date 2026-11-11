-- Manual add and platform-operator RPCs (Implementation Blueprint §3, §10, §12; PRD §18; ADR-007, ADR-010).
begin;
select no_plan();
select tests.seed();

create function tests.manual_add(p_user uuid, p_url text, p_name text, p_status text,
                                 p_categories jsonb default '[]')
returns jsonb language sql set search_path = '' as $$
  select public.sor_manual_add_product(tests.id('b1'), p_user,
    jsonb_build_object('canonical_url', p_url, 'domain', split_part(split_part(p_url, '://', 2), '/', 1),
                       'name', p_name, 'short_description', 'Declared by a test',
                       'company_name', p_name || ' Inc', 'category_slugs', p_categories),
    jsonb_build_object('status', p_status, 'rule_set_version', 'excl-1', 'matched_rules', '[]'::jsonb))
$$;
grant execute on all functions in schema tests to service_role;

-- ------------------------------------------------------------ privileges
select ok(not has_function_privilege('authenticated', 'public.sor_manual_add_product(uuid,uuid,jsonb,jsonb)', 'EXECUTE'),
  'browsers cannot call the manual-add RPC');
select ok(not has_function_privilege('authenticated',
  'public.sor_operator_exclusion_decision(uuid,uuid,public.exclusion_status,text)', 'EXECUTE'),
  'browsers cannot call the operator exclusion RPC');
select ok(not has_function_privilege('authenticated', 'public.sor_operator_resolve_report(uuid,uuid,text,text)', 'EXECUTE'),
  'browsers cannot call the operator report RPC');
select ok(not has_function_privilege('anon', 'public.catalog_search(uuid,jsonb,text,integer,numeric,uuid,integer)', 'EXECUTE'),
  'anon cannot call catalog_search');

-- ------------------------------------------------------------ manual add
select tests.as_service_role();
select throws_ok($$select tests.manual_add(tests.id('a4'), 'https://viewer.test/', 'Viewer Tool', 'eligible')$$,
  '42501', null, 'a viewer cannot add a product');
select throws_ok($$select tests.manual_add(tests.id('a6'), 'https://outsider.test/', 'Outsider Tool', 'eligible')$$,
  '42501', null, 'a non-member cannot add a product');
select throws_ok($$select tests.manual_add(tests.id('a3'), 'https://unassessed.test/', 'Unassessed', 'unassessed')$$,
  '22023', null, 'a product cannot be added without a classifier outcome');
select throws_ok($$select tests.manual_add(tests.id('a3'), 'ftp://bad.test/', 'Bad URL', 'eligible')$$,
  '22023', null, 'the URL must be http(s)');

select is(tests.manual_add(tests.id('a3'), 'https://new-tool.test/', 'Product One', 'eligible',
                           '["marketing-growth-seo", "excluded-affiliate-marketing", "marketing-growth-email-marketing"]') ->> 'status',
  'created', 'a member can add an eligible product');
select is((select p.record_status::text || '/' || p.exclusion_status::text from public.saas_products p
            where p.website_url = 'https://new-tool.test/'), 'active/eligible',
  'an eligible manual product is active');
select is((select p.slug from public.saas_products p where p.website_url = 'https://new-tool.test/'), 'product-one-2',
  'slugs are made unique');
select is((select array_agg(c.slug::text order by pc.is_primary desc, c.slug)
             from public.product_categories pc join public.categories c on c.id = pc.category_id
             join public.saas_products p on p.id = pc.product_id where p.website_url = 'https://new-tool.test/'),
  array['marketing-growth-seo', 'marketing-growth-email-marketing'],
  'only user-visible categories are kept; the first one is primary');
select is((select e.fact_status::text || '/' || e.evidence_type::text || '/' || e.reliability_level
             from public.evidence_items e join public.saas_products p on p.id = e.product_id
            where p.website_url = 'https://new-tool.test/'), 'declared/user_declared/4',
  'the declaration is stored as declared evidence of reliability 4');
select is((select count(*)::int from public.catalog_field_provenance f join public.saas_products p on p.id = f.product_id
            where p.website_url = 'https://new-tool.test/'), 3, 'name, URL and description carry provenance');
select is((select count(*)::int from public.product_exclusion_assessments a join public.saas_products p on p.id = a.product_id
            where p.website_url = 'https://new-tool.test/' and a.rule_set_version = 'excl-1'), 1,
  'the classifier outcome is recorded');
select is((select count(*)::int from public.audit_logs where action = 'catalog.manual_add'), 1, 'the addition is audited');

select is(tests.manual_add(tests.id('a2'), 'https://new-tool.test/', 'Other name', 'eligible') ->> 'status',
  'existing', 'the same canonical URL returns the existing product');
select is((select count(*)::int from public.saas_products where website_url = 'https://new-tool.test/'), 1,
  'no duplicate product is created');

select is(tests.manual_add(tests.id('a3'), 'https://partners.test/', 'Partner Hub', 'excluded') ->> 'exclusion_status',
  'excluded', 'an excluded product is recorded as excluded');
select is(tests.manual_add(tests.id('a3'), 'https://maybe.test/', 'Maybe Tool', 'needs_review') ->> 'status',
  'created', 'a needs_review product is recorded');

select tests.authenticate_as(tests.id('a3'));
select is((select count(*)::int from public.saas_products where website_url = 'https://new-tool.test/'), 1,
  'the eligible manual product is visible to members');
select is((select count(*)::int from public.saas_products
            where website_url in ('https://partners.test/', 'https://maybe.test/')), 0,
  'excluded and needs_review manual products stay hidden');
select throws_ok($$select count(*) from public.entity_identifiers$$, '42501', null, 'identifiers stay server-only');

-- ------------------------------------------------------------ operator: exclusion review
select tests.as_owner_role();
insert into public.platform_operators (user_id, note) values (tests.id('a1'), 'product owner (PD-12)');

select tests.as_service_role();
select throws_ok($$select public.sor_operator_exclusion_decision(tests.id('a3'), tests.id('d4'), 'eligible', 'ok')$$,
  '42501', null, 'a non-operator cannot resolve a review');
select throws_ok($$select public.sor_operator_exclusion_decision(tests.id('a1'), tests.id('d4'), 'eligible', '  ')$$,
  '22023', null, 'a reason is required');
select throws_ok($$select public.sor_operator_exclusion_decision(tests.id('a1'), tests.id('d4'), 'needs_review', 'x')$$,
  '22023', null, 'the decision is eligible or excluded');
select throws_ok($$select public.sor_operator_exclusion_decision(tests.id('a1'), tests.id('d3'), 'eligible', 'x')$$,
  '55000', null, 'a rule-based exclusion cannot be overridden');
select throws_ok($$select public.sor_operator_exclusion_decision(tests.id('a1'), tests.id('ffff'), 'eligible', 'x')$$,
  'P0002', null, 'unknown product');
select lives_ok($$select public.sor_operator_exclusion_decision(tests.id('a1'), tests.id('d4'), 'eligible',
                    'Core purpose is invoicing; partner mention is incidental')$$,
  'the operator resolves a needs_review product');
select is((select count(*)::int from public.product_exclusion_assessments
            where product_id = tests.id('d4') and decided_by = 'platform_operator' and operator_user_id = tests.id('a1')),
  1, 'the operator decision is recorded with its author');
select is((select count(*)::int from public.audit_logs where action = 'catalog.exclusion_decision'), 1,
  'the operator decision is audited');
select tests.authenticate_as(tests.id('a3'));
select is((select count(*)::int from public.saas_products where id = tests.id('d4')), 1,
  'the resolved product becomes visible');

-- ------------------------------------------------------------ operator: correction reports
select tests.as_owner_role();
insert into public.catalog_correction_reports (id, workspace_id, product_id, reported_by, report_type, message)
  values (tests.id('9901'), tests.id('b1'), tests.id('d1'), tests.id('a3'), 'incorrect_information', 'Wrong price');
select tests.as_service_role();
select throws_ok($$select public.sor_operator_resolve_report(tests.id('a3'), tests.id('9901'), 'accepted', null)$$,
  '42501', null, 'a non-operator cannot resolve a report');
select throws_ok($$select public.sor_operator_resolve_report(tests.id('a1'), tests.id('9901'), 'open', null)$$,
  '22023', null, 'the resolution is accepted or rejected');
select lives_ok($$select public.sor_operator_resolve_report(tests.id('a1'), tests.id('9901'), 'accepted', 'Fixed')$$,
  'the operator resolves a report');
select is((select status || '/' || resolution_note from public.catalog_correction_reports where id = tests.id('9901')),
  'accepted/Fixed', 'the resolution is stored');
select throws_ok($$select public.sor_operator_resolve_report(tests.id('a1'), tests.id('9901'), 'rejected', null)$$,
  '55000', null, 'a resolved report cannot be resolved again');

select * from finish();
rollback;
