-- S8.1 (audit of 11 November 2026): catalog snapshots were all labelled
-- 'stored_full', including Uneed, whose source storage policy is
-- 'metadata_only' (docs/DATA_SOURCES.md). The ingester only ever keeps the
-- normalized listing metadata (extracted_metadata) and never page content
-- (raw_content_location stays null), so a metadata-only snapshot is
-- 'reference_only', as for the other metadata-only source (Hacker News).
--
-- 1. The ingestion RPC derives the label from sources.storage_policy:
--    'full' -> 'stored_full' (Wikidata), anything else -> 'reference_only'.
--    Same function otherwise (20261118090001_catalog_ingest_company_identifiers).
-- 2. Existing snapshots of metadata-only catalog sources written by that RPC
--    are relabelled, only where it is safe: label 'stored_full', no raw
--    content stored, and the listing metadata present. Provenance, content
--    hashes, evidence and identifiers are untouched; one audit row records
--    the count.
create or replace function public.sor_ingest_catalog_listing(p_row jsonb, p_decision jsonb, p_exclusion jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.sources;
  v_record uuid;
  v_snapshot uuid;
  v_company uuid;
  v_product uuid;
  v_evidence uuid;
  v_company_evidence uuid;
  v_status public.exclusion_status;
  v_first boolean := true;
  v_category record;
  v_outcome text := p_decision ->> 'outcome';
  v_url text := p_row ->> 'canonical_url';
  v_external text := p_row ->> 'external_id';
  -- Prefixed: one source item can be both a listed product and the developer
  -- of another product (same id at the source); identifiers are unique per
  -- (source, value) across products and companies.
  v_company_external text := 'company:' || nullif(p_row ->> 'company_external_id', '');
  v_desc text := nullif(trim(p_row ->> 'description'), '');
  v_year integer := (p_row ->> 'launch_year')::integer;
  v_retrieved timestamptz := coalesce((p_row ->> 'retrieved_at')::timestamptz, now());
  v_storage public.content_storage_status;
begin
  select * into v_source from public.sources s where s.source_key = p_row ->> 'source_key';
  if v_source.id is null or v_source.integration_status <> 'integrated' or not v_source.is_enabled then
    raise exception 'INVALID_STATE: source not enabled' using errcode = '55000';
  end if;
  -- The snapshot label follows the source's storage policy: only a 'full'
  -- source (Wikidata, CC0) is stored in full; a metadata-only source (Uneed)
  -- keeps the listing metadata and a reference, never page content.
  v_storage := case v_source.storage_policy when 'full' then 'stored_full'::public.content_storage_status
                                            else 'reference_only'::public.content_storage_status end;
  if v_outcome not in ('new', 'matched_existing') or coalesce(v_url, '') = '' or coalesce(v_external, '') = ''
     or coalesce(trim(p_row ->> 'name'), '') = '' or coalesce(p_row ->> 'content_hash', '') = '' then
    raise exception 'VALIDATION_ERROR: listing' using errcode = '22023';
  end if;

  -- Provenance: one record per source item, one snapshot per content hash.
  insert into public.source_records (source_id, canonical_url, external_id, title)
    values (v_source.id, p_row ->> 'source_url', v_external, left(p_row ->> 'name', 500))
    on conflict (source_id, canonical_url) do update set external_id = excluded.external_id, title = excluded.title
    returning id into v_record;
  insert into public.source_snapshots (source_record_id, content_hash, fetch_status, storage_status, retrieved_at,
                                       extracted_metadata, extraction_status)
    values (v_record, p_row ->> 'content_hash', 'ok', v_storage, v_retrieved,
            jsonb_build_object('listing', p_row, 'licence', p_row ->> 'licence'), 'completed')
    on conflict (source_record_id, content_hash) do update set last_retrieved_at = now()
    returning id into v_snapshot;

  -- Idempotent: the source item already identifies a product.
  select i.product_id into v_product from public.entity_identifiers i
   where i.identifier_type = 'external_id' and i.source_id = v_source.id and i.value_normalized = v_external
     and i.product_id is not null and i.valid_to is null;
  if v_product is null and v_outcome = 'matched_existing' then
    v_product := (p_decision ->> 'product_id')::uuid;
  end if;
  if v_product is null then
    select i.product_id into v_product from public.entity_identifiers i
     where i.identifier_type = 'canonical_url' and i.value_normalized = v_url and i.product_id is not null
       and i.valid_to is null;
  end if;

  if v_product is not null then
    -- Existing product: keep its facts, add this source as declared evidence
    -- (original sources are preserved), fill only unknown fields.
    select e.id into v_evidence from public.evidence_items e
     where e.source_snapshot_id = v_snapshot and e.product_id = v_product;
    if v_evidence is null then
      insert into public.evidence_items (product_id, source_snapshot_id, claim_type, claim_text, claim_value,
                                         evidence_type, fact_status, reliability_level, extraction_method, observed_at)
        values (v_product, v_snapshot, 'product_exists',
                left(format('Listed on %s as %s', v_source.name, v_external), 1000), p_row,
                'third_party_report', 'declared', v_source.default_reliability_level, 'structured_parse', v_retrieved)
        returning id into v_evidence;
    end if;
    insert into public.entity_identifiers (product_id, identifier_type, value_normalized, source_id, evidence_id)
      select v_product, 'external_id', v_external, v_source.id, v_evidence
       where not exists (select 1 from public.entity_identifiers i
                          where i.identifier_type = 'external_id' and i.source_id = v_source.id
                            and i.value_normalized = v_external and i.valid_to is null);
    if v_desc is not null then
      update public.saas_products p set short_description = left(v_desc, 300)
       where p.id = v_product and p.short_description is null
         and not exists (select 1 from public.catalog_field_provenance f
                          where f.product_id = v_product and f.field_key = 'short_description' and f.is_current);
      if found then
        insert into public.catalog_field_provenance (product_id, field_key, evidence_id, fact_status)
          values (v_product, 'short_description', v_evidence, 'declared');
      end if;
    end if;
    if v_year is not null then
      update public.saas_products p set launch_year = v_year
       where p.id = v_product and p.launch_year is null
         and not exists (select 1 from public.catalog_field_provenance f
                          where f.product_id = v_product and f.field_key = 'launch_year' and f.is_current);
      if found then
        insert into public.catalog_field_provenance (product_id, field_key, evidence_id, fact_status)
          values (v_product, 'launch_year', v_evidence, 'declared');
      end if;
    end if;
    return jsonb_build_object('status', 'matched_existing', 'product_id', v_product, 'evidence_id', v_evidence);
  end if;

  -- New product.
  v_status := (p_exclusion ->> 'status')::public.exclusion_status;
  if v_status is null or v_status = 'unassessed' then
    raise exception 'VALIDATION_ERROR: exclusion' using errcode = '22023';
  end if;
  v_company := (p_decision ->> 'company_id')::uuid;
  if v_company is null and v_company_external is not null then
    select i.company_id into v_company from public.entity_identifiers i
     where i.identifier_type = 'external_id' and i.source_id = v_source.id and i.value_normalized = v_company_external
       and i.company_id is not null and i.valid_to is null;
  end if;
  if v_company is null and nullif(trim(p_row ->> 'company_name'), '') is not null and v_company_external is not null then
    insert into public.companies (name, slug, country_code)
      values (left(trim(p_row ->> 'company_name'), 200),
              private.unique_slug('companies', coalesce(p_row ->> 'company_slug_base', p_row ->> 'company_name')),
              p_row ->> 'country_code')
      returning id into v_company;
    insert into public.evidence_items (company_id, source_snapshot_id, claim_type, claim_text, claim_value,
                                       evidence_type, fact_status, reliability_level, extraction_method, observed_at)
      values (v_company, v_snapshot, 'company_profile',
              left(format('Developer of %s on %s (%s)', p_row ->> 'name', v_source.name, v_company_external), 1000),
              jsonb_build_object('name', p_row ->> 'company_name', 'country_code', p_row ->> 'country_code',
                                 'external_id', v_company_external),
              'third_party_report', 'declared', v_source.default_reliability_level, 'structured_parse', v_retrieved)
      returning id into v_company_evidence;
    insert into public.catalog_field_provenance (company_id, field_key, evidence_id, fact_status)
      select v_company, f, v_company_evidence, 'declared'::public.fact_status
        from unnest(array['name', 'country_code']) f
       where f = 'name' or p_row ->> 'country_code' is not null;
    insert into public.entity_identifiers (company_id, identifier_type, value_normalized, source_id, evidence_id)
      values (v_company, 'external_id', v_company_external, v_source.id, v_company_evidence);
  end if;

  insert into public.saas_products (company_id, name, slug, website_url, primary_domain, short_description,
                                    launch_year, record_status, exclusion_status, discovery_source_id)
    values (v_company, left(trim(p_row ->> 'name'), 200),
            private.unique_slug('saas_products', coalesce(p_row ->> 'slug_base', p_row ->> 'name')),
            v_url, p_row ->> 'domain', left(v_desc, 300), v_year,
            case when v_status = 'eligible' then 'active'::public.record_status else 'candidate'::public.record_status end,
            v_status, v_source.id)
    returning id into v_product;
  insert into public.evidence_items (product_id, source_snapshot_id, claim_type, claim_text, claim_value,
                                     evidence_type, fact_status, reliability_level, extraction_method, observed_at)
    values (v_product, v_snapshot, 'product_exists',
            left(format('Listed on %s as %s', v_source.name, v_external), 1000), p_row,
            'third_party_report', 'declared', v_source.default_reliability_level, 'structured_parse', v_retrieved)
    returning id into v_evidence;
  insert into public.catalog_field_provenance (product_id, field_key, evidence_id, fact_status)
    select v_product, f, v_evidence, 'declared'::public.fact_status
      from unnest(array['name', 'website_url', 'short_description', 'launch_year']) f
     where f in ('name', 'website_url') or (f = 'short_description' and v_desc is not null)
        or (f = 'launch_year' and v_year is not null);
  insert into public.entity_identifiers (product_id, identifier_type, value_normalized, is_primary, source_id, evidence_id)
    values (v_product, 'canonical_url', v_url, true, v_source.id, v_evidence),
           (v_product, 'external_id', v_external, false, v_source.id, v_evidence);
  if nullif(p_row ->> 'domain', '') is not null then
    insert into public.entity_identifiers (product_id, identifier_type, value_normalized, source_id, evidence_id)
      values (v_product, 'domain', p_row ->> 'domain', v_source.id, v_evidence);
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
    values (null, null, 'worker', 'catalog.ingest_listing', 'saas_product', v_product,
            jsonb_build_object('source_key', v_source.source_key, 'external_id', v_external,
                               'exclusion_status', v_status));
  update public.sources set last_sync_at = now() where id = v_source.id;
  return jsonb_build_object('status', 'created', 'product_id', v_product, 'exclusion_status', v_status);
end;
$$;

revoke all on function public.sor_ingest_catalog_listing(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sor_ingest_catalog_listing(jsonb, jsonb, jsonb) to service_role;

-- 2. Safe relabel of earlier metadata-only catalog snapshots.
with relabelled as (
  update public.source_snapshots ss
     set storage_status = 'reference_only'
    from public.source_records sr
    join public.sources s on s.id = sr.source_id
   where ss.source_record_id = sr.id
     and s.storage_policy <> 'full'
     and s.source_type = 'directory'
     and ss.storage_status = 'stored_full'
     and ss.raw_content_location is null
     and ss.extracted_metadata ? 'listing'
  returning ss.id, s.source_key
)
insert into public.audit_logs (workspace_id, actor_user_id, actor_kind, action, resource_type, resource_id, metadata)
select null, null, 'server', 'catalog.snapshot_storage_relabel', 'source_snapshot', null,
       jsonb_build_object('migration', '20261121090001_catalog_snapshot_storage_policy',
                          'from', 'stored_full', 'to', 'reference_only',
                          'by_source', (select jsonb_object_agg(source_key, n)
                                          from (select source_key, count(*) as n from relabelled group by source_key) c))
 where exists (select 1 from relabelled);
