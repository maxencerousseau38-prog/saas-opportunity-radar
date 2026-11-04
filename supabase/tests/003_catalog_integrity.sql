-- Integrity triggers and checks on the global catalog (server-side writes).
begin;
select no_plan();
select tests.seed();

select lives_ok(
  $$insert into public.product_features (product_id, name, availability, evidence_id)
    values (tests.id('d1'), 'Alerts', 'available', tests.id('f1'))$$,
  'a feature backed by its own product evidence is accepted');
select throws_ok(
  $$insert into public.product_features (product_id, name, availability, evidence_id)
    values (tests.id('d1'), 'Payouts copy', 'available', tests.id('f3'))$$,
  '23514', null, 'a feature cannot cite evidence of another product');
select throws_ok(
  $$insert into public.product_features (product_id, name, availability)
    values (tests.id('d1'), 'Unproven', 'available')$$,
  '23514', null, 'an availability claim needs evidence');
select lives_ok(
  $$insert into public.product_features (product_id, name, availability)
    values (tests.id('d1'), 'Maybe', 'not_observed')$$,
  'a feature not found is recorded as not_observed without evidence');
select throws_ok(
  $$insert into public.pricing_plans (product_id, plan_name, evidence_id)
    values (tests.id('d1'), 'Pro', tests.id('f3'))$$,
  '23514', null, 'a pricing plan cannot cite evidence of another product');
select throws_ok(
  $$insert into public.competitor_links (product_id, competitor_product_id, relationship_type, evidence_id)
    values (tests.id('d1'), tests.id('d2'), 'direct', tests.id('f3'))$$,
  '23514', null, 'a competitor link cannot cite unrelated evidence');
select throws_ok(
  $$insert into public.evidence_items (product_id, company_id, source_snapshot_id, claim_type, claim_text,
      evidence_type, fact_status, reliability_level, extraction_method)
    values (tests.id('d1'), tests.id('c3'), tests.id('e2'), 'other', 'x', 'official_statement',
      'confirmed', 1, 'structured_parse')$$,
  '23514', null, 'evidence cannot pair a product with another company');
select throws_ok(
  $$insert into public.evidence_items (product_id, source_snapshot_id, claim_type, claim_text,
      evidence_type, fact_status, reliability_level, extraction_method)
    values (tests.id('d1'), tests.id('e2'), 'traffic', 'x', 'public_metric', 'confirmed', 4, 'structured_parse')$$,
  '23514', null, 'traffic is always an estimate');
select throws_ok(
  $$insert into public.evidence_items (product_id, source_snapshot_id, claim_type, claim_text,
      evidence_type, fact_status, monetization_signal, reliability_level, extraction_method)
    values (tests.id('d1'), tests.id('e2'), 'paid_customer_signal', 'x', 'customer_review',
      'declared', 'payment_confirmed', 3, 'llm_extraction')$$,
  '23514', null, 'a community source cannot confirm a payment');
select throws_ok(
  $$insert into public.customer_feedback (product_id, source_snapshot_id, evidence_item_id,
      content_storage_status, deduplication_hash)
    values (tests.id('d1'), tests.id('e2'), tests.id('f1'), 'reference_only', 'h1')$$,
  '23514', null, 'customer feedback must reference its own customer_feedback evidence');
select throws_ok(
  $$insert into public.catalog_field_provenance (product_id, field_key, evidence_id, fact_status)
    values (tests.id('d1'), 'tagline', tests.id('f3'), 'confirmed')$$,
  '23514', null, 'field provenance cannot cite evidence of another product');
select throws_ok(
  $$insert into public.company_signals (product_id, signal_type, signal_value, evidence_id, fact_status)
    values (tests.id('d1'), 'traffic_estimate', '{}'::jsonb, tests.id('f1'), 'confirmed')$$,
  '23514', null, 'a traffic signal is always an estimate');
select throws_ok(
  $$insert into public.saas_products (name, slug, record_status, exclusion_status)
    values ('Unassessed', 'unassessed-active', 'active', 'unassessed')$$,
  '23514', null, 'an active product must have passed the exclusion classifier');

-- Permanent exclusion guards.
insert into public.saas_products (id, name, slug, record_status, exclusion_status)
  values (tests.id('d5'), 'Affiliate Tool', 'affiliate-tool', 'candidate', 'excluded');
insert into public.product_categories (product_id, category_id, is_primary)
  select tests.id('d5'), id, true from public.categories where slug = 'excluded-affiliate-marketing';
select throws_ok(
  $$update public.saas_products set exclusion_status = 'eligible' where id = tests.id('d5')$$,
  '23514', null, 'a product with an excluded primary category cannot be made eligible');
select throws_ok(
  $$update public.product_categories set is_primary = false where product_id = tests.id('d1');
    insert into public.product_categories (product_id, category_id, is_primary)
    select tests.id('d1'), id, true from public.categories where slug = 'excluded-partner-management'$$,
  '23514', null, 'an eligible product cannot receive an excluded primary category');

select * from finish();
rollback;
