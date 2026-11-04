-- Evidence pipeline write RPCs (Sprint 3): snapshots, enrichment application,
-- CSV product and feedback imports. All server-only, atomic and idempotent.
begin;
select no_plan();
select tests.seed();

select ok(not has_function_privilege('authenticated', 'public.sor_apply_enrichment(uuid,uuid,uuid,jsonb)', 'EXECUTE'),
  'browsers cannot apply enrichment');
select ok(not has_function_privilege('authenticated',
  'public.sor_record_snapshot(text,text,text,text,text,public.fetch_status,integer,timestamptz,timestamptz,public.content_storage_status,jsonb)', 'EXECUTE'),
  'browsers cannot record snapshots');
select is((select integration_status::text || '/' || is_enabled from public.sources where source_key = 'official_website'),
  'integrated/true', 'the official-website connector is integrated');

-- Fixtures: a running enrichment job with one step, a running import job each.
select tests.as_owner_role();
update public.saas_products set website_url = 'https://product-one.test/' where id = tests.id('d1');
insert into public.job_executions (id, job_kind, workspace_id, requested_by, idempotency_key, request_hash, payload,
                                   state, lease_owner, lease_expires_at, attempt_count)
values
  (tests.id('ab1'), 'product_enrichment', tests.id('b1'), tests.id('a3'), 'enrich-key-1', repeat('a', 64),
   jsonb_build_object('product_id', tests.id('d1')), 'running', 'w', now() + interval '1 minute', 1),
  (tests.id('ab2'), 'catalog_import', tests.id('b1'), tests.id('a3'), 'import-key-1', repeat('b', 64),
   '{"rows": [{}]}', 'running', 'w', now() + interval '1 minute', 1),
  (tests.id('ab3'), 'feedback_import', tests.id('b1'), tests.id('a3'), 'feedback-key-1', repeat('c', 64),
   '{"rows": [{}], "rights_declaration": {}}', 'running', 'w', now() + interval '1 minute', 1),
  (tests.id('ab4'), 'catalog_import', tests.id('b1'), tests.id('a3'), 'import-key-2', repeat('d', 64),
   '{"rows": [{}]}', 'queued', null, null, 1);
update public.job_executions set state = 'completed', terminal_reason = 'completed' where id = tests.id('ab4');
insert into public.agent_step_runs (id, job_execution_id, agent_key, step_key, contract_version, state)
values (tests.id('5101'), tests.id('ab1'), 'D6', 'verify', 'enrichment.v1', 'running'),
       (tests.id('5102'), tests.id('ab2'), 'D6', 'verify', 'enrichment.v1', 'running');

-- ------------------------------------------------------------ snapshots
select tests.as_service_role();
create temporary table snap (name text primary key, id uuid) on commit drop;
grant all on snap to service_role;
insert into snap select 'home', public.sor_record_snapshot('official_website', 'https://product-one.test/', null, 'Home',
  repeat('1', 64), 'ok', 200, null, now(), 'stored_excerpt', '{}');
select is(public.sor_record_snapshot('official_website', 'https://product-one.test/', null, 'Home', repeat('1', 64), 'ok', 200,
  null, now(), 'stored_excerpt', '{}'), (select id from snap where name = 'home'), 'the same content hash reuses the snapshot');
select ok(public.sor_record_snapshot('official_website', 'https://product-one.test/', null, 'Home', repeat('2', 64), 'ok', 200,
  null, now(), 'stored_excerpt', '{}') <> (select id from snap where name = 'home'), 'changed content creates a new snapshot');
select throws_ok($$select public.sor_record_snapshot('g2', 'https://g2.test/x', null, null, repeat('3', 64), 'ok', 200, null, now(), 'reference_only', '{}')$$,
  '22023', null, 'a source that is not integrated cannot record snapshots');

-- ------------------------------------------------------------ enrichment
create temporary table plan (p jsonb) on commit drop;
grant all on plan to service_role;
insert into plan values (jsonb_build_object(
  'evidence', jsonb_build_array(
    jsonb_build_object('key', 'tag', 'source_snapshot_id', (select id from snap where name = 'home'), 'claim_type', 'product_description',
      'claim_text', 'Dashboards for agencies', 'claim_value', jsonb_build_object('quote', 'Dashboards for agencies'),
      'evidence_type', 'official_statement', 'fact_status', 'confirmed', 'reliability_level', 1,
      'verification_status', 'verified', 'verified_at', now()),
    jsonb_build_object('key', 'tag2', 'source_snapshot_id', (select id from snap where name = 'home'), 'claim_type', 'product_description',
      'claim_text', 'Analytics for shops', 'evidence_type', 'official_statement', 'fact_status', 'confirmed',
      'reliability_level', 1, 'verification_status', 'unverified'),
    jsonb_build_object('key', 'price', 'source_snapshot_id', (select id from snap where name = 'home'), 'claim_type', 'pricing',
      'claim_text', 'Starter 19 EUR per month', 'evidence_type', 'pricing_evidence', 'fact_status', 'confirmed',
      'monetization_signal', 'paid_plan_available', 'reliability_level', 1, 'verification_status', 'verified', 'verified_at', now()),
    jsonb_build_object('key', 'feat', 'source_snapshot_id', (select id from snap where name = 'home'), 'claim_type', 'feature',
      'claim_text', 'Dashboards', 'evidence_type', 'official_statement', 'fact_status', 'confirmed', 'reliability_level', 1,
      'verification_status', 'verified', 'verified_at', now()),
    jsonb_build_object('key', 'founded', 'company_scope', true, 'source_snapshot_id', (select id from snap where name = 'home'),
      'claim_type', 'founding_year', 'claim_text', 'Founded in 2018', 'evidence_type', 'official_statement',
      'fact_status', 'declared', 'reliability_level', 1, 'verification_status', 'verified', 'verified_at', now())),
  'product_fields', jsonb_build_object(
    'tagline', jsonb_build_object('value', 'Dashboards for agencies', 'evidence_key', 'tag', 'fact_status', 'confirmed'),
    'billing_models', jsonb_build_object('value', jsonb_build_array('monthly_subscription'), 'evidence_key', 'price', 'fact_status', 'confirmed')),
  'company_fields', jsonb_build_object(
    'founded_year', jsonb_build_object('value', 2018, 'evidence_key', 'founded', 'fact_status', 'declared')),
  'features', jsonb_build_array(jsonb_build_object('name', 'dashboards', 'availability', 'available', 'evidence_key', 'feat', 'is_primary', true),
                                jsonb_build_object('name', 'Exports', 'availability', 'available', 'evidence_key', 'feat')),
  'pricing_plans', jsonb_build_array(jsonb_build_object('plan_name', 'Starter', 'billing_period', 'month', 'price_amount', 19,
                                                        'currency', 'eur', 'is_entry_plan', true, 'evidence_key', 'price')),
  'conflicts', jsonb_build_array(jsonb_build_object('a', 'tag', 'b', 'tag2', 'field_key', 'tagline')),
  'exclusion', jsonb_build_object('status', 'eligible', 'rule_set_version', 'excl-1', 'matched_rules', '[]'::jsonb)));

select throws_ok($$select public.sor_apply_enrichment(tests.id('ab1'), tests.id('5102'), tests.id('d1'), (select p from plan))$$,
  '22023', null, 'a step of another job cannot apply evidence');
select throws_ok($$select public.sor_apply_enrichment(tests.id('ab1'), tests.id('5101'), tests.id('d1'),
                    jsonb_build_object('product_fields', jsonb_build_object('exclusion_status', jsonb_build_object('value', 'eligible', 'evidence_id', tests.id('f1'), 'fact_status', 'confirmed'))))$$,
  '22023', null, 'protected columns cannot be written');
select throws_ok($$select public.sor_apply_enrichment(tests.id('ab1'), tests.id('5101'), tests.id('d1'),
                    jsonb_build_object('evidence', jsonb_build_array(jsonb_build_object('key', 'x', 'source_snapshot_id', tests.id('9999'),
                      'claim_type', 'feature', 'claim_text', 'x', 'evidence_type', 'official_statement', 'fact_status', 'confirmed',
                      'reliability_level', 1, 'verification_status', 'unverified'))))$$,
  '23514', null, 'evidence must cite a recorded snapshot');
select is(public.sor_apply_enrichment(tests.id('ab1'), tests.id('5101'), tests.id('d1'), (select p from plan)) ->> 'status',
  'applied', 'a verified plan is applied');
select is((select tagline || '/' || array_to_string(billing_models, ',') from public.saas_products where id = tests.id('d1')),
  'Dashboards for agencies/monthly_subscription', 'selected values are written');
select is((select founded_year from public.companies where id = tests.id('c1')), 2018, 'company values are written');
select is((select count(*)::int from public.catalog_field_provenance where product_id = tests.id('d1') and field_key = 'tagline' and is_current),
  1, 'each field has one current provenance row');
select is((select count(*)::int from public.evidence_items where extracted_by_step_id = tests.id('5101')), 5,
  'evidence is linked to its agent step');
select is((select count(*)::int from public.product_features where product_id = tests.id('d1')), 2,
  'features are upserted by name (existing "Dashboards" reused)');
select is((select count(*)::int from public.pricing_plans where product_id = tests.id('d1') and superseded_at is null), 1,
  'one current pricing plan');
select is((select currency::text from public.pricing_plans where product_id = tests.id('d1') and superseded_at is null), 'EUR',
  'currency codes are upper-cased');
select is((select count(*)::int from public.evidence_conflicts where product_id = tests.id('d1')), 1,
  'contradictory claims are recorded, not overwritten');
select is(public.sor_apply_enrichment(tests.id('ab1'), tests.id('5101'), tests.id('d1'), (select p from plan)) ->> 'status',
  'already_applied', 'a redelivered step does not duplicate evidence');
select is((select count(*)::int from public.evidence_items where extracted_by_step_id = tests.id('5101')), 5, 'still five');

-- Re-classification is only ever stricter.
select tests.as_owner_role();
insert into public.agent_step_runs (id, job_execution_id, agent_key, step_key, contract_version, state)
values (tests.id('5103'), tests.id('ab1'), 'D6', 'verify-2', 'enrichment.v1', 'running');
select tests.as_service_role();
select is(public.sor_apply_enrichment(tests.id('ab1'), tests.id('5103'), tests.id('d1'),
  jsonb_build_object('exclusion', jsonb_build_object('status', 'needs_review', 'rule_set_version', 'excl-1'))) ->> 'status',
  'applied', 'a new classifier outcome is recorded');
select is((select exclusion_status::text from public.saas_products where id = tests.id('d1')), 'needs_review',
  'an eligible product whose core texts became ambiguous goes to review');

-- ------------------------------------------------------------ product import
select throws_ok($$select public.sor_import_product_row(tests.id('ab4'), 0, '{}'::jsonb, '{"outcome": "new"}'::jsonb, '{"status": "eligible"}'::jsonb)$$,
  '55000', null, 'a finished import cannot write rows');
select is(public.sor_import_product_row(tests.id('ab2'), 0,
  jsonb_build_object('name', 'Imported Tool', 'canonical_url', 'https://imported.test', 'domain', 'imported.test',
                     'company_name', 'Imported Inc', 'country_code', 'DE', 'employee_min', 2, 'employee_max', 4,
                     'category_slugs', jsonb_build_array('marketing-growth-seo')),
  '{"outcome": "new"}'::jsonb, '{"status": "eligible", "rule_set_version": "excl-1"}'::jsonb) ->> 'status',
  'created', 'an imported row creates a product');
select is((select p.record_status::text || '/' || c.country_code || '/' || c.employee_max from public.saas_products p
            join public.companies c on c.id = p.company_id where p.website_url = 'https://imported.test'),
  'active/DE/4', 'with its company data');
select is((select e.fact_status::text || '/' || e.reliability_level from public.evidence_items e
            join public.saas_products p on p.id = e.product_id where p.website_url = 'https://imported.test'),
  'declared/4', 'imported data is declared evidence of reliability 4');
select is(public.sor_import_product_row(tests.id('ab2'), 0,
  jsonb_build_object('name', 'Imported Tool', 'canonical_url', 'https://imported.test', 'domain', 'imported.test'),
  '{"outcome": "new"}'::jsonb, '{"status": "eligible"}'::jsonb) ->> 'status',
  'matched_existing', 'replaying a row finds the existing product');
select is((select count(*)::int from public.saas_products where website_url = 'https://imported.test'), 1, 'no duplicate');

-- ------------------------------------------------------------ feedback import
select throws_ok($$select public.sor_import_feedback_row(tests.id('ab3'), tests.id('d3'), '{}'::jsonb)$$,
  '23514', null, 'feedback cannot be attached to an excluded product');
select tests.as_owner_role();
update public.saas_products set exclusion_status = 'eligible' where id = tests.id('d1');
select tests.as_service_role();
select is(public.sor_import_feedback_row(tests.id('ab3'), tests.id('d1'),
  jsonb_build_object('source_url', 'https://reviews.test/r/1', 'source_name', 'Review site', 'text', 'Too expensive',
                     'rating', 2, 'rating_scale_max', 5, 'content_storage_status', 'reference_only',
                     'deduplication_hash', repeat('f', 64), 'author_reference_hash', null, 'rights_basis', 'Exported from our own survey'))
  ->> 'status', 'created', 'a feedback row is imported');
select is((select coalesce(original_text, '(none)') || '/' || content_storage_status::text from public.customer_feedback
            where deduplication_hash = repeat('f', 64)), '(none)/reference_only',
  'reference-only rights store no text');
select is(public.sor_import_feedback_row(tests.id('ab3'), tests.id('d1'),
  jsonb_build_object('source_url', 'https://reviews.test/r/1', 'source_name', 'Review site', 'text', 'Too expensive',
                     'content_storage_status', 'reference_only', 'deduplication_hash', repeat('f', 64)))
  ->> 'status', 'duplicate', 'a duplicate review is counted once');

select * from finish();
rollback;
