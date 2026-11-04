-- Sprint 2 — catalog search, manual add and operator actions.
-- Source: docs/IMPLEMENTATION_BLUEPRINT.md §3 (M2 addendum), §4.3, §10, §12. Keep both in sync.

-- PRD §12.1 lists logo_url; it was missing from M2.
alter table public.saas_products
  add column logo_url text check (logo_url is null or logo_url ~* '^https://');

-- ---------------------------------------------------------------------------
-- Catalog search (security invoker: catalog RLS and workspace RLS apply).
--
-- p_plan is produced by @sor/domain (normalizeCatalogQuery). Every key is
-- optional; an absent group does not filter. Unknown values match only when
-- the group's include_unknown is true (PRD §4.3).
-- ---------------------------------------------------------------------------
create or replace function private.catalog_filtered(p_workspace_id uuid, p_plan jsonb)
returns table (
  id uuid,
  first_discovered_at timestamptz,
  start_year integer,
  team_size integer,
  min_monthly_eur numeric,
  monetization_score integer,
  last_activity_at timestamptz,
  text_rank real
)
language sql
stable
set search_path = ''
as $$
  with base as (
    select
      p.id,
      p.first_discovered_at,
      p.customer_type,
      p.billing_models,
      p.pricing_status,
      p.product_status,
      p.search_vector,
      p.name,
      p.last_verified_at,
      c.country_code,
      c.company_type,
      c.founder_led,
      c.funding_status,
      c.employee_min,
      c.employee_max,
      coalesce(c.founded_year, p.launch_year) as start_year,
      coalesce(c.employee_max, c.employee_min) as team_size,
      (select min(
                case pp.billing_period when 'year' then pp.price_amount / 12 else pp.price_amount end
                * case when pp.currency = 'EUR' then 1 else fx.rate_to_eur end)
         from public.pricing_plans pp
         left join lateral (
           select f.rate_to_eur from public.fx_rates f
           where f.currency = pp.currency order by f.rate_date desc limit 1) fx on true
        where pp.product_id = p.id and pp.superseded_at is null
          and pp.price_amount > 0 and pp.billing_period in ('month', 'year')) as min_monthly_eur,
      exists (select 1 from public.pricing_plans pp
               where pp.product_id = p.id and pp.superseded_at is null
                 and (pp.custom_pricing or pp.billing_period = 'custom')) as has_custom_plan,
      exists (select 1 from public.pricing_plans pp
               where pp.product_id = p.id and pp.superseded_at is null and pp.price_amount > 0) as has_paid_plan,
      (select count(*)::integer from public.evidence_items e
        where e.product_id = p.id and e.verification_status = 'verified'
          and e.monetization_signal in ('payment_confirmed', 'customer_verified')) as monetization_score,
      greatest(p.last_verified_at,
               (select max(s.signal_date)::timestamptz from public.company_signals s
                 where s.product_id = p.id)) as last_activity_at,
      ws.is_hidden,
      ws.status as ws_status,
      case when nullif(p_plan ->> 'text', '') is null then null
           else ts_rank(p.search_vector, websearch_to_tsquery('english', p_plan ->> 'text')) end as text_rank
    from public.saas_products p
    left join public.companies c on c.id = p.company_id
    left join public.workspace_product_states ws
      on ws.product_id = p.id and ws.workspace_id = p_workspace_id
  )
  select b.id, b.first_discovered_at, b.start_year, b.team_size, b.min_monthly_eur,
         b.monetization_score, b.last_activity_at, b.text_rank
  from base b
  where
    -- hidden products (PRD §3.4)
    (coalesce((p_plan ->> 'include_hidden')::boolean, false) or coalesce(b.is_hidden, false) = false)
    -- text search (name substring or full text)
    and (nullif(p_plan ->> 'text', '') is null
         or b.search_vector @@ websearch_to_tsquery('english', p_plan ->> 'text')
         or b.name ilike '%' || replace(replace(replace(p_plan ->> 'text', '\', '\\'), '%', '\%'), '_', '\_') || '%')
    -- A. customer type
    and (p_plan -> 'customer_types' is null
         or (b.customer_type = 'unknown' and coalesce((p_plan -> 'customer_types' ->> 'include_unknown')::boolean, false))
         or b.customer_type::text in (select jsonb_array_elements_text(p_plan -> 'customer_types' -> 'values')))
    -- B. team size (ranges on employee_max, else employee_min)
    and (p_plan -> 'team' is null
         or (b.team_size is null and coalesce((p_plan -> 'team' ->> 'include_unknown')::boolean, false))
         or exists (select 1 from jsonb_array_elements(p_plan -> 'team' -> 'ranges') r
                     where b.team_size >= coalesce((r ->> 'min')::integer, 0)
                       and (r ->> 'max' is null or b.team_size <= (r ->> 'max')::integer)))
    -- C. headquarters country
    and (p_plan -> 'hq_countries' is null
         or (b.country_code is null and coalesce((p_plan -> 'hq_countries' ->> 'include_unknown')::boolean, false))
         or b.country_code in (select jsonb_array_elements_text(p_plan -> 'hq_countries' -> 'values')))
    -- D. age (founding year, else launch year)
    and (p_plan -> 'founded' is null
         or (b.start_year is null and coalesce((p_plan -> 'founded' ->> 'include_unknown')::boolean, false))
         or exists (select 1 from jsonb_array_elements(p_plan -> 'founded' -> 'ranges') r
                     where (r ->> 'min' is null or b.start_year >= (r ->> 'min')::integer)
                       and (r ->> 'max' is null or b.start_year <= (r ->> 'max')::integer)))
    -- E. categories (a parent slug includes its children)
    and (p_plan -> 'category_slugs' is null
         or exists (select 1 from public.product_categories pc
                     join public.categories cat on cat.id = pc.category_id
                     left join public.categories parent on parent.id = cat.parent_id
                     where pc.product_id = b.id
                       and (cat.slug in (select jsonb_array_elements_text(p_plan -> 'category_slugs'))
                            or parent.slug in (select jsonb_array_elements_text(p_plan -> 'category_slugs')))))
    -- F. billing models (empty array = unknown)
    and (p_plan -> 'billing_models' is null
         or (cardinality(b.billing_models) = 0 and coalesce((p_plan -> 'billing_models' ->> 'include_unknown')::boolean, false))
         or b.billing_models && array(select jsonb_array_elements_text(p_plan -> 'billing_models' -> 'values'))::public.billing_model[])
    -- G. price bands (indicative EUR monthly entry price)
    and (p_plan -> 'price' is null
         or (coalesce((p_plan -> 'price' ->> 'free')::boolean, false) and b.pricing_status = 'free')
         or (coalesce((p_plan -> 'price' ->> 'custom')::boolean, false) and (b.pricing_status = 'custom' or b.has_custom_plan))
         or (b.min_monthly_eur is null and b.pricing_status <> 'free'
             and coalesce((p_plan -> 'price' ->> 'include_unknown')::boolean, false))
         or exists (select 1 from jsonb_array_elements(p_plan -> 'price' -> 'ranges') r
                     where b.min_monthly_eur >= coalesce((r ->> 'min')::numeric, 0)
                       and (r ->> 'max' is null or b.min_monthly_eur < (r ->> 'max')::numeric)))
    -- I. commercial validation (OR inside the group)
    and (p_plan -> 'commercial_validation' is null
         or jsonb_array_length(p_plan -> 'commercial_validation') = 0
         or exists (select 1 from jsonb_array_elements_text(p_plan -> 'commercial_validation') v
                     where (v = 'paying_customers_confirmed' and b.monetization_score > 0)
                        or (v = 'customer_reviews' and (
                              exists (select 1 from public.customer_feedback f where f.product_id = b.id)
                              or exists (select 1 from public.company_signals s where s.product_id = b.id and s.signal_type = 'review_count')))
                        or (v = 'testimonials' and exists (select 1 from public.company_signals s
                              where s.product_id = b.id and s.signal_type = 'testimonial'))
                        or (v = 'case_studies' and exists (select 1 from public.company_signals s
                              where s.product_id = b.id and s.signal_type = 'case_study'))
                        or (v = 'paid_subscriptions' and b.has_paid_plan)
                        or (v = 'traction_signals' and exists (select 1 from public.company_signals s
                              where s.product_id = b.id and s.signal_type in (
                                'review_count','customer_logo','commercial_reference','product_hunt_presence',
                                'headcount_change','launch_or_update','commercial_activity')))
                        or (v = 'monetization_unverified' and b.has_paid_plan and b.monetization_score = 0)
                        or (v = 'insufficient_data' and not b.has_paid_plan and b.monetization_score = 0
                            and not exists (select 1 from public.company_signals s where s.product_id = b.id))))
    -- J. company profile (OR inside the group)
    and (p_plan -> 'company_profile' is null
         or (coalesce((p_plan -> 'company_profile' ->> 'include_unknown')::boolean, false)
             and coalesce(b.company_type, 'unknown') = 'unknown' and b.founder_led is null)
         or exists (select 1 from jsonb_array_elements_text(p_plan -> 'company_profile' -> 'values') v
                     where (v = 'founder_led' and b.founder_led)
                        or (v = 'indie_saas' and b.company_type = 'independent' and b.team_size <= 20
                            and b.funding_status <> 'externally_funded')
                        or (v = 'small_team' and b.team_size <= 20)
                        or (v = 'independent' and b.company_type = 'independent')
                        or (v = 'funded' and b.funding_status = 'externally_funded')
                        or (v = 'bootstrapped' and b.funding_status = 'bootstrapped')
                        or (v = 'subsidiary_or_group' and b.company_type in ('subsidiary', 'public_company'))
                        or (v = 'unknown' and coalesce(b.company_type, 'unknown') = 'unknown')))
    -- O. configurable exclusions (each one removes matching products)
    and not exists (
      select 1 from jsonb_array_elements_text(coalesce(p_plan -> 'configurable_exclusions', '[]'::jsonb)) x
      where (x = 'b2c_only' and b.customer_type = 'b2c')
         or (x = 'groups_and_large_companies' and (b.company_type in ('subsidiary', 'public_company') or b.employee_min > 100))
         or (x = 'free_without_monetization' and b.pricing_status = 'free')
         or (x = 'no_identifiable_activity' and b.product_status = 'discontinued')
         or (x = 'too_recent_without_demand_proof'
             and b.start_year >= coalesce((p_plan ->> 'current_year')::integer, extract(year from now())::integer) - 1
             and b.monetization_score = 0
             and not exists (select 1 from public.customer_feedback f where f.product_id = b.id)
             and not exists (select 1 from public.company_signals s where s.product_id = b.id
                               and s.signal_type in ('review_count', 'testimonial', 'case_study')))
         or (x = 'very_technical_devtools' and exists (
               select 1 from public.product_categories pc
               join public.categories cat on cat.id = pc.category_id
               join public.categories parent on parent.id = cat.parent_id
               where pc.product_id = b.id and pc.is_primary and parent.slug = 'developer-tools'))
         or (x = 'already_analyzed_and_rejected' and b.ws_status = 'rejected'))
$$;

grant execute on function private.catalog_filtered(uuid, jsonb) to authenticated;

-- Sort keys of PRD §3.5 available before Sprint 5. All sort values are
-- numeric and ordered descending; ascending keys are negated; unknown
-- values sort last; `id` breaks ties so pagination never repeats a row.
create or replace function private.catalog_sort_value(
  p_sort text, p_seed integer, p_id uuid, p_first_discovered_at timestamptz, p_start_year integer,
  p_team_size integer, p_monetization_score integer, p_last_activity_at timestamptz, p_text_rank real)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select coalesce(case p_sort
    when 'recently_added' then extract(epoch from p_first_discovered_at)::numeric
    when 'newest' then p_start_year::numeric
    when 'oldest' then -p_start_year::numeric
    when 'smallest_team' then -p_team_size::numeric
    when 'best_monetization_evidence' then p_monetization_score::numeric
    when 'most_recent_activity' then extract(epoch from p_last_activity_at)::numeric
    when 'random' then -(('x' || substr(md5(p_id::text || coalesce(p_seed, 0)::text), 1, 8))::bit(32)::bigint)::numeric
    when 'relevance' then coalesce(p_text_rank::numeric * 1e12, extract(epoch from p_first_discovered_at)::numeric)
  end, '-Infinity'::numeric)
$$;

grant execute on function private.catalog_sort_value(text, integer, uuid, timestamptz, integer, integer, integer, timestamptz, real) to authenticated;

create or replace function public.catalog_search(
  p_workspace_id uuid,
  p_plan jsonb,
  p_sort text default 'relevance',
  p_seed integer default 0,
  p_after_value numeric default null,
  p_after_id uuid default null,
  p_limit integer default 30)
returns table (
  id uuid,
  sort_value numeric,
  slug text,
  name text,
  tagline text,
  short_description text,
  website_url text,
  logo_url text,
  customer_type public.customer_type,
  pricing_status public.pricing_status,
  billing_models public.billing_model[],
  country_code char(2),
  employee_min integer,
  employee_max integer,
  start_year integer,
  categories jsonb,
  is_favorite boolean,
  is_hidden boolean,
  workspace_status public.opportunity_status,
  last_viewed_at timestamptz,
  in_collection boolean)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_sort not in ('relevance','recently_added','newest','oldest','smallest_team',
                    'best_monetization_evidence','most_recent_activity','random') then
    raise exception 'VALIDATION_ERROR: unsupported sort %', p_sort using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'VALIDATION_ERROR: limit' using errcode = '22023';
  end if;
  if not private.is_workspace_member(p_workspace_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  with ranked as (
    select f.id,
           private.catalog_sort_value(p_sort, p_seed, f.id, f.first_discovered_at, f.start_year,
                                      f.team_size, f.monetization_score, f.last_activity_at, f.text_rank) as sv
    from private.catalog_filtered(p_workspace_id, p_plan) f
  )
  select r.id, r.sv, p.slug, p.name, p.tagline, p.short_description, p.website_url, p.logo_url,
         p.customer_type, p.pricing_status, p.billing_models, c.country_code, c.employee_min,
         c.employee_max, coalesce(c.founded_year, p.launch_year),
         coalesce((select jsonb_agg(jsonb_build_object('slug', cat.slug, 'name', cat.name, 'is_primary', pc.is_primary)
                                    order by pc.is_primary desc, cat.name)
                     from public.product_categories pc join public.categories cat on cat.id = pc.category_id
                    where pc.product_id = p.id), '[]'::jsonb),
         coalesce(ws.is_favorite, false), coalesce(ws.is_hidden, false), ws.status, ws.last_viewed_at,
         exists (select 1 from public.collection_items ci
                  where ci.workspace_id = p_workspace_id and ci.product_id = p.id)
  from ranked r
  join public.saas_products p on p.id = r.id
  left join public.companies c on c.id = p.company_id
  left join public.workspace_product_states ws on ws.product_id = p.id and ws.workspace_id = p_workspace_id
  where p_after_value is null or (r.sv, r.id) < (p_after_value, p_after_id)
  order by r.sv desc, r.id desc
  limit p_limit;
end;
$$;

create or replace function public.catalog_count(p_workspace_id uuid, p_plan jsonb)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.is_workspace_member(p_workspace_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return (select count(*) from private.catalog_filtered(p_workspace_id, p_plan));
end;
$$;

revoke all on function public.catalog_search(uuid, jsonb, text, integer, numeric, uuid, integer) from public, anon;
revoke all on function public.catalog_count(uuid, jsonb) from public, anon;
grant execute on function public.catalog_search(uuid, jsonb, text, integer, numeric, uuid, integer) to authenticated;
grant execute on function public.catalog_count(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Manual add (Implementation Blueprint §3 job RPC table, PRD §18).
-- service_role only. The API has already validated the entry with Zod,
-- normalised the URL and run the exclusion classifier (§5.4).
-- ---------------------------------------------------------------------------
create or replace function public.sor_manual_add_product(
  p_workspace_id uuid, p_requested_by uuid, p_entry jsonb, p_exclusion jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := p_entry ->> 'canonical_url';
  v_domain text := p_entry ->> 'domain';
  v_existing uuid;
  v_source uuid;
  v_record uuid;
  v_snapshot uuid;
  v_company uuid;
  v_product uuid;
  v_evidence uuid;
  v_status public.exclusion_status := (p_exclusion ->> 'status')::public.exclusion_status;
  v_slug text;
  v_hash text;
  v_first boolean := true;
  v_category record;
begin
  if not exists (select 1 from public.workspace_members m
                  where m.workspace_id = p_workspace_id and m.user_id = p_requested_by
                    and m.role in ('owner', 'admin', 'member')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_url is null or v_url !~* '^https?://' or coalesce(trim(p_entry ->> 'name'), '') = '' then
    raise exception 'VALIDATION_ERROR: entry' using errcode = '22023';
  end if;
  if v_status is null or v_status = 'unassessed' then
    raise exception 'VALIDATION_ERROR: exclusion' using errcode = '22023';
  end if;

  -- Identity: an active canonical URL identifies the product (ADR-002).
  select i.product_id into v_existing from public.entity_identifiers i
   where i.identifier_type = 'canonical_url' and i.value_normalized = v_url
     and i.product_id is not null and i.valid_to is null;
  if v_existing is not null then
    return jsonb_build_object('status', 'existing', 'product_id', v_existing,
      'exclusion_status', (select p.exclusion_status from public.saas_products p where p.id = v_existing));
  end if;

  select s.id into v_source from public.sources s where s.source_key = 'manual_entry';
  v_hash := encode(pg_catalog.sha256(convert_to(p_entry::text, 'UTF8')), 'hex');

  if nullif(trim(p_entry ->> 'company_name'), '') is not null then
    v_slug := private.unique_slug('companies', coalesce(p_entry ->> 'company_slug_base', p_entry ->> 'company_name'));
    insert into public.companies (name, slug) values (trim(p_entry ->> 'company_name'), v_slug)
      returning id into v_company;
  end if;

  v_slug := private.unique_slug('saas_products', coalesce(p_entry ->> 'slug_base', p_entry ->> 'name'));
  insert into public.saas_products (company_id, name, slug, website_url, primary_domain, short_description,
                                    record_status, exclusion_status, discovery_source_id)
  values (v_company, trim(p_entry ->> 'name'), v_slug, v_url, v_domain,
          nullif(trim(p_entry ->> 'short_description'), ''),
          case when v_status = 'eligible' then 'active'::public.record_status else 'candidate'::public.record_status end,
          v_status, v_source)
  returning id into v_product;

  insert into public.source_records (source_id, canonical_url, title)
    values (v_source, v_url, trim(p_entry ->> 'name'))
    on conflict (source_id, canonical_url) do update set title = excluded.title
    returning id into v_record;
  insert into public.source_snapshots (source_record_id, content_hash, fetch_status, storage_status, extracted_metadata, extraction_status)
    values (v_record, v_hash, 'ok', 'reference_only',
            jsonb_build_object('entered_by', p_requested_by, 'workspace_id', p_workspace_id, 'note', p_entry ->> 'note'),
            'completed')
    on conflict (source_record_id, content_hash) do update set last_retrieved_at = now()
    returning id into v_snapshot;

  insert into public.evidence_items (product_id, company_id, source_snapshot_id, claim_type, claim_text, claim_value,
                                     evidence_type, fact_status, reliability_level, extraction_method)
    values (v_product, v_company, v_snapshot, 'product_exists', 'Product declared by a workspace member',
            jsonb_build_object('name', p_entry ->> 'name', 'website_url', v_url,
                               'short_description', p_entry ->> 'short_description'),
            'user_declared', 'declared', 4, 'manual_entry')
    returning id into v_evidence;
  insert into public.catalog_field_provenance (product_id, field_key, evidence_id, fact_status) values
    (v_product, 'name', v_evidence, 'declared'),
    (v_product, 'website_url', v_evidence, 'declared');
  if nullif(trim(p_entry ->> 'short_description'), '') is not null then
    insert into public.catalog_field_provenance (product_id, field_key, evidence_id, fact_status)
      values (v_product, 'short_description', v_evidence, 'declared');
  end if;

  insert into public.entity_identifiers (product_id, identifier_type, value_normalized, is_primary, evidence_id)
    values (v_product, 'canonical_url', v_url, true, v_evidence);
  if v_domain is not null then
    insert into public.entity_identifiers (product_id, identifier_type, value_normalized, evidence_id)
      values (v_product, 'domain', v_domain, v_evidence);
  end if;

  -- Only user-visible categories may be declared; the first is primary.
  for v_category in
    select c.id from jsonb_array_elements_text(coalesce(p_entry -> 'category_slugs', '[]'::jsonb))
           with ordinality as s(slug, ord)
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
    values (p_workspace_id, p_requested_by, 'user', 'catalog.manual_add', 'saas_product', v_product,
            jsonb_build_object('exclusion_status', v_status));

  return jsonb_build_object('status', 'created', 'product_id', v_product, 'exclusion_status', v_status);
end;
$$;

-- Slug helper: lowercase ascii words joined by hyphens, suffixed on collision.
-- The API passes accent-free bases computed by @sor/domain slugify().
create or replace function private.unique_slug(p_table text, p_name text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_base text := trim(both '-' from regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'));
  v_slug text;
  v_n integer := 1;
  v_taken boolean;
begin
  if v_base = '' then v_base := 'item'; end if;
  v_base := left(v_base, 200);
  v_slug := v_base;
  loop
    execute format('select exists (select 1 from public.%I where slug = $1)', p_table) into v_taken using v_slug;
    exit when not v_taken;
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;
  return v_slug;
end;
$$;

revoke all on function public.sor_manual_add_product(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sor_manual_add_product(uuid, uuid, jsonb, jsonb) to service_role;
revoke all on function private.unique_slug(text, text) from public;

-- ---------------------------------------------------------------------------
-- Platform operator actions (ADR-007, ADR-010, PD-12). service_role only;
-- the API passes the verified session user, who must be a platform operator.
-- ---------------------------------------------------------------------------
create or replace function public.sor_operator_exclusion_decision(
  p_operator uuid, p_product_id uuid, p_decision public.exclusion_status, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.exclusion_status;
begin
  if not exists (select 1 from public.platform_operators o where o.user_id = p_operator) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_decision not in ('eligible', 'excluded') then
    raise exception 'VALIDATION_ERROR: decision' using errcode = '22023';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'VALIDATION_ERROR: reason' using errcode = '22023';
  end if;
  select p.exclusion_status into v_current from public.saas_products p where p.id = p_product_id for update;
  if v_current is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  -- Only a needs_review outcome can be resolved; a core-rule exclusion is
  -- fixed by correcting the data and re-running the classifier (§5.4).
  if v_current <> 'needs_review' then
    raise exception 'INVALID_STATE: only needs_review products can be resolved' using errcode = '55000';
  end if;

  insert into public.product_exclusion_assessments (product_id, status, rule_set_version, decided_by,
                                                    operator_user_id, reason)
    values (p_product_id, p_decision, 'operator', 'platform_operator', p_operator, trim(p_reason));
  update public.saas_products
     set exclusion_status = p_decision,
         record_status = case when p_decision = 'eligible' and record_status in ('candidate', 'needs_review')
                              then 'active'::public.record_status else record_status end
   where id = p_product_id;
  insert into public.audit_logs (actor_user_id, actor_kind, action, resource_type, resource_id, metadata)
    values (p_operator, 'platform_operator', 'catalog.exclusion_decision', 'saas_product', p_product_id,
            jsonb_build_object('decision', p_decision, 'reason', trim(p_reason)));
end;
$$;

create or replace function public.sor_operator_resolve_report(
  p_operator uuid, p_report_id uuid, p_status text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.platform_operators o where o.user_id = p_operator) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_status not in ('accepted', 'rejected') then
    raise exception 'VALIDATION_ERROR: status' using errcode = '22023';
  end if;
  update public.catalog_correction_reports
     set status = p_status, resolved_by = p_operator, resolution_note = nullif(trim(p_note), ''),
         resolved_at = now()
   where id = p_report_id and status = 'open';
  if not found then
    raise exception 'INVALID_STATE: report not open or not found' using errcode = '55000';
  end if;
  insert into public.audit_logs (actor_user_id, actor_kind, action, resource_type, resource_id, metadata)
    values (p_operator, 'platform_operator', 'catalog.report_resolution', 'catalog_correction_report',
            p_report_id, jsonb_build_object('status', p_status));
end;
$$;

revoke all on function public.sor_operator_exclusion_decision(uuid, uuid, public.exclusion_status, text) from public, anon, authenticated;
revoke all on function public.sor_operator_resolve_report(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.sor_operator_exclusion_decision(uuid, uuid, public.exclusion_status, text) to service_role;
grant execute on function public.sor_operator_resolve_report(uuid, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Workspace members (Implementation Blueprint §10 "W/members"). Signup is
-- disabled, so members are invited by e-mail through the server.
-- ---------------------------------------------------------------------------

-- Member list with e-mail addresses, for members of the workspace only.
create or replace function public.workspace_member_directory(p_workspace_id uuid)
returns table (user_id uuid, email text, role public.workspace_role, joined_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_workspace_member(p_workspace_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, m.role, m.joined_at
      from public.workspace_members m
      join auth.users u on u.id = m.user_id
     where m.workspace_id = p_workspace_id
     order by m.joined_at, m.user_id;
end;
$$;
revoke all on function public.workspace_member_directory(uuid) from public, anon;
grant execute on function public.workspace_member_directory(uuid) to authenticated;

-- Adds an existing account to a workspace. service_role only: the API has
-- verified the session user (p_actor). Raises P0002 when no account has this
-- e-mail; the API then sends a Supabase Auth invitation and calls it again.
create or replace function public.sor_add_member_by_email(
  p_workspace_id uuid, p_actor uuid, p_email text, p_role public.workspace_role)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if not exists (select 1 from public.workspace_members m
                  where m.workspace_id = p_workspace_id and m.user_id = p_actor
                    and m.role in ('owner', 'admin')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_role is null or p_role = 'owner' then
    raise exception 'VALIDATION_ERROR: role' using errcode = '22023';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.workspace_members m
              where m.workspace_id = p_workspace_id and m.user_id = v_user) then
    raise exception 'INVALID_STATE: already a member' using errcode = '55000';
  end if;
  insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (p_workspace_id, v_user, p_role, p_actor);
  insert into public.audit_logs (workspace_id, actor_user_id, actor_kind, action, resource_type, resource_id, metadata)
    values (p_workspace_id, p_actor, 'user', 'workspace.member_added', 'workspace_member', v_user,
            jsonb_build_object('role', p_role));
  return v_user;
end;
$$;
revoke all on function public.sor_add_member_by_email(uuid, uuid, text, public.workspace_role) from public, anon, authenticated;
grant execute on function public.sor_add_member_by_email(uuid, uuid, text, public.workspace_role) to service_role;
