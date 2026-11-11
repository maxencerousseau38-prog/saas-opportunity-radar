-- M6 — Pain Point Intelligence (Implementation Blueprint §3 "M6", §7, §10;
-- ADR-008). Sprint 4. Tables, triggers, RLS and grants follow the blueprint
-- verbatim; the RPCs at the end implement the request, worker and correction
-- paths it describes. Embeddings use pgvector without a fixed dimension: the
-- model is PD-24b (pending), so no ANN index yet (exact search at MVP volume).

create extension if not exists vector with schema extensions;   -- verified in CI (Sprint 4 gate)

create type public.frequency_label as enum ('isolated','recurring','widespread','unknown');
create type public.switching_intent as enum ('stated','not_stated','unknown');
create type public.cluster_review_status as enum ('machine_proposed','user_confirmed','user_corrected','rejected');
create type public.count_status as enum ('verified','estimated','unknown');
create type public.pain_scope_type as enum ('product','product_set','category');

-- Global, server-only: structured problems extracted from feedback.
create table public.feedback_problems (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.customer_feedback(id) on delete cascade,
  product_id uuid not null references public.saas_products(id) on delete cascade,
  is_primary boolean not null default false,
  problem_statement text not null check (length(problem_statement) between 1 and 1000),
  problem_category public.problem_category not null,
  feature_concerned text,
  user_profile text,
  severity smallint check (severity is null or severity between 1 and 5),
  declared_frequency text,
  operational_consequence text,
  workaround text,
  desired_solution text,
  switching_intent public.switching_intent not null default 'unknown',
  vendor_response text,
  resolution_status public.resolution_status not null default 'unknown',
  confidence numeric(5,2) not null check (confidence between 0 and 100),
  extractor_contract_version text not null,
  extractor_prompt_version text not null,
  agent_step_run_id uuid references public.agent_step_runs(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index feedback_one_primary_problem on public.feedback_problems(feedback_id) where is_primary;
create index feedback_problems_product_idx on public.feedback_problems(product_id, problem_category);

create or replace function private.trg_problem_product_consistency()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from public.customer_feedback f
                 where f.id = new.feedback_id and f.product_id = new.product_id) then
    raise exception 'EVIDENCE_SCOPE_VIOLATION: problem/product mismatch' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger feedback_problems_consistency before insert or update
on public.feedback_problems for each row execute function private.trg_problem_product_consistency();

-- Embedding dimensions depend on the model (PD-24); no ANN index until
-- the model is fixed. MVP volumes allow exact search.
create table public.feedback_problem_embeddings (
  problem_id uuid not null references public.feedback_problems(id) on delete cascade,
  embedding_model text not null,
  dimensions integer not null check (dimensions > 0),
  embedding extensions.vector not null,
  created_at timestamptz not null default now(),
  primary key (problem_id, embedding_model),
  check (extensions.vector_dims(embedding) = dimensions)
);

create table public.pain_point_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  title text not null check (length(title) between 1 and 200),
  scope_type public.pain_scope_type not null,
  scope_category_id uuid references public.categories(id),
  parameters jsonb not null default '{}'::jsonb,
  status public.run_status not null default 'queued',
  feedback_considered integer not null default 0,
  problems_extracted integer not null default 0,
  clusters_created integer not null default 0,
  opportunities_generated integer not null default 0,
  algorithm_version text,
  sources_report jsonb not null default '[]'::jsonb,
  limitations jsonb not null default '[]'::jsonb,
  error_summary text,
  job_execution_id uuid references public.job_executions(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  check ((scope_type = 'category') = (scope_category_id is not null))
);

-- Products in scope, frozen at request time.
create table public.pain_point_run_products (
  run_id uuid not null references public.pain_point_runs(id) on delete cascade,
  product_id uuid not null references public.saas_products(id) on delete restrict,
  total_known_review_count integer check (total_known_review_count is null or total_known_review_count >= 0),
  primary key (run_id, product_id)
);

create table public.pain_point_clusters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  run_id uuid not null,
  name text not null check (length(name) between 1 and 200),
  description text not null check (length(description) between 1 and 3000),
  problem_category public.problem_category not null,
  target_persona text,
  severity_score numeric(3,2) check (severity_score is null or severity_score between 1 and 5),
  frequency_label public.frequency_label not null default 'unknown',
  recurrence_score numeric(5,2) check (recurrence_score is null or recurrence_score between 0 and 100),
  feedback_count integer not null default 0 check (feedback_count >= 0),       -- raw volume
  distinct_author_count integer check (distinct_author_count is null or distinct_author_count >= 0),
  distinct_author_count_status public.count_status not null default 'unknown',
  distinct_company_count integer check (distinct_company_count is null or distinct_company_count >= 0),
  distinct_company_count_status public.count_status not null default 'unknown',
  affected_product_count integer not null default 0 check (affected_product_count >= 0),
  product_distribution jsonb not null default '[]'::jsonb,   -- [{product_id, count, relative_frequency|null}]
  resolution_breakdown jsonb not null default '{}'::jsonb,   -- {resolved, unresolved, unknown}
  existing_solutions jsonb not null default '[]'::jsonb,     -- evidence-linked summaries
  first_detected_at timestamptz not null default now(),
  last_observed_at timestamptz,
  confidence_score numeric(5,2) not null check (confidence_score between 0 and 100),
  review_status public.cluster_review_status not null default 'machine_proposed',
  algorithm_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (run_id, workspace_id) references public.pain_point_runs(id, workspace_id) on delete cascade,
  check ((distinct_author_count is null) = (distinct_author_count_status = 'unknown')),
  check ((distinct_company_count is null) = (distinct_company_count_status = 'unknown'))
);

create table public.pain_point_evidence (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.pain_point_clusters(id) on delete cascade,
  feedback_problem_id uuid not null references public.feedback_problems(id) on delete restrict,
  relevance_score numeric(5,2) check (relevance_score between 0 and 100),
  membership_confidence numeric(5,2) check (membership_confidence between 0 and 100),
  membership_source text not null check (membership_source in ('algorithm','verifier','user_correction')),
  removed_at timestamptz,
  removed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (cluster_id, feedback_problem_id)
);

-- A problem may only join a cluster whose run scope contains its product.
create or replace function private.trg_pain_evidence_scope()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.pain_point_clusters c
    join public.pain_point_run_products rp on rp.run_id = c.run_id
    join public.feedback_problems fp on fp.product_id = rp.product_id
    where c.id = new.cluster_id and fp.id = new.feedback_problem_id
  ) then
    raise exception 'EVIDENCE_SCOPE_VIOLATION: problem outside run scope' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger pain_point_evidence_scope before insert or update
on public.pain_point_evidence for each row execute function private.trg_pain_evidence_scope();

-- History (PRD §13.3).
create table public.pain_point_cluster_snapshots (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.pain_point_clusters(id) on delete cascade,
  observed_at timestamptz not null default now(),
  feedback_count integer not null,
  affected_product_count integer not null,
  distinct_author_count integer,
  distinct_company_count integer,
  resolution_breakdown jsonb not null
);

-- P8 output: market gaps (PRD §7.3.D.D, report "Market Gap Analysis").
create table public.market_gaps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  run_id uuid not null,
  title text not null check (length(title) between 1 and 200),
  gap_type text not null check (gap_type in ('shared_problem','requested_feature','manual_workflow',
                                             'user_workaround','switching_driver','unsatisfied_need')),
  description text not null,
  existing_solutions_observed jsonb not null default '[]'::jsonb,
  confidence numeric(5,2) not null check (confidence between 0 and 100),
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (run_id, workspace_id) references public.pain_point_runs(id, workspace_id) on delete cascade
);

create table public.market_gap_clusters (
  gap_id uuid not null,
  cluster_id uuid not null,
  workspace_id uuid not null,
  primary key (gap_id, cluster_id),
  foreign key (gap_id, workspace_id) references public.market_gaps(id, workspace_id) on delete cascade,
  foreign key (cluster_id, workspace_id) references public.pain_point_clusters(id, workspace_id) on delete cascade
);

create table public.market_gap_evidence (
  gap_id uuid not null references public.market_gaps(id) on delete cascade,
  evidence_item_id uuid not null references public.evidence_items(id) on delete restrict,
  support_type text not null default 'supports' check (support_type in ('supports','contradicts','context')),
  primary key (gap_id, evidence_item_id)
);

-- Gap evidence must concern a product of the run scope (or be market-level).
create or replace function private.trg_gap_evidence_scope()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.market_gaps g
    join public.evidence_items e on e.id = new.evidence_item_id
    where g.id = new.gap_id
      and e.verification_status <> 'rejected'
      and (e.product_id in (select rp.product_id from public.pain_point_run_products rp where rp.run_id = g.run_id)
           or (e.product_id is null and e.company_id is null and e.category_id is null)
           or (e.product_id is null and e.company_id is null
               and exists (select 1 from public.categories c where c.id = e.category_id and c.is_user_visible)
               and (e.category_id = (select r2.scope_category_id from public.pain_point_runs r2 where r2.id = g.run_id)
                    or e.category_id in (select pc.category_id from public.pain_point_run_products rp
                                         join public.product_categories pc on pc.product_id = rp.product_id
                                         where rp.run_id = g.run_id))))
  ) then
    raise exception 'EVIDENCE_SCOPE_VIOLATION: gap evidence outside run scope' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger market_gap_evidence_scope before insert or update
on public.market_gap_evidence for each row execute function private.trg_gap_evidence_scope();

create table public.generated_opportunities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_from_run_id uuid references public.pain_point_runs(id) on delete set null,
  name text not null check (length(name) between 1 and 200),
  description text not null,
  problem_statement text not null,
  target_persona text not null,
  proposed_solution text not null,
  value_proposition text not null,
  differentiation text not null,
  business_model_hypothesis text,
  pricing_hypothesis text,
  technical_feasibility_notes text,
  distribution_hypothesis text,
  validation_needed text not null,
  is_hypothesis boolean not null default true check (is_hypothesis),
  exclusion_status public.exclusion_status not null,
  status public.opportunity_status not null default 'discovered',
  is_favorite boolean not null default false,
  notes text check (notes is null or length(notes) <= 10000),
  generator_contract_version text not null,
  generator_prompt_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  check (exclusion_status in ('eligible','needs_review'))   -- excluded hypotheses are never stored
);

create table public.generated_opportunity_clusters (
  opportunity_id uuid not null,
  cluster_id uuid not null,
  workspace_id uuid not null,
  primary key (opportunity_id, cluster_id),
  foreign key (opportunity_id, workspace_id) references public.generated_opportunities(id, workspace_id) on delete cascade,
  foreign key (cluster_id, workspace_id) references public.pain_point_clusters(id, workspace_id) on delete cascade
);

create table public.generated_opportunity_products (
  opportunity_id uuid not null references public.generated_opportunities(id) on delete cascade,
  product_id uuid not null references public.saas_products(id) on delete restrict,
  role text not null check (role in ('evidence_source','existing_competitor')),
  primary key (opportunity_id, product_id, role)
);

alter table public.tag_assignments
  alter column product_id drop not null,
  add column generated_opportunity_id uuid,
  add constraint tag_assignment_opportunity_fk foreign key (generated_opportunity_id, workspace_id)
    references public.generated_opportunities(id, workspace_id) on delete cascade,
  add constraint tag_assignment_one_target check ((product_id is null) <> (generated_opportunity_id is null));
create unique index tag_assignments_opportunity_uniq on public.tag_assignments(tag_id, generated_opportunity_id)
  where generated_opportunity_id is not null;

-- PRD §19 "Les opportunités indépendantes peuvent être sauvegardées":
-- collections may hold generated opportunities too.
alter table public.collection_items
  alter column product_id drop not null,
  add column generated_opportunity_id uuid,
  add constraint collection_item_opportunity_fk foreign key (generated_opportunity_id, workspace_id)
    references public.generated_opportunities(id, workspace_id) on delete cascade,
  add constraint collection_item_one_target check ((product_id is null) <> (generated_opportunity_id is null));
create unique index collection_items_opportunity_uniq on public.collection_items(collection_id, generated_opportunity_id)
  where generated_opportunity_id is not null;
drop policy collection_items_insert on public.collection_items;
create policy collection_items_insert on public.collection_items for insert to authenticated
  with check (private.can_edit(workspace_id) and added_by = auth.uid()
              and (product_id is null or private.is_visible_product(product_id)));

create index pain_runs_workspace_idx on public.pain_point_runs(workspace_id, created_at desc);
create index clusters_workspace_idx on public.pain_point_clusters(workspace_id, run_id);
create index pain_evidence_cluster_idx on public.pain_point_evidence(cluster_id) where removed_at is null;
create index generated_opps_workspace_idx on public.generated_opportunities(workspace_id, created_at desc);
create trigger clusters_updated_at before update on public.pain_point_clusters
for each row execute function private.set_updated_at();
create trigger generated_opps_updated_at before update on public.generated_opportunities
for each row execute function private.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array[
    'feedback_problems','feedback_problem_embeddings','pain_point_runs','pain_point_run_products',
    'pain_point_clusters','pain_point_evidence','pain_point_cluster_snapshots',
    'market_gaps','market_gap_clusters','market_gap_evidence',
    'generated_opportunities','generated_opportunity_clusters','generated_opportunity_products'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;
-- feedback_problems, feedback_problem_embeddings: server-only.

grant select on public.pain_point_runs, public.pain_point_run_products, public.pain_point_clusters,
  public.pain_point_evidence, public.pain_point_cluster_snapshots, public.market_gaps,
  public.market_gap_clusters, public.market_gap_evidence, public.generated_opportunities,
  public.generated_opportunity_clusters, public.generated_opportunity_products to authenticated;
-- Users change only status and notes of generated opportunities directly;
-- cluster corrections go through the API (server recomputes counters).
grant update (status, is_favorite, notes) on public.generated_opportunities to authenticated;

create policy pain_runs_select on public.pain_point_runs for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy pain_run_products_select on public.pain_point_run_products for select to authenticated
  using (exists (select 1 from public.pain_point_runs r
                 where r.id = run_id and private.is_workspace_member(r.workspace_id)));
create policy clusters_select on public.pain_point_clusters for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy pain_evidence_select on public.pain_point_evidence for select to authenticated
  using (exists (select 1 from public.pain_point_clusters c
                 where c.id = cluster_id and private.is_workspace_member(c.workspace_id)));
create policy cluster_snapshots_select on public.pain_point_cluster_snapshots for select to authenticated
  using (exists (select 1 from public.pain_point_clusters c
                 where c.id = cluster_id and private.is_workspace_member(c.workspace_id)));
create policy market_gaps_select on public.market_gaps for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy market_gap_clusters_select on public.market_gap_clusters for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy market_gap_evidence_select on public.market_gap_evidence for select to authenticated
  using (exists (select 1 from public.market_gaps g
                 where g.id = gap_id and private.is_workspace_member(g.workspace_id)));
create policy generated_opps_select on public.generated_opportunities for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy generated_opps_update on public.generated_opportunities for update to authenticated
  using (private.can_edit(workspace_id)) with check (private.can_edit(workspace_id));
create policy generated_opp_clusters_select on public.generated_opportunity_clusters for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy generated_opp_products_select on public.generated_opportunity_products for select to authenticated
  using (exists (select 1 from public.generated_opportunities o
                 where o.id = opportunity_id and private.is_workspace_member(o.workspace_id)));


-- ---------------------------------------------------------------------------
-- Limits
-- ---------------------------------------------------------------------------
insert into public.platform_limits(key, value, description) values
  ('pain_scope_max_products', '50', 'Products frozen in a category-scoped pain point run (by name order)'),
  ('pain_max_seconds', '1800', 'Wall-clock budget of a pain point run')
on conflict (key) do nothing;

-- [ASSUMPTION] A verified `review_count` company signal stores {"count": n};
-- it is the product's total known review count used for relative frequency.
create or replace function private.known_review_count(p_product_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select case when jsonb_typeof(s.signal_value -> 'count') = 'number'
              then greatest(0, (s.signal_value ->> 'count')::numeric)::integer end
    from public.company_signals s
   where s.product_id = p_product_id and s.signal_type = 'review_count'
     and s.verification_status = 'verified'
   order by s.signal_date desc nulls last, s.created_at desc
   limit 1
$$;

-- ---------------------------------------------------------------------------
-- Run request (service_role; Implementation Blueprint M6 comment)
-- ---------------------------------------------------------------------------
create or replace function public.sor_request_pain_point_run(
  p_workspace_id uuid, p_requested_by uuid, p_idempotency_key text, p_request_hash text,
  p_title text, p_scope_type public.pain_scope_type, p_product_ids uuid[], p_category_id uuid,
  p_parameters jsonb)
returns table (run_id uuid, job_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid := gen_random_uuid();
  v_job record;
  v_products uuid[];
  v_category public.categories;
  v_max integer;
  v_limit integer := private.limit_int('pain_scope_max_products', 50);
  v_limitations jsonb := '[]'::jsonb;
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
  if p_title is null or length(btrim(p_title)) not between 1 and 200 then
    raise exception 'VALIDATION_ERROR: title' using errcode = '22023';
  end if;
  v_max := coalesce((p_parameters ->> 'max_feedback_items')::integer, 500);
  if v_max not between 10 and 2000 then
    raise exception 'VALIDATION_ERROR: max_feedback_items' using errcode = '22023';
  end if;

  if p_scope_type = 'category' then
    if p_category_id is null or coalesce(cardinality(p_product_ids), 0) > 0 then
      raise exception 'VALIDATION_ERROR: scope' using errcode = '22023';
    end if;
    select * into v_category from public.categories c where c.id = p_category_id;
    if v_category.id is null then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_category.is_permanently_excluded then
      raise exception 'EXCLUDED_SUBJECT: category is permanently excluded' using errcode = '23514';
    end if;
    if not v_category.is_user_visible then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
    select array_agg(x.id order by x.name, x.id) into v_products
      from (select distinct p.id, p.name
              from public.saas_products p
              join public.product_categories pc on pc.product_id = p.id
             where pc.category_id = p_category_id
               and p.record_status = 'active' and p.exclusion_status = 'eligible'
             order by p.name, p.id
             limit v_limit + 1) x;
    if coalesce(cardinality(v_products), 0) > v_limit then
      v_products := v_products[1:v_limit];
      v_limitations := jsonb_build_array(jsonb_build_object('code', 'scope_truncated', 'max_products', v_limit));
    end if;
  else
    if p_category_id is not null then
      raise exception 'VALIDATION_ERROR: scope' using errcode = '22023';
    end if;
    select array_agg(distinct x) into v_products from unnest(p_product_ids) x;
    if (p_scope_type = 'product' and coalesce(cardinality(v_products), 0) <> 1)
       or (p_scope_type = 'product_set' and coalesce(cardinality(v_products), 0) not between 2 and 20) then
      raise exception 'VALIDATION_ERROR: scope' using errcode = '22023';
    end if;
    select p.id, p.record_status, p.exclusion_status into v_bad
      from unnest(v_products) u(id) left join public.saas_products p on p.id = u.id
     where p.id is null or p.record_status <> 'active' or p.exclusion_status <> 'eligible'
     order by (p.id is null or p.record_status <> 'active') desc
     limit 1;
    if found then
      if v_bad.id is null or v_bad.record_status <> 'active' then
        raise exception 'NOT_FOUND' using errcode = 'P0002';
      end if;
      raise exception 'EXCLUDED_SUBJECT: product is not eligible' using errcode = '23514';
    end if;
  end if;
  if coalesce(cardinality(v_products), 0) = 0 then
    raise exception 'VALIDATION_ERROR: empty scope' using errcode = '22023';
  end if;

  select * into v_job from private.create_job('pain_point_run', p_workspace_id, p_requested_by,
                                               p_idempotency_key, p_request_hash,
                                               jsonb_build_object('run_id', v_run));
  if not v_job.created then
    return query
      select (j.payload ->> 'run_id')::uuid, j.id, false
        from public.job_executions j where j.id = v_job.job_id;
    return;
  end if;

  insert into public.pain_point_runs (id, workspace_id, created_by, title, scope_type, scope_category_id,
                                      parameters, job_execution_id, limitations)
  values (v_run, p_workspace_id, p_requested_by, btrim(p_title), p_scope_type,
          case when p_scope_type = 'category' then p_category_id end,
          jsonb_build_object('max_feedback_items', v_max), v_job.job_id, v_limitations);
  insert into public.pain_point_run_products (run_id, product_id, total_known_review_count)
  select v_run, u.id, private.known_review_count(u.id) from unnest(v_products) u(id);

  return query select v_run, v_job.job_id, true;
end;
$$;

-- The run mirrors the state of its current job (cancellation, failures and
-- dead letters included, whoever changes the job).
create or replace function private.trg_sync_pain_run_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.job_kind <> 'pain_point_run' or new.state is not distinct from old.state then
    return new;
  end if;
  update public.pain_point_runs r
     set status = case new.state
                    when 'queued' then 'queued'
                    when 'running' then 'running'
                    when 'retrying' then 'running'
                    when 'completed' then 'completed'
                    when 'partial' then 'partial'
                    when 'cancelled' then 'cancelled'
                    else 'failed'
                  end::public.run_status,
         started_at = case when new.state = 'running' then coalesce(r.started_at, now()) else r.started_at end,
         completed_at = case when new.state in ('completed', 'partial', 'failed', 'cancelled', 'dead_letter')
                             then now() else null end,
         error_summary = case when new.state in ('failed', 'dead_letter')
                              then coalesce(new.last_error_message, r.error_summary) else r.error_summary end
   where r.job_execution_id = new.id;
  return new;
end;
$$;
create trigger job_executions_sync_pain_run after update of state on public.job_executions
for each row execute function private.trg_sync_pain_run_state();

-- ---------------------------------------------------------------------------
-- Worker RPCs (service_role)
-- ---------------------------------------------------------------------------

-- P3 results of one feedback item; reused across runs for the same
-- extractor contract/prompt version (Implementation Blueprint §7.1).
create or replace function public.sor_pain_save_problems(
  p_feedback_id uuid, p_step_id uuid, p_contract_version text, p_prompt_version text, p_problems jsonb)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product uuid;
  v_id uuid;
  p jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('sor_pain_problems:' || p_feedback_id::text));
  select f.product_id into v_product from public.customer_feedback f where f.id = p_feedback_id;
  if v_product is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if coalesce(jsonb_typeof(p_problems), '') <> 'array' then
    raise exception 'VALIDATION_ERROR: problems' using errcode = '22023';
  end if;
  if exists (select 1 from public.feedback_problems fp
              where fp.feedback_id = p_feedback_id and fp.extractor_contract_version = p_contract_version
                and fp.extractor_prompt_version = p_prompt_version) then
    return query select fp.id from public.feedback_problems fp
                  where fp.feedback_id = p_feedback_id and fp.extractor_contract_version = p_contract_version
                    and fp.extractor_prompt_version = p_prompt_version
                  order by fp.is_primary desc, fp.created_at, fp.id;
    return;
  end if;
  for p in select * from jsonb_array_elements(p_problems) loop
      insert into public.feedback_problems (
        feedback_id, product_id, is_primary, problem_statement, problem_category, feature_concerned,
        user_profile, severity, declared_frequency, operational_consequence, workaround, desired_solution,
        switching_intent, vendor_response, resolution_status, confidence, extractor_contract_version,
        extractor_prompt_version, agent_step_run_id)
      values (
        p_feedback_id, v_product, coalesce((p ->> 'is_primary')::boolean, false), p ->> 'problem_statement',
        (p ->> 'problem_category')::public.problem_category, p ->> 'feature_concerned', p ->> 'user_profile',
        (p ->> 'severity')::smallint, p ->> 'declared_frequency', p ->> 'operational_consequence',
        p ->> 'workaround', p ->> 'desired_solution',
        coalesce(p ->> 'switching_intent', 'unknown')::public.switching_intent, p ->> 'vendor_response',
        coalesce(p ->> 'resolution_status', 'unknown')::public.resolution_status,
        (p ->> 'confidence')::numeric, p_contract_version, p_prompt_version, p_step_id)
      returning id into v_id;
      return next v_id;
  end loop;
end;
$$;

-- P4 vectors: [{problem_id, model, dimensions, embedding: "[x,y,...]"}].
create or replace function public.sor_pain_save_embeddings(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  insert into public.feedback_problem_embeddings (problem_id, embedding_model, dimensions, embedding)
  select (r ->> 'problem_id')::uuid, r ->> 'model', (r ->> 'dimensions')::integer,
         (r ->> 'embedding')::extensions.vector
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  on conflict (problem_id, embedding_model) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- P2 near duplicates: [{feedback_id, duplicate_of}] within one product; never overwrites.
create or replace function public.sor_pain_mark_duplicates(p_pairs jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  update public.customer_feedback f
     set is_near_duplicate_of = (x ->> 'duplicate_of')::uuid
    from jsonb_array_elements(coalesce(p_pairs, '[]'::jsonb)) x
   where f.id = (x ->> 'feedback_id')::uuid and f.is_near_duplicate_of is null
     and f.id <> (x ->> 'duplicate_of')::uuid
     and exists (select 1 from public.customer_feedback c
                  where c.id = (x ->> 'duplicate_of')::uuid and c.product_id = f.product_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Applies P7 statistics (keys = column names) to a cluster.
create or replace function private.apply_cluster_stats(p_cluster_id uuid, s jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.pain_point_clusters c set
    feedback_count = (s ->> 'feedback_count')::integer,
    distinct_author_count = (s ->> 'distinct_author_count')::integer,
    distinct_author_count_status = (s ->> 'distinct_author_count_status')::public.count_status,
    distinct_company_count = (s ->> 'distinct_company_count')::integer,
    distinct_company_count_status = (s ->> 'distinct_company_count_status')::public.count_status,
    affected_product_count = (s ->> 'affected_product_count')::integer,
    product_distribution = coalesce(s -> 'product_distribution', '[]'::jsonb),
    resolution_breakdown = coalesce(s -> 'resolution_breakdown', '{}'::jsonb),
    frequency_label = (s ->> 'frequency_label')::public.frequency_label,
    severity_score = (s ->> 'severity_score')::numeric,
    confidence_score = (s ->> 'confidence_score')::numeric,
    last_observed_at = (s ->> 'last_observed_at')::timestamptz
  where c.id = p_cluster_id;
  insert into public.pain_point_cluster_snapshots (cluster_id, feedback_count, affected_product_count,
                                                   distinct_author_count, distinct_company_count, resolution_breakdown)
  select c.id, c.feedback_count, c.affected_product_count, c.distinct_author_count, c.distinct_company_count,
         c.resolution_breakdown
    from public.pain_point_clusters c where c.id = p_cluster_id;
end;
$$;

-- P5–P7 results. Cluster ids are chosen by the worker (deterministic per run
-- and cluster), so a redelivered message inserts nothing twice.
create or replace function public.sor_pain_save_clusters(p_run_id uuid, p_clusters jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.pain_point_runs;
  c jsonb;
  m jsonb;
  v_inserted integer := 0;
  v_new boolean;
begin
  select * into v_run from public.pain_point_runs r where r.id = p_run_id;
  if v_run.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  for c in select * from jsonb_array_elements(coalesce(p_clusters, '[]'::jsonb)) loop
    insert into public.pain_point_clusters (
      id, workspace_id, run_id, name, description, problem_category, target_persona, confidence_score,
      algorithm_version, existing_solutions)
    values ((c ->> 'id')::uuid, v_run.workspace_id, p_run_id, c ->> 'name', c ->> 'description',
            (c ->> 'problem_category')::public.problem_category, c ->> 'target_persona',
            (c -> 'stats' ->> 'confidence_score')::numeric, c ->> 'algorithm_version',
            coalesce(c -> 'existing_solutions', '[]'::jsonb))
    on conflict (id) do nothing;
    get diagnostics v_inserted = row_count;
    v_new := v_inserted > 0;
    if not v_new then
      continue;
    end if;
    for m in select * from jsonb_array_elements(coalesce(c -> 'members', '[]'::jsonb)) loop
      insert into public.pain_point_evidence (cluster_id, feedback_problem_id, relevance_score,
                                              membership_confidence, membership_source, removed_at)
      values ((c ->> 'id')::uuid, (m ->> 'problem_id')::uuid, (m ->> 'relevance_score')::numeric,
              (m ->> 'membership_confidence')::numeric, m ->> 'membership_source',
              case when coalesce((m ->> 'removed')::boolean, false) then now() end)
      on conflict (cluster_id, feedback_problem_id) do nothing;
    end loop;
    perform private.apply_cluster_stats((c ->> 'id')::uuid, c -> 'stats');
  end loop;
  return (select count(*)::integer from public.pain_point_clusters where run_id = p_run_id);
end;
$$;

-- P8 gaps and P9 hypotheses (excluded hypotheses never reach this function).
create or replace function public.sor_pain_save_insights(p_run_id uuid, p_gaps jsonb, p_opportunities jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.pain_point_runs;
  g jsonb;
  o jsonb;
  x text;
  v_n integer;
begin
  select * into v_run from public.pain_point_runs r where r.id = p_run_id;
  if v_run.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  for g in select * from jsonb_array_elements(coalesce(p_gaps, '[]'::jsonb)) loop
    insert into public.market_gaps (id, workspace_id, run_id, title, gap_type, description,
                                    existing_solutions_observed, confidence)
    values ((g ->> 'id')::uuid, v_run.workspace_id, p_run_id, g ->> 'title', g ->> 'gap_type',
            g ->> 'description', coalesce(g -> 'existing_solutions_observed', '[]'::jsonb),
            (g ->> 'confidence')::numeric)
    on conflict (id) do nothing;
    get diagnostics v_n = row_count;
    if v_n = 0 then continue; end if;
    for x in select jsonb_array_elements_text(coalesce(g -> 'cluster_ids', '[]'::jsonb)) loop
      insert into public.market_gap_clusters (gap_id, cluster_id, workspace_id)
      select (g ->> 'id')::uuid, c.id, v_run.workspace_id
        from public.pain_point_clusters c where c.id = x::uuid and c.run_id = p_run_id
      on conflict do nothing;
    end loop;
    insert into public.market_gap_evidence (gap_id, evidence_item_id, support_type)
    select (g ->> 'id')::uuid, (e ->> 'evidence_id')::uuid, coalesce(e ->> 'support_type', 'supports')
      from jsonb_array_elements(coalesce(g -> 'evidence', '[]'::jsonb)) e
    on conflict do nothing;
  end loop;

  for o in select * from jsonb_array_elements(coalesce(p_opportunities, '[]'::jsonb)) loop
    insert into public.generated_opportunities (
      id, workspace_id, created_from_run_id, name, description, problem_statement, target_persona,
      proposed_solution, value_proposition, differentiation, business_model_hypothesis, pricing_hypothesis,
      technical_feasibility_notes, distribution_hypothesis, validation_needed, exclusion_status,
      generator_contract_version, generator_prompt_version)
    values ((o ->> 'id')::uuid, v_run.workspace_id, p_run_id, o ->> 'name', o ->> 'description',
            o ->> 'problem_statement', o ->> 'target_persona', o ->> 'proposed_solution',
            o ->> 'value_proposition', o ->> 'differentiation', o ->> 'business_model_hypothesis',
            o ->> 'pricing_hypothesis', o ->> 'technical_feasibility_notes', o ->> 'distribution_hypothesis',
            o ->> 'validation_needed', (o ->> 'exclusion_status')::public.exclusion_status,
            o ->> 'generator_contract_version', o ->> 'generator_prompt_version')
    on conflict (id) do nothing;
    get diagnostics v_n = row_count;
    if v_n = 0 then continue; end if;
    for x in select jsonb_array_elements_text(coalesce(o -> 'cluster_ids', '[]'::jsonb)) loop
      insert into public.generated_opportunity_clusters (opportunity_id, cluster_id, workspace_id)
      select (o ->> 'id')::uuid, c.id, v_run.workspace_id
        from public.pain_point_clusters c where c.id = x::uuid and c.run_id = p_run_id
      on conflict do nothing;
    end loop;
    -- Only visible products may be linked (competitors proposed by a model included).
    insert into public.generated_opportunity_products (opportunity_id, product_id, role)
    select (o ->> 'id')::uuid, p.id, r.role
      from jsonb_to_recordset(coalesce(o -> 'products', '[]'::jsonb)) as r(product_id uuid, role text)
      join public.saas_products p on p.id = r.product_id
     where p.record_status = 'active' and p.exclusion_status = 'eligible'
    on conflict do nothing;
  end loop;
  return jsonb_build_object(
    'gaps', (select count(*) from public.market_gaps where run_id = p_run_id),
    'opportunities', (select count(*) from public.generated_opportunities where created_from_run_id = p_run_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- User actions through the API (service_role; role checked here)
-- ---------------------------------------------------------------------------

-- Cluster correction (Implementation Blueprint §7.4): the API computes the
-- statistics of the corrected membership with @sor/domain and passes them.
create or replace function public.sor_cluster_correction(
  p_workspace_id uuid, p_actor uuid, p_cluster_id uuid, p_request_id uuid, p_expected_updated_at timestamptz,
  p_correction jsonb, p_stats jsonb, p_target_stats jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cluster public.pain_point_clusters;
  v_target public.pain_point_clusters;
  v_remove uuid[];
  v_move uuid[];
  v_target_id uuid := (p_correction -> 'move_problem_ids_to_cluster' ->> 'target_cluster_id')::uuid;
  v_changed boolean := false;
  v_status public.cluster_review_status;
begin
  if not exists (select 1 from public.workspace_members m
                  where m.workspace_id = p_workspace_id and m.user_id = p_actor
                    and m.role in ('owner', 'admin', 'member')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_cluster from public.pain_point_clusters c
   where c.id = p_cluster_id and c.workspace_id = p_workspace_id for update;
  if v_cluster.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_expected_updated_at is not null and v_cluster.updated_at <> p_expected_updated_at then
    raise exception 'INVALID_STATE: cluster changed meanwhile' using errcode = '55000';
  end if;

  select coalesce(array_agg(x::uuid), '{}') into v_remove
    from jsonb_array_elements_text(coalesce(p_correction -> 'remove_problem_ids', '[]'::jsonb)) x;
  select coalesce(array_agg(x::uuid), '{}') into v_move
    from jsonb_array_elements_text(coalesce(p_correction -> 'move_problem_ids_to_cluster' -> 'problem_ids', '[]'::jsonb)) x;
  if exists (select 1 from unnest(v_remove || v_move) u(id)
              where not exists (select 1 from public.pain_point_evidence e
                                 where e.cluster_id = p_cluster_id and e.feedback_problem_id = u.id
                                   and e.removed_at is null)) then
    raise exception 'VALIDATION_ERROR: problem not in cluster' using errcode = '22023';
  end if;
  if cardinality(v_move) > 0 then
    select * into v_target from public.pain_point_clusters c
     where c.id = v_target_id and c.workspace_id = p_workspace_id for update;
    if v_target.id is null or v_target.id = p_cluster_id then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  if cardinality(v_remove || v_move) > 0 then
    update public.pain_point_evidence e set removed_at = now(), removed_by = p_actor
     where e.cluster_id = p_cluster_id and e.feedback_problem_id = any (v_remove || v_move)
       and e.removed_at is null;
    v_changed := true;
  end if;
  if cardinality(v_move) > 0 then
    insert into public.pain_point_evidence (cluster_id, feedback_problem_id, membership_source)
    select v_target.id, u.id, 'user_correction' from unnest(v_move) u(id)
    on conflict (cluster_id, feedback_problem_id)
      do update set removed_at = null, removed_by = null, membership_source = 'user_correction';
    perform private.apply_cluster_stats(v_target.id, p_target_stats);
    update public.pain_point_clusters set review_status = 'user_corrected' where id = v_target.id;
  end if;

  v_changed := v_changed or (p_correction ? 'name') or (p_correction ? 'description');
  v_status := coalesce((p_correction ->> 'review_status')::public.cluster_review_status,
                       case when v_changed then 'user_corrected'::public.cluster_review_status
                            else v_cluster.review_status end);
  update public.pain_point_clusters c
     set name = coalesce(p_correction ->> 'name', c.name),
         description = coalesce(p_correction ->> 'description', c.description),
         review_status = v_status
   where c.id = p_cluster_id;
  if cardinality(v_remove || v_move) > 0 then
    perform private.apply_cluster_stats(p_cluster_id, p_stats);
  end if;

  insert into public.audit_logs (workspace_id, actor_user_id, actor_kind, action, resource_type, resource_id,
                                 request_id, metadata)
  values (p_workspace_id, p_actor, 'user', 'pain_point_cluster.correct', 'pain_point_cluster', p_cluster_id,
          p_request_id, jsonb_build_object('removed', to_jsonb(v_remove), 'moved', to_jsonb(v_move),
                                           'target_cluster_id', v_target_id, 'review_status', v_status));
  return (select jsonb_build_object('cluster_id', c.id, 'updated_at', c.updated_at, 'review_status', c.review_status)
            from public.pain_point_clusters c where c.id = p_cluster_id);
end;
$$;

-- DELETE W/pain-point-runs/{id}: admin+, terminal runs only; clusters used
-- by a generated opportunity block deletion (analyses: M7).
create or replace function public.sor_delete_pain_point_run(
  p_workspace_id uuid, p_actor uuid, p_run_id uuid, p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_run public.pain_point_runs;
begin
  if not exists (select 1 from public.workspace_members m
                  where m.workspace_id = p_workspace_id and m.user_id = p_actor
                    and m.role in ('owner', 'admin')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_run from public.pain_point_runs r
   where r.id = p_run_id and r.workspace_id = p_workspace_id for update;
  if v_run.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_run.status not in ('completed', 'partial', 'failed', 'cancelled', 'needs_review') then
    raise exception 'INVALID_STATE: run not finished' using errcode = '55000';
  end if;
  if exists (select 1 from public.generated_opportunity_clusters gc
               join public.pain_point_clusters c on c.id = gc.cluster_id
              where c.run_id = p_run_id) then
    raise exception 'INVALID_STATE: clusters used by a generated opportunity' using errcode = '55000';
  end if;
  delete from public.pain_point_runs where id = p_run_id;
  insert into public.audit_logs (workspace_id, actor_user_id, actor_kind, action, resource_type, resource_id,
                                 request_id, metadata)
  values (p_workspace_id, p_actor, 'user', 'pain_point_run.delete', 'pain_point_run', p_run_id, p_request_id,
          jsonb_build_object('title', v_run.title));
end;
$$;

-- POST W/pain-point-runs/{id}/retry: a new job for a failed, partial or
-- cancelled run; persisted problems and clusters are reused (idempotent ids).
create or replace function public.sor_retry_pain_point_run(
  p_workspace_id uuid, p_actor uuid, p_run_id uuid, p_idempotency_key text, p_request_hash text)
returns table (job_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.pain_point_runs;
  v_job record;
begin
  if not exists (select 1 from public.workspace_members m
                  where m.workspace_id = p_workspace_id and m.user_id = p_actor
                    and m.role in ('owner', 'admin', 'member')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_run from public.pain_point_runs r
   where r.id = p_run_id and r.workspace_id = p_workspace_id for update;
  if v_run.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_job from private.create_job('pain_point_run', p_workspace_id, p_actor, p_idempotency_key,
                                               p_request_hash, jsonb_build_object('run_id', p_run_id, 'retry', true));
  if not v_job.created then
    return query select v_job.job_id, false;
    return;
  end if;
  if v_run.status not in ('failed', 'partial', 'cancelled') then
    raise exception 'INVALID_STATE: only failed, partial or cancelled runs can be retried' using errcode = '55000';
  end if;
  update public.pain_point_runs
     set job_execution_id = v_job.job_id, status = 'queued', error_summary = null, completed_at = null
   where id = p_run_id;
  return query select v_job.job_id, true;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.sor_request_pain_point_run(uuid, uuid, text, text, text, public.pain_scope_type, uuid[], uuid, jsonb)',
    'public.sor_pain_save_problems(uuid, uuid, text, text, jsonb)',
    'public.sor_pain_save_embeddings(jsonb)',
    'public.sor_pain_mark_duplicates(jsonb)',
    'public.sor_pain_save_clusters(uuid, jsonb)',
    'public.sor_pain_save_insights(uuid, jsonb, jsonb)',
    'public.sor_cluster_correction(uuid, uuid, uuid, uuid, timestamptz, jsonb, jsonb, jsonb)',
    'public.sor_delete_pain_point_run(uuid, uuid, uuid, uuid)',
    'public.sor_retry_pain_point_run(uuid, uuid, uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array[
    'private.known_review_count(uuid)',
    'private.trg_sync_pain_run_state()',
    'private.apply_cluster_stats(uuid, jsonb)',
    'private.trg_problem_product_consistency()',
    'private.trg_pain_evidence_scope()',
    'private.trg_gap_evidence_scope()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
