-- M2 — global catalog and evidence
-- Source: docs/IMPLEMENTATION_BLUEPRINT.md §3 (M2). Keep both in sync.

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 200),
  legal_name text,
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,220}$'),
  website_url text check (website_url is null or website_url ~* '^https?://'),
  primary_domain text,
  country_code char(2) check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  city text,
  founded_year integer check (founded_year is null or founded_year between 1800 and 2100),
  employee_min integer check (employee_min is null or employee_min >= 0),
  employee_max integer check (employee_max is null or employee_max >= 0),
  company_type public.company_type not null default 'unknown',
  founder_led boolean,
  funding_status public.funding_status not null default 'unknown',
  linkedin_url text check (linkedin_url is null or linkedin_url ~* '^https?://'),
  description text,
  verification_status public.verification_status not null default 'unverified',
  merged_into_company_id uuid references public.companies(id),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (employee_min is null or employee_max is null or employee_min <= employee_max),
  check (merged_into_company_id is null or merged_into_company_id <> id)
);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique check (source_key ~ '^[a-z0-9_]{2,60}$'),
  name text not null unique,
  source_type public.source_type not null,
  access_method public.source_access_method not null,
  base_url text,
  terms_url text,
  terms_reviewed_at timestamptz,
  terms_review_notes text,
  integration_status public.source_integration_status not null default 'planned',
  default_reliability_level smallint not null check (default_reliability_level between 1 and 4),
  rate_limit_per_minute integer check (rate_limit_per_minute is null or rate_limit_per_minute > 0),
  quota_per_day integer check (quota_per_day is null or quota_per_day > 0),
  is_enabled boolean not null default false,
  last_sync_at timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- PRD §6.3: a source is not usable until its connector is integrated.
  check (is_enabled = false or integration_status = 'integrated')
);

create table public.saas_products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  name text not null check (length(name) between 1 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,220}$'),
  website_url text check (website_url is null or website_url ~* '^https?://'),
  primary_domain text,                 -- not unique: one company may host several products on one domain
  tagline text check (tagline is null or length(tagline) <= 300),
  short_description text check (short_description is null or length(short_description) <= 300),
  description text,
  problem_solved text,                 -- PRD §5.4 (evidence via catalog_field_provenance)
  value_proposition text,
  use_cases text[] not null default '{}',
  compatibilities text[] not null default '{}',
  customer_type public.customer_type not null default 'unknown',
  billing_models public.billing_model[] not null default '{}',
  pricing_status public.pricing_status not null default 'unknown',
  launch_year integer check (launch_year is null or launch_year between 1900 and 2100),
  product_status public.product_status not null default 'unknown',
  maturity_stage public.maturity_stage not null default 'unknown',
  languages text[] not null default '{}',
  technology_tags public.technology_tag[] not null default '{}',
  served_countries text[] not null default '{}' check (private.valid_country_codes(served_countries)),
  customer_countries text[] not null default '{}' check (private.valid_country_codes(customer_countries)),
  france_presence public.presence_status not null default 'unknown',
  europe_presence public.presence_status not null default 'unknown',
  french_version public.presence_status not null default 'unknown',
  complexity_level text not null default 'unknown'
    check (complexity_level in ('low','medium','high','unknown')),
  documentation_url text check (documentation_url is null or documentation_url ~* '^https?://'),
  record_status public.record_status not null default 'candidate',
  exclusion_status public.exclusion_status not null default 'unassessed',
  merged_into_product_id uuid references public.saas_products(id),
  discovery_source_id uuid references public.sources(id),
  first_discovered_at timestamptz not null default now(),
  verification_status public.verification_status not null default 'unverified',
  last_verified_at timestamptz,
  search_vector tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (merged_into_product_id is null or merged_into_product_id <> id),
  check ((record_status = 'merged') = (merged_into_product_id is not null)),
  -- An active product must have passed the exclusion classifier.
  check (record_status <> 'active' or exclusion_status <> 'unassessed')
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete restrict,
  name text not null,
  -- Child slugs are prefixed by the parent slug, so the same name may
  -- appear under two parents (PRD: "Conversion Optimization", "Monitoring").
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,120}$'),
  description text,
  is_active boolean not null default true,
  is_user_visible boolean not null default true,
  is_permanently_excluded boolean not null default false,
  priority_weight integer not null default 0 check (priority_weight between -100 and 100),
  created_at timestamptz not null default now(),
  unique (parent_id, name),
  check (not is_permanently_excluded or not is_user_visible)
);

create table public.product_categories (
  product_id uuid not null references public.saas_products(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  is_primary boolean not null default false,
  confidence numeric(5,2) check (confidence between 0 and 100),
  primary key (product_id, category_id)
);
create unique index product_one_primary_category
  on public.product_categories(product_id) where is_primary;

create table public.source_records (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete restrict,
  canonical_url text not null check (canonical_url ~* '^https?://'),
  external_id text,
  title text,
  first_seen_at timestamptz not null default now(),
  unique (source_id, canonical_url)
);

-- One row per distinct content version: history is never overwritten.
create table public.source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_record_id uuid not null references public.source_records(id) on delete restrict,
  content_hash text not null check (length(content_hash) >= 16),
  fetch_status public.fetch_status not null,
  http_status integer,
  published_at timestamptz,
  retrieved_at timestamptz not null default now(),
  last_retrieved_at timestamptz not null default now(),
  storage_status public.content_storage_status not null default 'reference_only',
  raw_content_location text,           -- private Storage path, only when terms permit
  extracted_metadata jsonb not null default '{}'::jsonb,
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending','completed','failed','blocked','not_applicable')),
  unique (source_record_id, content_hash),
  check (storage_status in ('stored_full','stored_excerpt') or raw_content_location is null)
);

create table public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.saas_products(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  category_id uuid references public.categories(id) on delete restrict,
  source_snapshot_id uuid not null references public.source_snapshots(id) on delete restrict,
  claim_type public.claim_type not null,
  claim_text text not null check (length(claim_text) between 1 and 5000),
  claim_value jsonb,
  evidence_type public.evidence_type not null,
  fact_status public.fact_status not null,
  monetization_signal public.monetization_signal,
  reliability_level smallint not null check (reliability_level between 1 and 4),
  confidence numeric(5,2) check (confidence between 0 and 100),
  verification_status public.verification_status not null default 'unverified',
  verified_at timestamptz,
  published_at timestamptz,
  observed_at timestamptz not null default now(),
  expires_at timestamptz,
  extraction_method public.extraction_method not null,
  extracted_by_step_id uuid,           -- FK added in M5
  created_at timestamptz not null default now(),
  -- Scope: product, company, category, or market-level claim.
  check (product_id is not null or company_id is not null or category_id is not null
         or claim_type in ('market_size','market_trend')),
  check (claim_type <> 'paid_customer_signal' or monetization_signal is not null),
  -- PRD §13.2: levels 3–4 are never direct proof of monetization.
  check (monetization_signal not in ('payment_confirmed','customer_verified')
         or reliability_level <= 2),
  check (claim_type <> 'traffic' or fact_status = 'estimated'),
  check (verification_status <> 'verified' or verified_at is not null)
);

-- PRD §5.3 founders and public professional profiles. Only public,
-- professional information with evidence; no private contact data.
create table public.company_people (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name text not null check (length(full_name) between 1 and 200),
  role text not null check (role in ('founder','co_founder','executive','other')),
  public_profile_url text check (public_profile_url is null or public_profile_url ~* '^https?://'),
  evidence_id uuid not null references public.evidence_items(id) on delete restrict,
  fact_status public.fact_status not null,
  created_at timestamptz not null default now(),
  unique (company_id, full_name, role)
);

create table public.entity_identifiers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.saas_products(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  identifier_type text not null
    check (identifier_type in ('canonical_url','domain','external_id','alias_name')),
  value_normalized text not null check (length(value_normalized) between 1 and 500),
  source_id uuid references public.sources(id),
  is_primary boolean not null default false,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  evidence_id uuid references public.evidence_items(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((product_id is null) <> (company_id is null)),
  check (identifier_type <> 'external_id' or source_id is not null),
  check (valid_to is null or valid_to > valid_from)
);
create unique index identifiers_active_product_canonical_url
  on public.entity_identifiers(value_normalized)
  where identifier_type = 'canonical_url' and product_id is not null and valid_to is null;
create unique index identifiers_active_external_id
  on public.entity_identifiers(source_id, value_normalized)
  where identifier_type = 'external_id' and valid_to is null;
create index identifiers_lookup on public.entity_identifiers(identifier_type, value_normalized);

create table public.catalog_field_provenance (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.saas_products(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  field_key text not null check (field_key ~ '^[a-z_]{2,60}$'),
  evidence_id uuid not null references public.evidence_items(id) on delete restrict,
  fact_status public.fact_status not null,
  is_current boolean not null default true,
  selected_at timestamptz not null default now(),
  check ((product_id is null) <> (company_id is null))
);
create unique index provenance_current_product
  on public.catalog_field_provenance(product_id, field_key) where is_current and product_id is not null;
create unique index provenance_current_company
  on public.catalog_field_provenance(company_id, field_key) where is_current and company_id is not null;

create table public.evidence_conflicts (
  id uuid primary key default gen_random_uuid(),
  evidence_a_id uuid not null references public.evidence_items(id) on delete cascade,
  evidence_b_id uuid not null references public.evidence_items(id) on delete cascade,
  product_id uuid references public.saas_products(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  field_key text not null,
  status text not null default 'open'
    check (status in ('open','resolved_a','resolved_b','both_valid','dismissed')),
  note text,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (evidence_a_id < evidence_b_id),
  unique (evidence_a_id, evidence_b_id, field_key)
);

create table public.product_features (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.saas_products(id) on delete cascade,
  name text not null check (length(name) between 1 and 160),
  description text,
  feature_category text,
  is_primary boolean not null default false,   -- PRD §5.4 main vs secondary
  availability public.feature_availability not null default 'unknown',
  evidence_id uuid references public.evidence_items(id) on delete restrict,
  confidence numeric(5,2) check (confidence between 0 and 100),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (product_id, name),
  -- Any positive or negative availability claim needs evidence; a feature
  -- that was simply not found is 'not_observed' (CLAUDE.md §9).
  check (availability in ('not_observed','unknown') or evidence_id is not null)
);

create table public.product_integrations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.saas_products(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  integration_category public.integration_category not null default 'other',
  availability public.feature_availability not null default 'unknown',
  evidence_id uuid references public.evidence_items(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (product_id, name),
  check (availability in ('not_observed','unknown') or evidence_id is not null)
);

create table public.pricing_plans (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.saas_products(id) on delete cascade,
  plan_name text not null check (length(plan_name) between 1 and 120),
  billing_period text not null default 'unknown'
    check (billing_period in ('month','year','usage','one_time','custom','unknown')),
  price_amount numeric(12,2) check (price_amount is null or price_amount >= 0),
  currency char(3) check (currency is null or currency ~ '^[A-Z]{3}$'),
  price_per_user boolean,
  minimum_seats integer check (minimum_seats is null or minimum_seats > 0),
  has_free_trial boolean,
  has_free_plan boolean,
  custom_pricing boolean,
  is_entry_plan boolean not null default false,
  is_enterprise_plan boolean not null default false,
  evidence_id uuid not null references public.evidence_items(id) on delete restrict,
  checked_at timestamptz not null default now(),
  superseded_at timestamptz,
  check (price_amount is null or currency is not null)
);

create table public.company_signals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  product_id uuid references public.saas_products(id) on delete cascade,
  signal_type text not null check (signal_type in (
    'review_count','review_rating','testimonial','case_study','customer_logo',
    'commercial_reference','product_hunt_presence','founder_activity',
    'headcount_change','launch_or_update','traffic_estimate',
    'funding_announcement','commercial_activity')),
  signal_value jsonb not null,
  signal_date date,
  evidence_id uuid not null references public.evidence_items(id) on delete restrict,
  fact_status public.fact_status not null,
  confidence numeric(5,2) check (confidence between 0 and 100),
  verification_status public.verification_status not null default 'unverified',
  created_at timestamptz not null default now(),
  check (product_id is not null or company_id is not null),
  -- PRD §5.6: traffic estimates are never measured visits.
  check (signal_type <> 'traffic_estimate' or fact_status = 'estimated')
);

create table public.customer_feedback (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.saas_products(id) on delete cascade,
  source_snapshot_id uuid not null references public.source_snapshots(id) on delete restrict,
  evidence_item_id uuid not null unique references public.evidence_items(id) on delete restrict,
  external_review_id text,
  published_at timestamptz,
  rating numeric(4,2) check (rating is null or rating >= 0),
  rating_scale_max numeric(4,2) check (rating_scale_max is null or rating_scale_max > 0),
  original_text text,                  -- only when source terms permit (PRD §12.5)
  summarized_text text,
  language text,
  sentiment public.review_sentiment not null default 'unknown',
  content_storage_status public.content_storage_status not null,
  author_reference_hash text,          -- salted hash, only when permitted
  author_company_reference text,       -- only when stated by the source
  deduplication_hash text not null,
  is_near_duplicate_of uuid references public.customer_feedback(id),
  created_at timestamptz not null default now(),
  check (content_storage_status <> 'stored_full' or original_text is not null),
  check (content_storage_status not in ('reference_only','removed') or original_text is null),
  check (rating is null or rating_scale_max is null or rating <= rating_scale_max)
);
create unique index customer_feedback_dedupe
  on public.customer_feedback(product_id, deduplication_hash);

-- Direction: competitor_product_id competes for product_id's buyers.
-- The relationship is not assumed symmetric.
create table public.competitor_links (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.saas_products(id) on delete cascade,
  competitor_product_id uuid not null references public.saas_products(id) on delete cascade,
  relationship_type public.competitor_relationship not null,
  similarity_score numeric(5,2) check (similarity_score between 0 and 100),
  explanation text,
  evidence_id uuid references public.evidence_items(id) on delete set null,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  check (product_id <> competitor_product_id),
  unique (product_id, competitor_product_id)
);

create table public.product_exclusion_assessments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.saas_products(id) on delete cascade,
  status public.exclusion_status not null check (status <> 'unassessed'),
  rule_set_version text not null,
  matched_rules jsonb not null default '[]'::jsonb,
  incidental_mentions jsonb not null default '[]'::jsonb,
  decided_by text not null check (decided_by in ('rule_engine','platform_operator')),
  operator_user_id uuid references auth.users(id),
  reason text,
  created_at timestamptz not null default now(),
  check ((decided_by = 'platform_operator') = (operator_user_id is not null)),
  check (decided_by <> 'platform_operator' or reason is not null)
);

create table public.fx_rates (
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  rate_date date not null,
  rate_to_eur numeric(18,8) not null check (rate_to_eur > 0),
  source_key text not null,
  primary key (currency, rate_date)
);

-- Indexes (every RLS predicate and filter column)
create index companies_country_idx on public.companies(country_code);
create index companies_employee_range_idx on public.companies(employee_min, employee_max);
create index products_company_idx on public.saas_products(company_id);
create index products_visibility_idx on public.saas_products(record_status, exclusion_status);
create index products_created_idx on public.saas_products(created_at desc, id);
create index products_verified_idx on public.saas_products(last_verified_at desc);
create index products_domain_idx on public.saas_products(primary_domain);
create index products_billing_models_idx on public.saas_products using gin(billing_models);
create index products_technology_idx on public.saas_products using gin(technology_tags);
create index products_served_countries_idx on public.saas_products using gin(served_countries);
create index product_categories_category_idx on public.product_categories(category_id, product_id);
create index snapshots_record_idx on public.source_snapshots(source_record_id, retrieved_at desc);
create index evidence_product_claim_idx on public.evidence_items(product_id, claim_type);
create index evidence_company_claim_idx on public.evidence_items(company_id, claim_type);
create index evidence_snapshot_idx on public.evidence_items(source_snapshot_id);
create index feedback_product_date_idx on public.customer_feedback(product_id, published_at desc);
create index competitors_product_idx on public.competitor_links(product_id);
create index pricing_product_idx on public.pricing_plans(product_id) where superseded_at is null;
create index features_product_idx on public.product_features(product_id);
create index integrations_product_idx on public.product_integrations(product_id);
create index signals_product_idx on public.company_signals(product_id, signal_type);
create index signals_company_idx on public.company_signals(company_id, signal_type);
create index exclusion_assessments_product_idx on public.product_exclusion_assessments(product_id, created_at desc);

-- Search vector (config isolated in one function; French-query behaviour
-- is tested in Sprint 2).
create or replace function private.refresh_product_search_vector()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.name,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.tagline,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.short_description,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.description,'')), 'C');
  return new;
end;
$$;
create trigger saas_products_search_vector
before insert or update of name, tagline, short_description, description
on public.saas_products
for each row execute function private.refresh_product_search_vector();
create index products_search_vector_idx on public.saas_products using gin(search_vector);

create trigger companies_updated_at before update on public.companies
for each row execute function private.set_updated_at();
create trigger products_updated_at before update on public.saas_products
for each row execute function private.set_updated_at();
create trigger sources_updated_at before update on public.sources
for each row execute function private.set_updated_at();

-- Integrity: evidence attached to a catalog row must belong to the same
-- product (or to the product's company).
create or replace function private.assert_evidence_for_product(p_evidence_id uuid, p_product_id uuid)
returns void language plpgsql stable set search_path = ''
as $$
declare ok boolean;
begin
  if p_evidence_id is null then return; end if;
  select exists (
    select 1
    from public.evidence_items e
    left join public.saas_products p on p.id = p_product_id
    where e.id = p_evidence_id
      and (e.product_id = p_product_id
           or (e.product_id is null and e.company_id is not null and e.company_id = p.company_id))
  ) into ok;
  if not ok then
    raise exception 'EVIDENCE_SCOPE_VIOLATION: evidence % does not belong to product %',
      p_evidence_id, p_product_id using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function private.trg_evidence_scope_product()
returns trigger language plpgsql set search_path = ''
as $$
begin
  perform private.assert_evidence_for_product(new.evidence_id, new.product_id);
  return new;
end;
$$;

create trigger product_features_evidence_scope before insert or update of evidence_id, product_id
on public.product_features for each row execute function private.trg_evidence_scope_product();
create trigger product_integrations_evidence_scope before insert or update of evidence_id, product_id
on public.product_integrations for each row execute function private.trg_evidence_scope_product();
create trigger pricing_plans_evidence_scope before insert or update of evidence_id, product_id
on public.pricing_plans for each row execute function private.trg_evidence_scope_product();

create or replace function private.trg_competitor_evidence_scope()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.evidence_id is not null and not exists (
    select 1 from public.evidence_items e
    where e.id = new.evidence_id
      and e.product_id in (new.product_id, new.competitor_product_id)
  ) then
    raise exception 'EVIDENCE_SCOPE_VIOLATION' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger competitor_links_evidence_scope before insert or update of evidence_id
on public.competitor_links for each row execute function private.trg_competitor_evidence_scope();

create or replace function private.trg_evidence_entity_consistency()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.product_id is not null and new.company_id is not null and not exists (
    select 1 from public.saas_products p
    where p.id = new.product_id and p.company_id = new.company_id
  ) then
    raise exception 'EVIDENCE_SCOPE_VIOLATION: product/company mismatch' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger evidence_entity_consistency before insert or update of product_id, company_id
on public.evidence_items for each row execute function private.trg_evidence_entity_consistency();

create or replace function private.trg_feedback_evidence_consistency()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.evidence_items e
    where e.id = new.evidence_item_id
      and e.product_id = new.product_id
      and e.source_snapshot_id = new.source_snapshot_id
      and e.claim_type = 'customer_feedback'
      and e.evidence_type = 'customer_review'
  ) then
    raise exception 'EVIDENCE_SCOPE_VIOLATION: feedback evidence mismatch' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger customer_feedback_evidence_consistency before insert or update
on public.customer_feedback for each row execute function private.trg_feedback_evidence_consistency();

create or replace function private.trg_provenance_scope()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.product_id is not null then
    perform private.assert_evidence_for_product(new.evidence_id, new.product_id);
  elsif not exists (
    select 1 from public.evidence_items e
    where e.id = new.evidence_id and e.company_id = new.company_id
  ) then
    raise exception 'EVIDENCE_SCOPE_VIOLATION' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger provenance_scope before insert or update
on public.catalog_field_provenance for each row execute function private.trg_provenance_scope();

-- Exclusion guard: an operator cannot make a product eligible while one
-- of its primary categories is permanently excluded.
create or replace function private.trg_exclusion_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.exclusion_status = 'eligible' and exists (
    select 1 from public.product_categories pc
    join public.categories c on c.id = pc.category_id
    where pc.product_id = new.id and pc.is_primary and c.is_permanently_excluded
  ) then
    raise exception 'EXCLUDED_CATEGORY: product % has a permanently excluded primary category', new.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger saas_products_exclusion_guard before insert or update of exclusion_status
on public.saas_products for each row execute function private.trg_exclusion_guard();

-- Symmetric guard: an eligible product cannot receive a permanently
-- excluded primary category without first being re-classified.
create or replace function private.trg_category_exclusion_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.is_primary
     and exists (select 1 from public.categories c where c.id = new.category_id and c.is_permanently_excluded)
     and exists (select 1 from public.saas_products p where p.id = new.product_id and p.exclusion_status = 'eligible') then
    raise exception 'EXCLUDED_CATEGORY: re-classify product % before assigning an excluded category', new.product_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger product_categories_exclusion_guard before insert or update
on public.product_categories for each row execute function private.trg_category_exclusion_guard();

-- Visibility helpers (created after the tables they read).
create or replace function private.is_visible_product(p_product_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.saas_products p
    where p.id = p_product_id
      and p.record_status = 'active'
      and p.exclusion_status = 'eligible'
  );
$$;

create or replace function private.is_visible_company(p_company_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.saas_products p
    where p.company_id = p_company_id
      and p.record_status = 'active'
      and p.exclusion_status = 'eligible'
  );
$$;

create or replace function private.is_visible_evidence(p_evidence_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.evidence_items e
    where e.id = p_evidence_id
      and (
        (e.product_id is not null and private.is_visible_product(e.product_id))
        or (e.product_id is null and e.company_id is not null and private.is_visible_company(e.company_id))
        or (e.product_id is null and e.company_id is null
            and (e.category_id is null
                 or exists (select 1 from public.categories c
                            where c.id = e.category_id and c.is_user_visible)))
      )
  );
$$;

revoke all on function private.is_visible_product(uuid) from public;
revoke all on function private.is_visible_company(uuid) from public;
revoke all on function private.is_visible_evidence(uuid) from public;
grant execute on function private.is_visible_product(uuid) to authenticated;
grant execute on function private.is_visible_company(uuid) to authenticated;
grant execute on function private.is_visible_evidence(uuid) to authenticated;

-- RLS and grants (same migration as the tables).
do $$
declare t text;
begin
  foreach t in array array[
    'companies','sources','saas_products','categories','product_categories',
    'source_records','source_snapshots','evidence_items','entity_identifiers',
    'catalog_field_provenance','evidence_conflicts','product_features',
    'product_integrations','pricing_plans','company_signals','customer_feedback',
    'competitor_links','product_exclusion_assessments','fx_rates','company_people'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Read-only for authenticated users, restricted to visible products.
grant select on public.companies, public.sources, public.saas_products,
  public.categories, public.product_categories, public.source_records,
  public.source_snapshots, public.evidence_items, public.catalog_field_provenance,
  public.evidence_conflicts, public.product_features, public.product_integrations,
  public.pricing_plans, public.company_signals, public.customer_feedback,
  public.competitor_links, public.fx_rates, public.company_people
to authenticated;
-- entity_identifiers and product_exclusion_assessments: server-only (no grant).

create policy saas_products_read on public.saas_products for select to authenticated
  using (record_status = 'active' and exclusion_status = 'eligible');
create policy companies_read on public.companies for select to authenticated
  using (private.is_visible_company(id));
create policy sources_read on public.sources for select to authenticated using (true);
create policy categories_read on public.categories for select to authenticated
  using (is_user_visible and is_active);
create policy fx_rates_read on public.fx_rates for select to authenticated using (true);

create policy product_categories_read on public.product_categories for select to authenticated
  using (private.is_visible_product(product_id));
create policy product_features_read on public.product_features for select to authenticated
  using (private.is_visible_product(product_id));
create policy product_integrations_read on public.product_integrations for select to authenticated
  using (private.is_visible_product(product_id));
create policy pricing_plans_read on public.pricing_plans for select to authenticated
  using (private.is_visible_product(product_id));
create policy customer_feedback_read on public.customer_feedback for select to authenticated
  using (private.is_visible_product(product_id));
create policy competitor_links_read on public.competitor_links for select to authenticated
  using (private.is_visible_product(product_id) and private.is_visible_product(competitor_product_id));
create policy company_signals_read on public.company_signals for select to authenticated
  using ((product_id is not null and private.is_visible_product(product_id))
      or (product_id is null and private.is_visible_company(company_id)));
create policy company_people_read on public.company_people for select to authenticated
  using (private.is_visible_company(company_id));
create policy evidence_items_read on public.evidence_items for select to authenticated
  using (private.is_visible_evidence(id));
create policy provenance_read on public.catalog_field_provenance for select to authenticated
  using ((product_id is not null and private.is_visible_product(product_id))
      or (company_id is not null and private.is_visible_company(company_id)));
create policy evidence_conflicts_read on public.evidence_conflicts for select to authenticated
  using (private.is_visible_evidence(evidence_a_id) and private.is_visible_evidence(evidence_b_id));
create policy source_snapshots_read on public.source_snapshots for select to authenticated
  using (exists (select 1 from public.evidence_items e
                 where e.source_snapshot_id = source_snapshots.id and private.is_visible_evidence(e.id)));
create policy source_records_read on public.source_records for select to authenticated
  using (exists (select 1 from public.source_snapshots s
                 join public.evidence_items e on e.source_snapshot_id = s.id
                 where s.source_record_id = source_records.id and private.is_visible_evidence(e.id)));
