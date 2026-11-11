-- Sprint 3 — evidence pipeline write RPCs (Implementation Blueprint §5.1, §6.5–6.7, §10 imports; ADR-013).
-- All service_role only. The worker computes identity decisions (D4), claim
-- selection and conflicts (@sor/domain) and the exclusion outcome (§5.4);
-- these functions apply them atomically and idempotently.

-- MVP acquisition sources are integrated (ADR-013). The official-website
-- connector fetches public pages of a product's own site through the safe
-- fetcher, obeys robots.txt and a per-host rate limit, and stores only
-- excerpts as evidence quotes.
update public.sources
   set integration_status = 'integrated', is_enabled = true, terms_reviewed_at = now(),
       rate_limit_per_minute = 30,
       terms_review_notes = 'Public pages of the product''s own website only; robots.txt obeyed; neutral user agent; '
                            || 'no login, no cookies; quotes stored as evidence excerpts (Sprint 3 review).'
 where source_key = 'official_website';
update public.sources
   set integration_status = 'integrated', is_enabled = true, terms_reviewed_at = now(),
       terms_review_notes = 'Data declared by workspace members (reliability 4, fact status declared).'
 where source_key in ('manual_entry', 'user_import');

-- ---------------------------------------------------------------------------
-- Source records and snapshots (one snapshot per content hash, never overwritten)
-- ---------------------------------------------------------------------------
create or replace function public.sor_record_snapshot(
  p_source_key text, p_canonical_url text, p_external_id text, p_title text, p_content_hash text,
  p_fetch_status public.fetch_status, p_http_status integer, p_published_at timestamptz,
  p_retrieved_at timestamptz, p_storage_status public.content_storage_status, p_metadata jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source uuid;
  v_record uuid;
  v_snapshot uuid;
begin
  select s.id into v_source from public.sources s
   where s.source_key = p_source_key and s.is_enabled and s.integration_status = 'integrated';
  if v_source is null then
    raise exception 'VALIDATION_ERROR: source not integrated' using errcode = '22023';
  end if;
  insert into public.source_records (source_id, canonical_url, external_id, title)
    values (v_source, p_canonical_url, p_external_id, left(p_title, 500))
    on conflict (source_id, canonical_url)
      do update set title = coalesce(excluded.title, public.source_records.title),
                    external_id = coalesce(excluded.external_id, public.source_records.external_id)
    returning id into v_record;
  insert into public.source_snapshots (source_record_id, content_hash, fetch_status, http_status, published_at,
                                       retrieved_at, last_retrieved_at, storage_status, extracted_metadata,
                                       extraction_status)
    values (v_record, p_content_hash, p_fetch_status, p_http_status, p_published_at,
            coalesce(p_retrieved_at, now()), coalesce(p_retrieved_at, now()), p_storage_status,
            coalesce(p_metadata, '{}'::jsonb), 'pending')
    on conflict (source_record_id, content_hash)
      do update set last_retrieved_at = greatest(public.source_snapshots.last_retrieved_at, excluded.last_retrieved_at)
    returning id into v_snapshot;
  return v_snapshot;
end;
$$;

-- Product / company columns an enrichment may set (whitelist).
create or replace function private.enrichment_product_fields()
returns text[] language sql immutable set search_path = '' as $$
  select array['tagline','short_description','description','problem_solved','value_proposition','use_cases',
               'compatibilities','languages','customer_type','pricing_status','billing_models','launch_year',
               'documentation_url','product_status','technology_tags','served_countries']
$$;
create or replace function private.enrichment_company_fields()
returns text[] language sql immutable set search_path = '' as $$
  select array['legal_name','founded_year','country_code','city','employee_min','employee_max','founder_led',
               'linkedin_url','description']
$$;

-- ---------------------------------------------------------------------------
-- Enrichment (D5 + D6) application — one transaction per verification step
-- ---------------------------------------------------------------------------
create or replace function public.sor_apply_enrichment(
  p_job_id uuid, p_step_id uuid, p_product_id uuid, p_plan jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.saas_products;
  v_keys jsonb := '{}'::jsonb;
  v_ev jsonb;
  v_id uuid;
  v_field text;
  v_entry jsonb;
  v_item jsonb;
  v_a uuid;
  v_b uuid;
  v_status public.exclusion_status;
  v_count integer := 0;
begin
  if not exists (select 1 from public.agent_step_runs s where s.id = p_step_id and s.job_execution_id = p_job_id) then
    raise exception 'VALIDATION_ERROR: step does not belong to job' using errcode = '22023';
  end if;
  select * into v_product from public.saas_products p where p.id = p_product_id for update;
  if v_product.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  -- Idempotency: a redelivered step never inserts its evidence twice.
  if exists (select 1 from public.evidence_items e where e.extracted_by_step_id = p_step_id) then
    return jsonb_build_object('status', 'already_applied',
      'evidence_count', (select count(*) from public.evidence_items e where e.extracted_by_step_id = p_step_id));
  end if;

  -- Evidence items (keys are local references used by the rest of the plan).
  for v_ev in select * from jsonb_array_elements(coalesce(p_plan -> 'evidence', '[]'::jsonb)) loop
    if not exists (select 1 from public.source_snapshots s where s.id = (v_ev ->> 'source_snapshot_id')::uuid) then
      raise exception 'EVIDENCE_SCOPE_VIOLATION: unknown snapshot' using errcode = '23514';
    end if;
    insert into public.evidence_items (product_id, company_id, source_snapshot_id, claim_type, claim_text, claim_value,
                                       evidence_type, fact_status, monetization_signal, reliability_level, confidence,
                                       verification_status, verified_at, published_at, observed_at,
                                       extraction_method, extracted_by_step_id)
    values (case when coalesce((v_ev ->> 'company_scope')::boolean, false) then null else p_product_id end,
            case when coalesce((v_ev ->> 'company_scope')::boolean, false) then v_product.company_id end,
            (v_ev ->> 'source_snapshot_id')::uuid,
            (v_ev ->> 'claim_type')::public.claim_type, left(v_ev ->> 'claim_text', 5000), v_ev -> 'claim_value',
            (v_ev ->> 'evidence_type')::public.evidence_type, (v_ev ->> 'fact_status')::public.fact_status,
            (v_ev ->> 'monetization_signal')::public.monetization_signal, (v_ev ->> 'reliability_level')::smallint,
            (v_ev ->> 'confidence')::numeric, (v_ev ->> 'verification_status')::public.verification_status,
            (v_ev ->> 'verified_at')::timestamptz, (v_ev ->> 'published_at')::timestamptz,
            coalesce((v_ev ->> 'observed_at')::timestamptz, now()), 'llm_extraction', p_step_id)
    returning id into v_id;
    v_keys := v_keys || jsonb_build_object(v_ev ->> 'key', v_id);
    v_count := v_count + 1;
  end loop;

  -- Selected product values and their provenance.
  for v_field, v_entry in select * from jsonb_each(coalesce(p_plan -> 'product_fields', '{}'::jsonb)) loop
    if not v_field = any (private.enrichment_product_fields()) then
      raise exception 'VALIDATION_ERROR: field % not allowed', v_field using errcode = '22023';
    end if;
    v_id := coalesce((v_keys ->> (v_entry ->> 'evidence_key'))::uuid, (v_entry ->> 'evidence_id')::uuid);
    if v_id is null then
      raise exception 'VALIDATION_ERROR: field % without evidence', v_field using errcode = '22023';
    end if;
    execute format(
      'update public.saas_products set %1$I = (jsonb_populate_record(null::public.saas_products, jsonb_build_object(%2$L, $1))).%1$I where id = $2',
      v_field, v_field) using v_entry -> 'value', p_product_id;
    update public.catalog_field_provenance set is_current = false
     where product_id = p_product_id and field_key = v_field and is_current;
    insert into public.catalog_field_provenance (product_id, field_key, evidence_id, fact_status)
      values (p_product_id, v_field, v_id, (v_entry ->> 'fact_status')::public.fact_status);
  end loop;

  if v_product.company_id is not null then
    for v_field, v_entry in select * from jsonb_each(coalesce(p_plan -> 'company_fields', '{}'::jsonb)) loop
      if not v_field = any (private.enrichment_company_fields()) then
        raise exception 'VALIDATION_ERROR: field % not allowed', v_field using errcode = '22023';
      end if;
      v_id := coalesce((v_keys ->> (v_entry ->> 'evidence_key'))::uuid, (v_entry ->> 'evidence_id')::uuid);
      if v_id is null then
        raise exception 'VALIDATION_ERROR: field % without evidence', v_field using errcode = '22023';
      end if;
      execute format(
        'update public.companies set %1$I = (jsonb_populate_record(null::public.companies, jsonb_build_object(%2$L, $1))).%1$I where id = $2',
        v_field, v_field) using v_entry -> 'value', v_product.company_id;
      update public.catalog_field_provenance set is_current = false
       where company_id = v_product.company_id and field_key = v_field and is_current;
      insert into public.catalog_field_provenance (company_id, field_key, evidence_id, fact_status)
        values (v_product.company_id, v_field, v_id, (v_entry ->> 'fact_status')::public.fact_status);
    end loop;
    update public.companies set last_verified_at = now() where id = v_product.company_id;
  end if;

  -- Features and integrations: upsert by case-insensitive name. A feature
  -- not found keeps its row; absence is never recorded as `removed`.
  for v_item in select * from jsonb_array_elements(coalesce(p_plan -> 'features', '[]'::jsonb)) loop
    v_id := (v_keys ->> (v_item ->> 'evidence_key'))::uuid;
    update public.product_features
       set availability = (v_item ->> 'availability')::public.feature_availability, evidence_id = v_id,
           last_verified_at = now(), is_primary = is_primary or coalesce((v_item ->> 'is_primary')::boolean, false)
     where product_id = p_product_id and lower(name) = lower(v_item ->> 'name');
    if not found then
      insert into public.product_features (product_id, name, description, is_primary, availability, evidence_id, last_verified_at)
        values (p_product_id, left(v_item ->> 'name', 160), left(v_item ->> 'description', 3000),
                coalesce((v_item ->> 'is_primary')::boolean, false),
                (v_item ->> 'availability')::public.feature_availability, v_id, now());
    end if;
  end loop;
  for v_item in select * from jsonb_array_elements(coalesce(p_plan -> 'integrations', '[]'::jsonb)) loop
    v_id := (v_keys ->> (v_item ->> 'evidence_key'))::uuid;
    update public.product_integrations
       set availability = (v_item ->> 'availability')::public.feature_availability, evidence_id = v_id
     where product_id = p_product_id and lower(name) = lower(v_item ->> 'name');
    if not found then
      insert into public.product_integrations (product_id, name, integration_category, availability, evidence_id)
        values (p_product_id, left(v_item ->> 'name', 160),
                coalesce((v_item ->> 'integration_category')::public.integration_category, 'other'),
                (v_item ->> 'availability')::public.feature_availability, v_id);
    end if;
  end loop;

  -- Pricing: a newly verified pricing page supersedes the current plans.
  if jsonb_array_length(coalesce(p_plan -> 'pricing_plans', '[]'::jsonb)) > 0 then
    update public.pricing_plans set superseded_at = now() where product_id = p_product_id and superseded_at is null;
    for v_item in select * from jsonb_array_elements(p_plan -> 'pricing_plans') loop
      insert into public.pricing_plans (product_id, plan_name, billing_period, price_amount, currency, price_per_user,
                                        minimum_seats, has_free_trial, has_free_plan, custom_pricing, is_entry_plan,
                                        is_enterprise_plan, evidence_id, checked_at)
      values (p_product_id, left(v_item ->> 'plan_name', 120), coalesce(v_item ->> 'billing_period', 'unknown'),
              (v_item ->> 'price_amount')::numeric, upper(v_item ->> 'currency'),
              (v_item ->> 'price_per_user')::boolean, (v_item ->> 'minimum_seats')::integer,
              (v_item ->> 'has_free_trial')::boolean, (v_item ->> 'has_free_plan')::boolean,
              (v_item ->> 'custom_pricing')::boolean, coalesce((v_item ->> 'is_entry_plan')::boolean, false),
              coalesce((v_item ->> 'is_enterprise_plan')::boolean, false),
              (v_keys ->> (v_item ->> 'evidence_key'))::uuid, now());
    end loop;
  end if;

  -- Contradictions are kept, never overwritten.
  for v_item in select * from jsonb_array_elements(coalesce(p_plan -> 'conflicts', '[]'::jsonb)) loop
    v_a := coalesce((v_keys ->> (v_item ->> 'a'))::uuid, (v_item ->> 'a_id')::uuid);
    v_b := coalesce((v_keys ->> (v_item ->> 'b'))::uuid, (v_item ->> 'b_id')::uuid);
    if v_a is not null and v_b is not null and v_a <> v_b then
      insert into public.evidence_conflicts (evidence_a_id, evidence_b_id, product_id, field_key)
        values (least(v_a, v_b), greatest(v_a, v_b), p_product_id, left(v_item ->> 'field_key', 60))
        on conflict do nothing;
    end if;
  end loop;

  -- Re-run of the §5.4 classifier on the new core texts: only ever stricter.
  if p_plan -> 'exclusion' is not null and jsonb_typeof(p_plan -> 'exclusion') = 'object' then
    v_status := (p_plan -> 'exclusion' ->> 'status')::public.exclusion_status;
    insert into public.product_exclusion_assessments (product_id, status, rule_set_version, matched_rules,
                                                      incidental_mentions, decided_by)
      values (p_product_id, v_status, coalesce(p_plan -> 'exclusion' ->> 'rule_set_version', 'unknown'),
              coalesce(p_plan -> 'exclusion' -> 'matched_rules', '[]'::jsonb),
              coalesce(p_plan -> 'exclusion' -> 'incidental_mentions', '[]'::jsonb), 'rule_engine');
    if v_status = 'excluded' and v_product.exclusion_status <> 'excluded' then
      update public.saas_products set exclusion_status = 'excluded' where id = p_product_id;
    elsif v_status = 'needs_review' and v_product.exclusion_status = 'eligible'
          and not exists (select 1 from public.product_exclusion_assessments a
                           where a.product_id = p_product_id and a.decided_by = 'platform_operator') then
      update public.saas_products set exclusion_status = 'needs_review' where id = p_product_id;
    end if;
  end if;

  update public.saas_products set last_verified_at = now() where id = p_product_id;
  return jsonb_build_object('status', 'applied', 'evidence_count', v_count, 'evidence_ids', v_keys);
end;
$$;

-- ---------------------------------------------------------------------------
-- CSV product import row (identity decided by D4 in the worker)
-- ---------------------------------------------------------------------------
create or replace function public.sor_import_product_row(
  p_job_id uuid, p_row_index integer, p_row jsonb, p_decision jsonb, p_exclusion jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.job_executions;
  v_source uuid;
  v_record uuid;
  v_snapshot uuid;
  v_company uuid;
  v_product uuid;
  v_evidence uuid;
  v_status public.exclusion_status;
  v_hash text;
  v_first boolean := true;
  v_category record;
  v_outcome text := p_decision ->> 'outcome';
  v_url text := p_row ->> 'canonical_url';
begin
  select * into v_job from public.job_executions j where j.id = p_job_id and j.job_kind = 'catalog_import';
  if v_job.id is null or v_job.state <> 'running' then
    raise exception 'INVALID_STATE: import job not running' using errcode = '55000';
  end if;
  if v_outcome not in ('new', 'matched_existing') then
    raise exception 'VALIDATION_ERROR: decision' using errcode = '22023';
  end if;

  select s.id into v_source from public.sources s where s.source_key = 'user_import';
  v_hash := encode(pg_catalog.sha256(convert_to(p_job_id::text || ':' || p_row_index || ':' || p_row::text, 'UTF8')), 'hex');
  insert into public.source_records (source_id, canonical_url, title)
    values (v_source, coalesce(p_row ->> 'source_url', v_url), left(p_row ->> 'name', 500))
    on conflict (source_id, canonical_url) do update set title = excluded.title
    returning id into v_record;
  insert into public.source_snapshots (source_record_id, content_hash, fetch_status, storage_status, extracted_metadata,
                                       extraction_status)
    values (v_record, v_hash, 'ok', 'reference_only',
            jsonb_build_object('job_id', p_job_id, 'row', p_row_index, 'workspace_id', v_job.workspace_id,
                               'imported_by', v_job.requested_by), 'completed')
    on conflict (source_record_id, content_hash) do update set last_retrieved_at = now()
    returning id into v_snapshot;

  if v_outcome = 'matched_existing' then
    v_product := (p_decision ->> 'product_id')::uuid;
    -- Idempotent: one declared evidence per row snapshot and product.
    select e.id into v_evidence from public.evidence_items e
     where e.source_snapshot_id = v_snapshot and e.product_id = v_product;
    if v_evidence is null then
      insert into public.evidence_items (product_id, source_snapshot_id, claim_type, claim_text, claim_value,
                                         evidence_type, fact_status, reliability_level, extraction_method)
        values (v_product, v_snapshot, 'product_exists', 'Product listed in a workspace CSV import', p_row,
                'user_declared', 'declared', 4, 'user_import')
        returning id into v_evidence;
    end if;
    return jsonb_build_object('status', 'matched_existing', 'product_id', v_product, 'evidence_id', v_evidence);
  end if;

  -- New product (idempotent through the canonical URL identifier).
  select i.product_id into v_product from public.entity_identifiers i
   where i.identifier_type = 'canonical_url' and i.value_normalized = v_url and i.product_id is not null
     and i.valid_to is null;
  if v_product is not null then
    return jsonb_build_object('status', 'matched_existing', 'product_id', v_product);
  end if;

  v_status := (p_exclusion ->> 'status')::public.exclusion_status;
  if v_status is null or v_status = 'unassessed' then
    raise exception 'VALIDATION_ERROR: exclusion' using errcode = '22023';
  end if;
  v_company := (p_decision ->> 'company_id')::uuid;
  if v_company is null and nullif(trim(p_row ->> 'company_name'), '') is not null then
    insert into public.companies (name, slug, country_code, employee_min, employee_max, primary_domain)
      values (trim(p_row ->> 'company_name'),
              private.unique_slug('companies', coalesce(p_row ->> 'company_slug_base', p_row ->> 'company_name')),
              p_row ->> 'country_code', (p_row ->> 'employee_min')::integer, (p_row ->> 'employee_max')::integer,
              p_row ->> 'domain')
      returning id into v_company;
  end if;
  insert into public.saas_products (company_id, name, slug, website_url, primary_domain, record_status,
                                    exclusion_status, discovery_source_id)
    values (v_company, trim(p_row ->> 'name'),
            private.unique_slug('saas_products', coalesce(p_row ->> 'slug_base', p_row ->> 'name')),
            v_url, p_row ->> 'domain',
            case when v_status = 'eligible' then 'active'::public.record_status else 'candidate'::public.record_status end,
            v_status, v_source)
    returning id into v_product;
  insert into public.evidence_items (product_id, source_snapshot_id, claim_type, claim_text, claim_value,
                                     evidence_type, fact_status, reliability_level, extraction_method)
    values (v_product, v_snapshot, 'product_exists', 'Product declared in a workspace CSV import', p_row,
            'user_declared', 'declared', 4, 'user_import')
    returning id into v_evidence;
  insert into public.catalog_field_provenance (product_id, field_key, evidence_id, fact_status) values
    (v_product, 'name', v_evidence, 'declared'),
    (v_product, 'website_url', v_evidence, 'declared');
  if v_company is not null and (p_decision ->> 'company_id') is null then
    insert into public.evidence_items (company_id, source_snapshot_id, claim_type, claim_text, claim_value,
                                       evidence_type, fact_status, reliability_level, extraction_method)
      values (v_company, v_snapshot, 'company_profile', 'Company declared in a workspace CSV import', p_row,
              'user_declared', 'declared', 4, 'user_import')
      returning id into v_evidence;
    insert into public.catalog_field_provenance (company_id, field_key, evidence_id, fact_status)
      select v_company, f, v_evidence, 'declared'::public.fact_status
        from unnest(array['name','country_code','employee_min','employee_max']) f
       where f = 'name' or p_row ->> f is not null;
  end if;
  insert into public.entity_identifiers (product_id, identifier_type, value_normalized, is_primary, source_id)
    values (v_product, 'canonical_url', v_url, true, v_source);
  if p_row ->> 'domain' is not null then
    insert into public.entity_identifiers (product_id, identifier_type, value_normalized, source_id)
      values (v_product, 'domain', p_row ->> 'domain', v_source);
  end if;
  for v_category in
    select c.id from jsonb_array_elements_text(coalesce(p_row -> 'category_slugs', '[]'::jsonb)) with ordinality as s(slug, ord)
    join public.categories c on c.slug = s.slug and c.is_user_visible and c.is_active
    order by s.ord
  loop
    insert into public.product_categories (product_id, category_id, is_primary)
      values (v_product, v_category.id, v_first) on conflict do nothing;
    v_first := false;
  end loop;
  insert into public.product_exclusion_assessments (product_id, status, rule_set_version, matched_rules,
                                                    incidental_mentions, decided_by)
    values (v_product, v_status, coalesce(p_exclusion ->> 'rule_set_version', 'unknown'),
            coalesce(p_exclusion -> 'matched_rules', '[]'::jsonb),
            coalesce(p_exclusion -> 'incidental_mentions', '[]'::jsonb), 'rule_engine');
  insert into public.audit_logs (workspace_id, actor_user_id, actor_kind, action, resource_type, resource_id, metadata)
    values (v_job.workspace_id, v_job.requested_by, 'worker', 'catalog.import_product', 'saas_product', v_product,
            jsonb_build_object('job_id', p_job_id, 'row', p_row_index, 'exclusion_status', v_status));
  return jsonb_build_object('status', 'created', 'product_id', v_product, 'exclusion_status', v_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- CSV feedback import row (rights declared per import; author hashed by the worker)
-- ---------------------------------------------------------------------------
create or replace function public.sor_import_feedback_row(p_job_id uuid, p_product_id uuid, p_row jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.job_executions;
  v_source uuid;
  v_record uuid;
  v_snapshot uuid;
  v_evidence uuid;
  v_feedback uuid;
  v_storage public.content_storage_status := (p_row ->> 'content_storage_status')::public.content_storage_status;
begin
  select * into v_job from public.job_executions j where j.id = p_job_id and j.job_kind = 'feedback_import';
  if v_job.id is null or v_job.state <> 'running' then
    raise exception 'INVALID_STATE: import job not running' using errcode = '55000';
  end if;
  if not exists (select 1 from public.saas_products p where p.id = p_product_id
                  and p.record_status = 'active' and p.exclusion_status = 'eligible') then
    raise exception 'EXCLUDED_SUBJECT: product not visible' using errcode = '23514';
  end if;
  if exists (select 1 from public.customer_feedback f
              where f.product_id = p_product_id and f.deduplication_hash = p_row ->> 'deduplication_hash') then
    return jsonb_build_object('status', 'duplicate');
  end if;

  select s.id into v_source from public.sources s where s.source_key = 'user_import';
  insert into public.source_records (source_id, canonical_url, title)
    values (v_source, p_row ->> 'source_url', left(p_row ->> 'source_name', 500))
    on conflict (source_id, canonical_url) do update set title = coalesce(public.source_records.title, excluded.title)
    returning id into v_record;
  insert into public.source_snapshots (source_record_id, content_hash, fetch_status, published_at, storage_status,
                                       extracted_metadata, extraction_status)
    values (v_record, p_row ->> 'deduplication_hash', 'ok', (p_row ->> 'published_at')::timestamptz, v_storage,
            jsonb_build_object('job_id', p_job_id, 'workspace_id', v_job.workspace_id,
                               'source_name', p_row ->> 'source_name',
                               'rights_basis', left(p_row ->> 'rights_basis', 1000)), 'completed')
    on conflict (source_record_id, content_hash) do update set last_retrieved_at = now()
    returning id into v_snapshot;
  insert into public.evidence_items (product_id, source_snapshot_id, claim_type, claim_text, claim_value,
                                     evidence_type, fact_status, reliability_level, published_at, extraction_method)
    values (p_product_id, v_snapshot, 'customer_feedback', 'Customer review imported by a workspace member',
            jsonb_build_object('rating', (p_row ->> 'rating')::numeric, 'rating_scale_max', (p_row ->> 'rating_scale_max')::numeric),
            'customer_review', 'declared', 4, (p_row ->> 'published_at')::timestamptz, 'user_import')
    returning id into v_evidence;
  insert into public.customer_feedback (product_id, source_snapshot_id, evidence_item_id, published_at, rating,
                                        rating_scale_max, original_text, language, content_storage_status,
                                        author_reference_hash, author_company_reference, deduplication_hash)
    values (p_product_id, v_snapshot, v_evidence, (p_row ->> 'published_at')::timestamptz,
            (p_row ->> 'rating')::numeric, (p_row ->> 'rating_scale_max')::numeric,
            case when v_storage in ('stored_full', 'stored_excerpt') then p_row ->> 'text' end,
            p_row ->> 'language', v_storage, p_row ->> 'author_reference_hash',
            left(p_row ->> 'author_company', 200), p_row ->> 'deduplication_hash')
    returning id into v_feedback;
  return jsonb_build_object('status', 'created', 'feedback_id', v_feedback, 'evidence_id', v_evidence);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.sor_record_snapshot(text, text, text, text, text, public.fetch_status, integer, timestamptz, timestamptz, public.content_storage_status, jsonb)',
    'public.sor_apply_enrichment(uuid, uuid, uuid, jsonb)',
    'public.sor_import_product_row(uuid, integer, jsonb, jsonb, jsonb)',
    'public.sor_import_feedback_row(uuid, uuid, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array['private.enrichment_product_fields()', 'private.enrichment_company_fields()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
