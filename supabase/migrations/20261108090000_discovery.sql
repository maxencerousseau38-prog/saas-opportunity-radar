-- Sprint 6 — M8 discovery (Implementation Blueprint §3 M8, §6, §10 "Discovery";
-- PD-28; docs/DATA_SOURCES.md). Discovery runs and candidates are workspace
-- data, readable by members and written only through service-role RPCs.
-- Candidate products live in the global catalog with record_status
-- 'candidate' (invisible through catalog RLS) until a member accepts them.

-- ---------------------------------------------------------------------------
-- Source storage policy and per-day usage (ADR-013; docs/DATA_SOURCES.md)
-- ---------------------------------------------------------------------------
create type public.source_storage_policy as enum ('full', 'metadata_only', 'transient');

alter table public.sources
  add column storage_policy public.source_storage_policy not null default 'transient';
update public.sources set storage_policy = 'full'
 where source_key in ('manual_entry', 'user_import', 'official_website');
-- An enabled source has a written terms review.
alter table public.sources
  add constraint sources_enabled_needs_terms_review
  check (is_enabled = false or terms_reviewed_at is not null);

-- Requests made to a source per UTC day (quota enforcement, PRD §14.3 "État
-- des quotas"). Server-only.
create table public.source_usage_daily (
  source_id uuid not null references public.sources(id) on delete cascade,
  usage_date date not null,
  requests integer not null default 0 check (requests >= 0),
  updated_at timestamptz not null default now(),
  primary key (source_id, usage_date)
);
alter table public.source_usage_daily enable row level security;
revoke all on table public.source_usage_daily from anon, authenticated;

-- Hacker News, official API only (PD-28, approved 6 Nov 2026). Registered as
-- planned and disabled: the Y Combinator site terms are still to be read
-- (terms_reviewed_at stays null), and no source is enabled by Sprint 6.
insert into public.sources (source_key, name, source_type, access_method, base_url, terms_url,
                            terms_review_notes, integration_status, default_reliability_level,
                            rate_limit_per_minute, quota_per_day, is_enabled, storage_policy)
values ('hacker_news', 'Hacker News (official API)', 'community', 'official_api',
        'https://hacker-news.firebaseio.com/v0/', 'https://www.ycombinator.com/legal/',
        'Official Firebase API only (README read 6 Nov 2026: no rate limit published, MIT repository). '
        || 'Metadata only: item id, type, title, url, time, score, descendants; never usernames or user text. '
        || 'Pending: Y Combinator site terms (data licence, commercial use, storage). See docs/DATA_SOURCES.md.',
        'planned', 3, 60, 5000, false, 'metadata_only');

-- ---------------------------------------------------------------------------
-- Discovery runs and candidates (M8)
-- ---------------------------------------------------------------------------
create table public.discovery_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  title text not null check (length(title) between 1 and 200),       -- PRD §6.4 "Intitulé"
  prompt text not null check (length(prompt) between 3 and 2000),
  explicit_filters jsonb not null default '{}'::jsonb,
  interpreted_filters jsonb,
  query_plan jsonb,
  channels jsonb not null default '{}'::jsonb,
  depth text not null default 'standard' check (depth in ('standard', 'deep')),
  max_results integer not null default 30 check (max_results between 1 and 100),
  orchestrator_version text not null,
  fit_rules_version text not null,
  status public.run_status not null default 'queued',
  stage text check (stage in ('planning','searching','extracting','resolving_identity','enriching',
                              'verifying','classifying_exclusion','filtering','ranking','persisting')),
  leads_found integer not null default 0 check (leads_found >= 0),
  candidates_found integer not null default 0 check (candidates_found >= 0),
  duplicates_removed integer not null default 0 check (duplicates_removed >= 0),
  candidates_retained integer not null default 0 check (candidates_retained >= 0),
  candidates_rejected integer not null default 0 check (candidates_rejected >= 0),
  candidates_needs_review integer not null default 0 check (candidates_needs_review >= 0),
  sources_report jsonb not null default '[]'::jsonb,   -- per source: consulted/unavailable/limits/errors
  limitations jsonb not null default '[]'::jsonb,
  error_summary text check (error_summary is null or length(error_summary) <= 2000),
  terminal_reason public.terminal_reason,
  rerun_of_run_id uuid references public.discovery_runs(id) on delete set null,
  job_execution_id uuid references public.job_executions(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  check (jsonb_typeof(sources_report) = 'array' and jsonb_typeof(limitations) = 'array'),
  check (jsonb_typeof(channels) = 'object' and jsonb_typeof(explicit_filters) = 'object')
);

create table public.discovery_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.discovery_runs(id) on delete cascade,
  product_id uuid not null references public.saas_products(id) on delete cascade,
  identity_decision text not null check (identity_decision in ('matched_existing','new','needs_review')),
  possible_duplicate_of_product_id uuid references public.saas_products(id),
  is_new_to_catalog boolean not null,                 -- PRD §6.5 new vs already known
  exclusion_status_at_run public.exclusion_status not null,
  fit_rules_version text,
  fit_score numeric(5,2) check (fit_score between 0 and 100),     -- deterministic (§6.8)
  fit_coverage numeric(5,2) check (fit_coverage between 0 and 100), -- share of requested groups with known values
  fit_breakdown jsonb not null default '{}'::jsonb,
  confidence_score numeric(5,2) check (confidence_score between 0 and 100),
  recommendation_reason text check (recommendation_reason is null or length(recommendation_reason) <= 2000),
  missing_information jsonb not null default '[]'::jsonb,
  provenance jsonb not null default '[]'::jsonb,        -- leads: source, channel, reference URL, via product
  review_status text not null default 'pending'
    check (review_status in ('pending','accepted','rejected','needs_review')),
  rejection_reason text check (rejection_reason is null or length(rejection_reason) <= 1000),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, product_id),
  -- Only eligible candidates may carry a fit score or be accepted.
  check (exclusion_status_at_run = 'eligible' or (fit_score is null and review_status <> 'accepted')),
  -- A fit score needs a known coverage; a coverage of 0 has no score (§6.8).
  check (fit_score is null or (fit_coverage is not null and fit_coverage > 0)),
  -- A possible duplicate is never accepted automatically: identity review first.
  check (identity_decision <> 'needs_review' or review_status in ('needs_review', 'rejected')),
  check (review_status <> 'accepted' or (reviewed_by is not null and reviewed_at is not null)),
  check (jsonb_typeof(provenance) = 'array' and jsonb_typeof(missing_information) = 'array')
);

create table public.discovery_candidate_evidence (
  candidate_id uuid not null references public.discovery_candidates(id) on delete cascade,
  evidence_item_id uuid not null references public.evidence_items(id) on delete restrict,
  primary key (candidate_id, evidence_item_id)
);

create or replace function private.trg_candidate_evidence_scope()
returns trigger language plpgsql set search_path = ''
as $$
begin
  perform private.assert_evidence_for_product(
    new.evidence_item_id,
    (select c.product_id from public.discovery_candidates c where c.id = new.candidate_id));
  return new;
end;
$$;
create trigger candidate_evidence_scope before insert or update
on public.discovery_candidate_evidence for each row execute function private.trg_candidate_evidence_scope();

create index discovery_workspace_created_idx on public.discovery_runs(workspace_id, created_at desc);
create index discovery_candidates_run_idx on public.discovery_candidates(run_id, fit_score desc);
create index discovery_candidates_product_idx on public.discovery_candidates(product_id);
create index discovery_candidate_evidence_item_idx on public.discovery_candidate_evidence(evidence_item_id);

do $$
declare t text;
begin
  foreach t in array array['discovery_runs','discovery_candidates','discovery_candidate_evidence'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
  end loop;
end $$;
-- No INSERT/UPDATE/DELETE grants for authenticated (CLAUDE.md §7 rule 14).

create policy discovery_runs_select on public.discovery_runs for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy discovery_candidates_select on public.discovery_candidates for select to authenticated
  using (exists (select 1 from public.discovery_runs r
                 where r.id = run_id and private.is_workspace_member(r.workspace_id)));
create policy discovery_candidate_evidence_select on public.discovery_candidate_evidence for select to authenticated
  using (exists (select 1 from public.discovery_candidates c
                 join public.discovery_runs r on r.id = c.run_id
                 where c.id = candidate_id and private.is_workspace_member(r.workspace_id)));
-- Candidate products themselves (record_status 'candidate') are not
-- readable through catalog RLS; the API returns them as DTOs to members of
-- the run's workspace.

insert into public.platform_limits(key, value, description) values
  ('discovery_max_seconds', '1800', 'Wall-clock budget of a discovery run')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Request (service_role): run row + job + queue message in one transaction
-- ---------------------------------------------------------------------------
create or replace function public.sor_request_discovery_run(
  p_workspace_id uuid, p_requested_by uuid, p_idempotency_key text, p_request_hash text, p_request jsonb)
returns table (run_id uuid, job_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid := gen_random_uuid();
  v_job record;
  v_title text := trim(p_request ->> 'title');
  v_prompt text := trim(p_request ->> 'prompt');
  v_depth text := coalesce(p_request ->> 'depth', 'standard');
  v_max integer := coalesce((p_request ->> 'max_results')::integer, 30);
  v_filters jsonb := coalesce(p_request -> 'filters', '{}'::jsonb);
  v_channels jsonb := coalesce(p_request -> 'channels', '{}'::jsonb);
  v_rerun uuid := (p_request ->> 'rerun_of_run_id')::uuid;
  v_seeds uuid[];
  v_bad record;
begin
  if not exists (select 1 from public.workspace_members m
                  where m.workspace_id = p_workspace_id and m.user_id = p_requested_by
                    and m.role in ('owner', 'admin', 'member')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'VALIDATION_ERROR: request hash' using errcode = '22023';
  end if;
  if v_title is null or length(v_title) not between 1 and 200
     or v_prompt is null or length(v_prompt) not between 3 and 2000
     or v_depth not in ('standard', 'deep') or v_max not between 1 and 100
     or jsonb_typeof(v_filters) <> 'object' or jsonb_typeof(v_channels) <> 'object' then
    raise exception 'VALIDATION_ERROR: request' using errcode = '22023';
  end if;
  -- The filter contract cannot express removing a permanent exclusion; refuse
  -- any attempt at the database level too (defence in depth).
  if v_filters ?| array['include_excluded', 'permanent_exclusions', 'exclusion_override'] then
    raise exception 'VALIDATION_ERROR: permanent exclusions cannot be changed' using errcode = '22023';
  end if;
  if coalesce(jsonb_array_length(v_channels -> 'seed_urls'), 0) > 100 then
    raise exception 'VALIDATION_ERROR: at most 100 seed URLs' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements_text(coalesce(v_channels -> 'seed_urls', '[]'::jsonb)) u
              where u !~* '^https?://[^\s]+$' or length(u) > 2048) then
    raise exception 'VALIDATION_ERROR: seed URL' using errcode = '22023';
  end if;

  -- Rebound seeds: visible catalog products only (no excluded or candidate product).
  select array_agg(distinct x::uuid) into v_seeds
    from jsonb_array_elements_text(coalesce(v_channels -> 'official_site_rebound' -> 'seed_product_ids',
                                            '[]'::jsonb)) x;
  if coalesce(cardinality(v_seeds), 0) > 20 then
    raise exception 'VALIDATION_ERROR: at most 20 rebound seeds' using errcode = '22023';
  end if;
  if v_seeds is not null then
    select p.id, p.record_status, p.exclusion_status into v_bad
      from unnest(v_seeds) u(id) left join public.saas_products p on p.id = u.id
     where p.id is null or p.record_status <> 'active' or p.exclusion_status <> 'eligible'
     order by (p.id is null or p.record_status <> 'active') desc
     limit 1;
    if found then
      if v_bad.id is null or v_bad.record_status <> 'active' then
        raise exception 'NOT_FOUND' using errcode = 'P0002';
      end if;
      raise exception 'EXCLUDED_SUBJECT: rebound seed is not eligible' using errcode = '23514';
    end if;
  end if;

  if v_rerun is not null and not exists (select 1 from public.discovery_runs r
                                          where r.id = v_rerun and r.workspace_id = p_workspace_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_job from private.create_job('discovery_run', p_workspace_id, p_requested_by,
                                               p_idempotency_key, p_request_hash,
                                               jsonb_build_object('run_id', v_run));
  if not v_job.created then
    return query
      select (j.payload ->> 'run_id')::uuid, j.id, false
        from public.job_executions j where j.id = v_job.job_id;
    return;
  end if;

  insert into public.discovery_runs (id, workspace_id, created_by, title, prompt, explicit_filters, channels,
                                     depth, max_results, orchestrator_version, fit_rules_version,
                                     rerun_of_run_id, job_execution_id)
  values (v_run, p_workspace_id, p_requested_by, v_title, v_prompt, v_filters, v_channels, v_depth, v_max,
          'discovery-run.v1', 'fit-1', v_rerun, v_job.job_id);
  return query select v_run, v_job.job_id, true;
end;
$$;

-- The run mirrors the state of its current job; needs_review is kept.
create or replace function private.trg_sync_discovery_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.job_kind <> 'discovery_run' or new.state is not distinct from old.state then
    return new;
  end if;
  update public.discovery_runs r
     set status = case
                    when r.status = 'needs_review' and new.state in ('completed', 'partial') then 'needs_review'
                    else case new.state
                           when 'queued' then 'queued'
                           when 'running' then 'running'
                           when 'retrying' then 'running'
                           when 'completed' then 'completed'
                           when 'partial' then 'partial'
                           when 'cancelled' then 'cancelled'
                           else 'failed'
                         end
                  end::public.run_status,
         terminal_reason = case when new.state in ('completed', 'partial', 'failed', 'cancelled', 'dead_letter')
                                then coalesce(new.terminal_reason, r.terminal_reason) else null end,
         started_at = case when new.state = 'running' then coalesce(r.started_at, now()) else r.started_at end,
         completed_at = case when new.state in ('completed', 'partial', 'failed', 'cancelled', 'dead_letter')
                             then now() else null end
   where r.job_execution_id = new.id;
  return new;
end;
$$;
create trigger job_executions_sync_discovery after update of state on public.job_executions
for each row execute function private.trg_sync_discovery_state();

-- ---------------------------------------------------------------------------
-- Worker RPCs (service_role)
-- ---------------------------------------------------------------------------
create or replace function private.running_discovery_run(p_run_id uuid)
returns public.discovery_runs
language plpgsql
stable
set search_path = ''
as $$
declare v public.discovery_runs;
begin
  select r.* into v from public.discovery_runs r
    join public.job_executions j on j.id = r.job_execution_id
   where r.id = p_run_id and j.state = 'running';
  if v.id is null then
    raise exception 'INVALID_STATE: discovery job not running' using errcode = '55000';
  end if;
  return v;
end;
$$;

-- Progress (PRD §6.4): the current stage, persisted before the stage starts.
create or replace function public.sor_discovery_set_stage(p_run_id uuid, p_stage text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.running_discovery_run(p_run_id);
  update public.discovery_runs set stage = p_stage where id = p_run_id;
end;
$$;

-- D1 output after the server guard (§6.2): interpreted filters and plan.
create or replace function public.sor_discovery_save_plan(
  p_run_id uuid, p_interpreted_filters jsonb, p_query_plan jsonb, p_limitations jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.running_discovery_run(p_run_id);
  if jsonb_typeof(p_interpreted_filters) <> 'object' or jsonb_typeof(p_query_plan) <> 'object'
     or jsonb_typeof(coalesce(p_limitations, '[]'::jsonb)) <> 'array' then
    raise exception 'VALIDATION_ERROR: plan' using errcode = '22023';
  end if;
  if p_interpreted_filters ?| array['include_excluded', 'permanent_exclusions', 'exclusion_override'] then
    raise exception 'VALIDATION_ERROR: permanent exclusions cannot be changed' using errcode = '22023';
  end if;
  update public.discovery_runs
     set interpreted_filters = p_interpreted_filters, query_plan = p_query_plan,
         limitations = coalesce(p_limitations, '[]'::jsonb)
   where id = p_run_id;
end;
$$;

-- Quota check before calling a source: increments today's counter only if
-- the request fits the daily quota. A source that is not integrated and
-- enabled is refused (PRD §6.3: never consider a configured source integrated).
create or replace function public.sor_source_consume(p_source_key text, p_requests integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.sources;
  v_used integer;
begin
  if p_requests is null or p_requests < 1 or p_requests > 1000 then
    raise exception 'VALIDATION_ERROR: requests' using errcode = '22023';
  end if;
  select * into v_source from public.sources s where s.source_key = p_source_key;
  if v_source.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if not v_source.is_enabled or v_source.integration_status <> 'integrated' then
    raise exception 'SOURCE_NOT_ENABLED: %', p_source_key using errcode = '55000';
  end if;
  insert into public.source_usage_daily (source_id, usage_date, requests)
    values (v_source.id, (now() at time zone 'utc')::date, 0)
    on conflict do nothing;
  select u.requests into v_used from public.source_usage_daily u
   where u.source_id = v_source.id and u.usage_date = (now() at time zone 'utc')::date
   for update;
  if v_source.quota_per_day is not null and v_used + p_requests > v_source.quota_per_day then
    return false;
  end if;
  update public.source_usage_daily
     set requests = requests + p_requests, updated_at = now()
   where source_id = v_source.id and usage_date = (now() at time zone 'utc')::date;
  update public.sources set last_sync_at = now() where id = v_source.id;
  return true;
end;
$$;

-- One candidate (D3 → D7): creates or reuses the catalog product, records the
-- primary evidence of its existence (the official-site snapshot cited by D3),
-- and writes the candidate row. Idempotent per (run, product). The database
-- derives the review status from the identity decision and the exclusion
-- outcome: an excluded product is rejected, a product under review or a
-- possible duplicate needs review; nothing is ever accepted here.
create or replace function public.sor_discovery_upsert_candidate(p_run_id uuid, p_candidate jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.discovery_runs;
  v_identity jsonb := p_candidate -> 'identity';
  v_outcome text := p_candidate -> 'identity' ->> 'outcome';
  v_p jsonb := p_candidate -> 'product';
  v_excl jsonb := p_candidate -> 'exclusion';
  v_fit jsonb := coalesce(p_candidate -> 'fit', '{}'::jsonb);
  v_url text := nullif(p_candidate -> 'product' ->> 'canonical_url', '');
  v_snapshot uuid := (p_candidate ->> 'snapshot_id')::uuid;
  v_official uuid;
  v_product public.saas_products;
  v_product_id uuid;
  v_company uuid;
  v_new boolean := false;
  v_status public.exclusion_status;
  v_evidence uuid;
  v_candidate uuid;
  v_review text;
  v_reason text := nullif(p_candidate ->> 'rejection_reason', '');
  v_first boolean := true;
  v_category record;
  v_dup uuid := (p_candidate -> 'identity' ->> 'possible_duplicate_of_product_id')::uuid;
begin
  v_run := private.running_discovery_run(p_run_id);
  if v_outcome not in ('new', 'matched_existing', 'needs_review') or jsonb_typeof(v_p) <> 'object'
     or nullif(trim(v_p ->> 'name'), '') is null or length(trim(v_p ->> 'name')) > 200 then
    raise exception 'VALIDATION_ERROR: candidate' using errcode = '22023';
  end if;
  if v_url is not null and v_url !~* '^https?://' then
    raise exception 'VALIDATION_ERROR: canonical URL' using errcode = '22023';
  end if;
  -- A retained candidate rests on its official site (docs/DATA_SOURCES.md):
  -- the cited snapshot must come from the official-website source.
  select s.id into v_official from public.sources s where s.source_key = 'official_website';
  if not exists (select 1 from public.source_snapshots sn
                   join public.source_records sr on sr.id = sn.source_record_id
                  where sn.id = v_snapshot and sr.source_id = v_official) then
    raise exception 'VALIDATION_ERROR: candidate snapshot must be an official-website snapshot' using errcode = '22023';
  end if;
  v_status := (v_excl ->> 'status')::public.exclusion_status;
  if v_status is null or v_status = 'unassessed' then
    raise exception 'VALIDATION_ERROR: exclusion' using errcode = '22023';
  end if;

  if v_outcome = 'matched_existing' then
    select * into v_product from public.saas_products p where p.id = (v_identity ->> 'product_id')::uuid;
    if v_product.id is null or v_product.record_status in ('merged', 'archived') then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
    v_product_id := v_product.id;
  elsif v_outcome = 'new' then
    if v_url is null then
      raise exception 'VALIDATION_ERROR: a new candidate needs an official URL' using errcode = '22023';
    end if;
    select i.product_id into v_product_id from public.entity_identifiers i
     where i.identifier_type = 'canonical_url' and i.value_normalized = v_url and i.product_id is not null
       and i.valid_to is null;
    if v_product_id is not null
       and not exists (select 1 from public.discovery_candidates c
                        where c.run_id = p_run_id and c.product_id = v_product_id) then
      -- Known before this run: an existing product, not a new one.
      v_outcome := 'matched_existing';
    end if;
  else
    -- Identity needs review (no official URL or a possible duplicate): reuse
    -- the product this run already created for the same name and snapshot.
    select c.product_id into v_product_id
      from public.discovery_candidates c
      join public.saas_products p on p.id = c.product_id
     where c.run_id = p_run_id and c.identity_decision = 'needs_review'
       and lower(p.name) = lower(trim(v_p ->> 'name'));
  end if;

  if v_product_id is null then
    v_new := true;
    v_company := (v_identity ->> 'company_id')::uuid;
    if v_company is null and nullif(trim(v_p ->> 'company_name'), '') is not null then
      insert into public.companies (name, slug, country_code, employee_min, employee_max, founder_led,
                                    primary_domain)
        values (left(trim(v_p ->> 'company_name'), 200),
                private.unique_slug('companies', v_p ->> 'company_name'),
                nullif(v_p ->> 'country_code', ''), (v_p ->> 'employee_min')::integer,
                (v_p ->> 'employee_max')::integer, (v_p ->> 'founder_led')::boolean,
                nullif(v_p ->> 'domain', ''))
        returning id into v_company;
    end if;
    insert into public.saas_products (company_id, name, slug, website_url, primary_domain, tagline,
                                      description, record_status, exclusion_status, discovery_source_id)
      values (v_company, trim(v_p ->> 'name'), private.unique_slug('saas_products', v_p ->> 'name'),
              v_url, nullif(v_p ->> 'domain', ''), left(nullif(v_p ->> 'tagline', ''), 300),
              nullif(v_p ->> 'description', ''), 'candidate', v_status, v_official)
      returning id into v_product_id;
    if v_url is not null then
      insert into public.entity_identifiers (product_id, identifier_type, value_normalized, is_primary, source_id)
        values (v_product_id, 'canonical_url', v_url, true, v_official);
    end if;
    if nullif(v_p ->> 'domain', '') is not null then
      insert into public.entity_identifiers (product_id, identifier_type, value_normalized, source_id)
        values (v_product_id, 'domain', v_p ->> 'domain', v_official);
    end if;
    for v_category in
      select c.id from jsonb_array_elements_text(coalesce(v_p -> 'category_slugs', '[]'::jsonb)) with ordinality as s(slug, ord)
      join public.categories c on c.slug = s.slug and c.is_user_visible and c.is_active
                               and not c.is_permanently_excluded
      order by s.ord
    loop
      insert into public.product_categories (product_id, category_id, is_primary)
        values (v_product_id, v_category.id, v_first) on conflict do nothing;
      v_first := false;
    end loop;
    insert into public.product_exclusion_assessments (product_id, status, rule_set_version, matched_rules,
                                                      incidental_mentions, decided_by)
      values (v_product_id, v_status, coalesce(v_excl ->> 'rule_set_version', 'unknown'),
              coalesce(v_excl -> 'matched_rules', '[]'::jsonb),
              coalesce(v_excl -> 'incidental_mentions', '[]'::jsonb), 'rule_engine');
    insert into public.audit_logs (workspace_id, actor_user_id, actor_kind, action, resource_type, resource_id, metadata)
      values (v_run.workspace_id, v_run.created_by, 'worker', 'discovery.create_candidate_product', 'saas_product',
              v_product_id, jsonb_build_object('run_id', p_run_id, 'exclusion_status', v_status));
  end if;

  select * into v_product from public.saas_products p where p.id = v_product_id;
  -- The catalog's current exclusion status is the truth for an existing product.
  v_status := case when v_new then v_status else v_product.exclusion_status end;
  if v_status = 'unassessed' then
    v_status := 'needs_review';
  end if;

  -- Primary evidence of existence from the cited official-site snapshot (idempotent).
  select e.id into v_evidence from public.evidence_items e
   where e.source_snapshot_id = v_snapshot and e.product_id = v_product_id and e.claim_type = 'product_exists';
  if v_evidence is null then
    insert into public.evidence_items (product_id, source_snapshot_id, claim_type, claim_text, claim_value,
                                       evidence_type, fact_status, reliability_level, extraction_method)
      values (v_product_id, v_snapshot, 'product_exists', 'Product presented on its official website',
              jsonb_build_object('name', trim(v_p ->> 'name'), 'official_url', v_url),
              'official_statement', 'confirmed', 1, 'llm_extraction')
      returning id into v_evidence;
    if v_new then
      insert into public.catalog_field_provenance (product_id, field_key, evidence_id, fact_status)
        select v_product_id, f, v_evidence, 'confirmed'::public.fact_status
          from unnest(array['name', 'website_url']) f
         where f = 'name' or v_url is not null;
    end if;
  end if;

  v_review := case
    when v_status = 'excluded' then 'rejected'
    when v_status = 'needs_review' or v_outcome = 'needs_review' then 'needs_review'
    when p_candidate ->> 'review_status' = 'rejected' then 'rejected'
    else 'pending'
  end;
  if v_status = 'excluded' then
    v_reason := 'permanent_exclusion';
  elsif v_review <> 'rejected' then
    v_reason := null;
  end if;

  insert into public.discovery_candidates (
    run_id, product_id, identity_decision, possible_duplicate_of_product_id, is_new_to_catalog,
    exclusion_status_at_run, fit_rules_version, fit_score, fit_coverage, fit_breakdown, confidence_score,
    recommendation_reason, missing_information, provenance, review_status, rejection_reason)
  values (
    p_run_id, v_product_id, v_outcome, v_dup, v_new or v_product.record_status = 'candidate', v_status,
    v_fit ->> 'rules_version',
    case when v_status = 'eligible' then (v_fit ->> 'fit_score')::numeric end,
    case when v_status = 'eligible' then (v_fit ->> 'fit_coverage')::numeric end,
    coalesce(v_fit -> 'breakdown', '{}'::jsonb),
    (p_candidate ->> 'confidence_score')::numeric,
    left(nullif(p_candidate ->> 'recommendation_reason', ''), 2000),
    coalesce(v_fit -> 'missing_information', '[]'::jsonb),
    coalesce(p_candidate -> 'provenance', '[]'::jsonb),
    v_review, left(v_reason, 1000))
  on conflict (run_id, product_id) do update
    set identity_decision = excluded.identity_decision,
        possible_duplicate_of_product_id = excluded.possible_duplicate_of_product_id,
        exclusion_status_at_run = excluded.exclusion_status_at_run,
        fit_rules_version = excluded.fit_rules_version, fit_score = excluded.fit_score,
        fit_coverage = excluded.fit_coverage, fit_breakdown = excluded.fit_breakdown,
        confidence_score = excluded.confidence_score, recommendation_reason = excluded.recommendation_reason,
        missing_information = excluded.missing_information, provenance = excluded.provenance,
        review_status = excluded.review_status, rejection_reason = excluded.rejection_reason,
        updated_at = now()
  returning id into v_candidate;

  insert into public.discovery_candidate_evidence (candidate_id, evidence_item_id)
    select v_candidate, x from (select v_evidence as x
                                union select (e #>> '{}')::uuid
                                        from jsonb_array_elements(coalesce(p_candidate -> 'evidence_ids', '[]'::jsonb)) e) s
  on conflict do nothing;

  return jsonb_build_object('candidate_id', v_candidate, 'product_id', v_product_id,
                            'identity_decision', v_outcome, 'is_new_to_catalog', v_new,
                            'exclusion_status', v_status, 'review_status', v_review);
end;
$$;

-- Final write of a run's report (PRD §6.4). Candidate counts are recomputed
-- from the candidate rows; the worker supplies only what the database cannot
-- know (leads, candidates before de-duplication, duplicates, sources report).
create or replace function public.sor_discovery_finalize(p_run_id uuid, p_summary jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
  v_retained integer;
  v_rejected integer;
  v_review integer;
  v_found integer := coalesce((p_summary ->> 'candidates_found')::integer, 0);
  v_dups integer := coalesce((p_summary ->> 'duplicates_removed')::integer, 0);
  v_leads integer := coalesce((p_summary ->> 'leads_found')::integer, 0);
  v_report jsonb := coalesce(p_summary -> 'sources_report', '[]'::jsonb);
  v_limits jsonb := coalesce(p_summary -> 'limitations', '[]'::jsonb);
begin
  perform private.running_discovery_run(p_run_id);
  if jsonb_typeof(v_report) <> 'array' or jsonb_typeof(v_limits) <> 'array'
     or v_found < 0 or v_dups < 0 or v_leads < 0 then
    raise exception 'VALIDATION_ERROR: summary' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_report) e
              where jsonb_typeof(e) <> 'object'
                 or not exists (select 1 from public.sources s where s.source_key = e ->> 'source_key')) then
    raise exception 'VALIDATION_ERROR: sources report' using errcode = '22023';
  end if;
  select count(*),
         count(*) filter (where review_status in ('pending', 'accepted')),
         count(*) filter (where review_status = 'rejected'),
         count(*) filter (where review_status = 'needs_review')
    into v_rows, v_retained, v_rejected, v_review
    from public.discovery_candidates where run_id = p_run_id;
  if v_found < v_rows then
    raise exception 'VALIDATION_ERROR: candidates_found below persisted candidates' using errcode = '22023';
  end if;
  update public.discovery_runs
     set leads_found = v_leads, candidates_found = v_found, duplicates_removed = v_dups,
         candidates_retained = v_retained, candidates_rejected = v_rejected,
         candidates_needs_review = v_review, sources_report = v_report,
         limitations = (select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
                          from jsonb_array_elements(limitations || v_limits) x),
         error_summary = left(nullif(p_summary ->> 'error_summary', ''), 2000), stage = null
   where id = p_run_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- API RPCs (service_role after authentication)
-- ---------------------------------------------------------------------------
-- POST W/discovery-runs/{id}/candidates/{candidateId}/review (member+).
-- Accepting an eligible candidate with a new or matched identity makes its
-- product active (visible in Discover); audit-logged.
create or replace function public.sor_review_discovery_candidate(
  p_workspace_id uuid, p_actor uuid, p_candidate_id uuid, p_decision text, p_reason text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.discovery_candidates;
  v_run public.discovery_runs;
  v_product public.saas_products;
begin
  if not exists (select 1 from public.workspace_members m
                  where m.workspace_id = p_workspace_id and m.user_id = p_actor
                    and m.role in ('owner', 'admin', 'member')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_decision not in ('accept', 'reject') or length(coalesce(p_reason, '')) > 1000 then
    raise exception 'VALIDATION_ERROR: review' using errcode = '22023';
  end if;
  select c.* into v_c from public.discovery_candidates c
    join public.discovery_runs r on r.id = c.run_id
   where c.id = p_candidate_id and r.workspace_id = p_workspace_id
   for update of c;
  if v_c.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_run from public.discovery_runs r where r.id = v_c.run_id;
  if v_run.status not in ('completed', 'partial', 'needs_review') then
    raise exception 'INVALID_STATE: run not finished' using errcode = '55000';
  end if;

  if p_decision = 'reject' then
    if v_c.review_status not in ('pending', 'needs_review') then
      raise exception 'INVALID_STATE: candidate already reviewed' using errcode = '55000';
    end if;
    update public.discovery_candidates
       set review_status = 'rejected', rejection_reason = left(coalesce(nullif(p_reason, ''), 'user_rejected'), 1000),
           reviewed_by = p_actor, reviewed_at = now(), updated_at = now()
     where id = v_c.id;
  else
    if v_c.review_status <> 'pending' then
      raise exception 'INVALID_STATE: only a pending candidate can be accepted' using errcode = '55000';
    end if;
    select * into v_product from public.saas_products p where p.id = v_c.product_id for update;
    -- The catalog's current status decides (an operator may have changed it).
    if v_c.exclusion_status_at_run <> 'eligible' or v_product.exclusion_status <> 'eligible' then
      raise exception 'EXCLUDED_SUBJECT: candidate is not eligible' using errcode = '23514';
    end if;
    if v_product.website_url is null or v_product.record_status not in ('candidate', 'active') then
      raise exception 'INVALID_STATE: candidate cannot be accepted' using errcode = '55000';
    end if;
    if not exists (select 1 from public.discovery_candidate_evidence e where e.candidate_id = v_c.id) then
      raise exception 'INVALID_STATE: candidate without evidence' using errcode = '55000';
    end if;
    update public.discovery_candidates
       set review_status = 'accepted', rejection_reason = null, reviewed_by = p_actor, reviewed_at = now(),
           updated_at = now()
     where id = v_c.id;
    if v_product.record_status = 'candidate' then
      update public.saas_products set record_status = 'active', updated_at = now() where id = v_product.id;
    end if;
  end if;

  update public.discovery_runs r
     set candidates_retained = (select count(*) from public.discovery_candidates c
                                 where c.run_id = r.id and c.review_status in ('pending', 'accepted')),
         candidates_rejected = (select count(*) from public.discovery_candidates c
                                 where c.run_id = r.id and c.review_status = 'rejected'),
         candidates_needs_review = (select count(*) from public.discovery_candidates c
                                     where c.run_id = r.id and c.review_status = 'needs_review')
   where r.id = v_c.run_id;

  insert into public.audit_logs (workspace_id, actor_user_id, actor_kind, action, resource_type, resource_id,
                                 request_id, metadata)
  values (p_workspace_id, p_actor, 'user', 'discovery.candidate_' || p_decision, 'discovery_candidate', v_c.id,
          p_request_id, jsonb_build_object('run_id', v_c.run_id, 'product_id', v_c.product_id));
  return jsonb_build_object('candidate_id', v_c.id, 'product_id', v_c.product_id,
                            'review_status', case p_decision when 'accept' then 'accepted' else 'rejected' end);
end;
$$;

-- DELETE W/discovery-runs/{id} (owner/admin, terminal runs only, audit-logged).
-- Catalog products created by the run stay (global data); accepted ones stay
-- active, the others stay hidden candidates.
create or replace function public.sor_delete_discovery_run(
  p_workspace_id uuid, p_actor uuid, p_run_id uuid, p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v public.discovery_runs;
begin
  if not exists (select 1 from public.workspace_members m
                  where m.workspace_id = p_workspace_id and m.user_id = p_actor
                    and m.role in ('owner', 'admin')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v from public.discovery_runs r
   where r.id = p_run_id and r.workspace_id = p_workspace_id for update;
  if v.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v.status not in ('completed', 'partial', 'failed', 'cancelled', 'needs_review') then
    raise exception 'INVALID_STATE: run not finished' using errcode = '55000';
  end if;
  delete from public.discovery_runs where id = p_run_id;
  insert into public.audit_logs (workspace_id, actor_user_id, actor_kind, action, resource_type, resource_id,
                                 request_id, metadata)
  values (p_workspace_id, p_actor, 'user', 'discovery_run.delete', 'discovery_run', p_run_id, p_request_id,
          jsonb_build_object('title', v.title, 'candidates_found', v.candidates_found));
end;
$$;

-- POST W/discovery-runs/{id}/retry: a new job for a failed, partial or
-- cancelled run whose candidates nobody has reviewed yet; the previous
-- candidates are cleared (never shown as current). A run with reviewed
-- candidates is re-run instead (new run, rerun_of_run_id).
create or replace function public.sor_retry_discovery_run(
  p_workspace_id uuid, p_actor uuid, p_run_id uuid, p_idempotency_key text, p_request_hash text)
returns table (job_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.discovery_runs;
  v_job record;
begin
  if not exists (select 1 from public.workspace_members m
                  where m.workspace_id = p_workspace_id and m.user_id = p_actor
                    and m.role in ('owner', 'admin', 'member')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v from public.discovery_runs r
   where r.id = p_run_id and r.workspace_id = p_workspace_id for update;
  if v.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_job from private.create_job('discovery_run', p_workspace_id, p_actor, p_idempotency_key,
                                               p_request_hash, jsonb_build_object('run_id', p_run_id, 'retry', true));
  if not v_job.created then
    return query select v_job.job_id, false;
    return;
  end if;
  if v.status not in ('failed', 'partial', 'cancelled') then
    raise exception 'INVALID_STATE: only failed, partial or cancelled runs can be retried' using errcode = '55000';
  end if;
  if exists (select 1 from public.discovery_candidates c
              where c.run_id = p_run_id and c.reviewed_by is not null) then
    raise exception 'INVALID_STATE: reviewed candidates; start a new run instead' using errcode = '55000';
  end if;
  delete from public.discovery_candidates where run_id = p_run_id;
  update public.discovery_runs
     set job_execution_id = v_job.job_id, status = 'queued', stage = null, terminal_reason = null,
         completed_at = null, leads_found = 0, candidates_found = 0, duplicates_removed = 0,
         candidates_retained = 0, candidates_rejected = 0, candidates_needs_review = 0,
         sources_report = '[]'::jsonb, limitations = '[]'::jsonb, error_summary = null,
         interpreted_filters = null, query_plan = null
   where id = p_run_id;
  return query select v_job.job_id, true;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.sor_request_discovery_run(uuid, uuid, text, text, jsonb)',
    'public.sor_discovery_set_stage(uuid, text)',
    'public.sor_discovery_save_plan(uuid, jsonb, jsonb, jsonb)',
    'public.sor_source_consume(text, integer)',
    'public.sor_discovery_upsert_candidate(uuid, jsonb)',
    'public.sor_discovery_finalize(uuid, jsonb)',
    'public.sor_review_discovery_candidate(uuid, uuid, uuid, text, text, uuid)',
    'public.sor_delete_discovery_run(uuid, uuid, uuid, uuid)',
    'public.sor_retry_discovery_run(uuid, uuid, uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array[
    'private.trg_sync_discovery_state()',
    'private.running_discovery_run(uuid)',
    'private.trg_candidate_evidence_scope()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
