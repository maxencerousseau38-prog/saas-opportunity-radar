-- First bulk catalog collection (10 November 2026; product-owner instruction
-- "première collecte massive de SaaS"; terms review in docs/DATA_SOURCES.md,
-- official pages frozen in docs/sources/terms).
--
-- 1. Taxonomy: seven new top-level categories for a global, multi-category catalog
--    (PRD §4.2.E "Pouvoir créer de nouvelles catégories sans modifier
--    l'architecture"; §24.1 no sectoral restriction).
-- 2. Source registry: Wikidata (CC0, public query service) integrated and
--    enabled; Product Hunt registered planned and disabled (its API "must not
--    be used for commercial purposes" and needs an OAuth token the product
--    owner has to create); Hacker News terms verification recorded.
-- 3. sor_ingest_catalog_listing: service-role RPC that writes one collected
--    listing through the provenance pipeline (source record, snapshot,
--    declared evidence, field provenance, identifiers, categories, exclusion
--    assessment), idempotently.

-- ------------------------------------------------------------------ taxonomy
with parents(name, slug) as (values
  ('Communication & Collaboration', 'communication-collaboration'),
  ('Productivity', 'productivity'),
  ('Design & Creative', 'design-creative'),
  ('HR & Recruiting', 'hr-recruiting'),
  ('Education & Learning', 'education-learning'),
  ('Security & IT', 'security-it'),
  ('Industry & Vertical Software', 'vertical-software'))
insert into public.categories(name, slug, priority_weight)
select name, slug, 0 from parents
on conflict (slug) do nothing;

with children(parent_slug, name, suffix) as (values
  ('communication-collaboration', 'Team Chat & Messaging', 'messaging'),
  ('communication-collaboration', 'Video Conferencing', 'video-conferencing'),
  ('communication-collaboration', 'Email & Calendar', 'email-calendar'),
  ('communication-collaboration', 'Collaboration & Wikis', 'collaboration'),
  ('productivity', 'Note-taking', 'note-taking'),
  ('productivity', 'Scheduling', 'scheduling'),
  ('productivity', 'Office Suites', 'office-suites'),
  ('productivity', 'File & Media Sharing', 'file-sharing'),
  ('productivity', 'Forms & Surveys', 'forms-surveys'),
  ('design-creative', 'Graphic Design', 'graphic-design'),
  ('design-creative', 'Prototyping & UX', 'prototyping'),
  ('design-creative', 'Video & Audio', 'video-audio'),
  ('design-creative', 'Website Builders & CMS', 'website-builders'),
  ('hr-recruiting', 'HR Management', 'hr-management'),
  ('hr-recruiting', 'Recruiting', 'recruiting'),
  ('hr-recruiting', 'Payroll', 'payroll'),
  ('education-learning', 'Learning Management', 'learning-management'),
  ('education-learning', 'Online Learning', 'online-learning'),
  ('security-it', 'Identity & Access', 'identity-access'),
  ('security-it', 'Password Management', 'password-management'),
  ('security-it', 'Backup & Storage', 'backup-storage'),
  ('security-it', 'IT Management & Security', 'it-management'),
  ('vertical-software', 'Maps & Location', 'maps-location'),
  ('vertical-software', 'Healthcare', 'healthcare'),
  ('vertical-software', 'Legal & Compliance', 'legal'),
  ('vertical-software', 'Government & Civic', 'government-civic'),
  ('vertical-software', 'Travel & Hospitality', 'travel-hospitality'),
  ('vertical-software', 'Real Estate', 'real-estate'))
insert into public.categories(parent_id, name, slug)
select p.id, c.name, c.parent_slug || '-' || c.suffix
  from children c join public.categories p on p.slug = c.parent_slug
on conflict (slug) do nothing;

-- ------------------------------------------------------------------ sources
insert into public.sources (source_key, name, source_type, access_method, base_url, terms_url,
                            terms_reviewed_at, terms_review_notes, integration_status, default_reliability_level,
                            rate_limit_per_minute, quota_per_day, is_enabled, storage_policy)
values
  ('wikidata', 'Wikidata', 'directory', 'official_api', 'https://query.wikidata.org/sparql',
   'https://www.wikidata.org/wiki/Wikidata:Licensing', '2026-11-10 17:21:00+00',
   'Structured data released under CC0 (Wikidata:Licensing). Public query service: 60 s deadline, 60 s of processing per minute per client, 5 parallel queries per IP, descriptive User-Agent required (WDQS user manual). Collected by the Catalog collection workflow; facts are community-declared (reliability 3), never verified by the import.',
   'integrated', 3, 1, 20, true, 'full'),
  ('product_hunt', 'Product Hunt', 'directory', 'official_api', 'https://api.producthunt.com/v2/api/graphql',
   'https://api.producthunt.com/v2/docs', '2026-11-10 17:21:00+00',
   'API docs: "The Product Hunt API must not be used for commercial purposes. If you would like to use it for your business, please contact us at hello@producthunt.com." OAuth token required (API dashboard). Terms of service page not readable (HTTP 403). Not enabled: needs a token from the product owner and is limited to non-commercial use.',
   'planned', 3, null, null, false, 'metadata_only')
on conflict (source_key) do nothing;

-- Notes only: terms_reviewed_at stays null until the product owner approves
-- activation (the database refuses to enable a source without it).
update public.sources
   set terms_review_notes = 'Official API (github.com/HackerNews/API, MIT repository). Y Combinator Terms of Use (www.ycombinator.com/legal, read 10 Nov 2026): no copying, scraping or data mining of the Site "except as expressly authorized"; no commercial use of any portion of the Site. The official API is the means made available; personal, non-commercial use only; metadata only. Still disabled (no activation go-ahead).'
 where source_key = 'hacker_news';

-- ------------------------------------------------------------------ ingestion
-- p_row (built and validated by the worker ingester):
--   source_key, external_id, source_url, name, description, canonical_url, domain,
--   slug_base, launch_year, country_code, company_name, company_external_id,
--   company_slug_base, category_slugs[], licence, retrieved_at, content_hash
-- p_decision: {outcome: new|matched_existing, product_id?, company_id?, rule}
-- p_exclusion: classifier output {status, rule_set_version, matched_rules, incidental_mentions}
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
  v_company_external text := nullif(p_row ->> 'company_external_id', '');
  v_desc text := nullif(trim(p_row ->> 'description'), '');
  v_year integer := (p_row ->> 'launch_year')::integer;
  v_retrieved timestamptz := coalesce((p_row ->> 'retrieved_at')::timestamptz, now());
begin
  select * into v_source from public.sources s where s.source_key = p_row ->> 'source_key';
  if v_source.id is null or v_source.integration_status <> 'integrated' or not v_source.is_enabled then
    raise exception 'INVALID_STATE: source not enabled' using errcode = '55000';
  end if;
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
    values (v_record, p_row ->> 'content_hash', 'ok', 'stored_full', v_retrieved,
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
