-- M7 --- opportunity analyses (Implementation Blueprint §3 "M7", §8, §9, §10
-- "Opportunity analysis"; ADR-005, ADR-009). The blueprint SQL is reproduced
-- as written, followed by the request, job-sync, worker, deletion, retry and
-- export functions it describes. Every function is service_role only:
-- browsers never write analyses, scores, findings or evidence links.

create type public.analysis_type as enum ('opportunity','comparison');
create type public.analysis_subject_type as enum (
  'product','product_set','category','pain_point_cluster','generated_opportunity'
);
create type public.analysis_verdict as enum ('build_candidate','validate_first','reject');
create type public.decision_band as enum ('reject','low_potential','to_investigate','interesting','priority');
create type public.assessment_status as enum ('assessed','insufficient_evidence');
create type public.dimension_key as enum (
  'customer_demand','willingness_to_pay','product_gap',
  'market_attractiveness','competitive_differentiation','feasibility_distribution'
);
create type public.finding_type as enum (
  'pain_point','opportunity','risk','competitor_gap','recommendation','kill_criterion'
);
create type public.kill_severity as enum ('critical','major','minor');

create table public.opportunity_analyses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  analysis_type public.analysis_type not null default 'opportunity',
  subject_type public.analysis_subject_type not null,
  subject_product_id uuid references public.saas_products(id) on delete restrict,
  subject_category_id uuid references public.categories(id) on delete restrict,
  subject_cluster_id uuid,
  subject_generated_opportunity_id uuid,
  subject_snapshot jsonb not null,          -- frozen description of the subject at request time
  analysis_version text not null,           -- orchestrator version
  scoring_rules_version text not null,
  analysis_depth text not null default 'deep' check (analysis_depth in ('quick','standard','deep')),
  target_market char(2) not null default 'FR' check (target_market ~ '^[A-Z]{2}$'),
  user_context jsonb not null default '{}'::jsonb,
  status public.run_status not null default 'queued',
  score_total numeric(5,2) check (score_total between 0 and 100),
  provisional_points numeric(5,2) check (provisional_points between 0 and 100),
  score_coverage numeric(5,2) check (score_coverage between 0 and 100),
  willingness_to_pay_score numeric(4,2) check (willingness_to_pay_score between 0 and 15),
  confidence_score numeric(5,2) check (confidence_score between 0 and 100),
  decision_band public.decision_band,
  verdict public.analysis_verdict,
  verdict_reasons jsonb not null default '[]'::jsonb,   -- ordered gate results
  executive_summary text,
  report_json jsonb,
  limitations jsonb not null default '[]'::jsonb,
  terminal_reason public.terminal_reason,
  job_execution_id uuid references public.job_executions(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (subject_cluster_id, workspace_id)
    references public.pain_point_clusters(id, workspace_id) on delete restrict,
  foreign key (subject_generated_opportunity_id, workspace_id)
    references public.generated_opportunities(id, workspace_id) on delete restrict,
  -- Exactly one subject shape.
  check (
    (subject_type = 'product' and subject_product_id is not null and subject_category_id is null
       and subject_cluster_id is null and subject_generated_opportunity_id is null)
    or (subject_type = 'product_set' and subject_product_id is null and subject_category_id is null
       and subject_cluster_id is null and subject_generated_opportunity_id is null)
    or (subject_type = 'category' and subject_category_id is not null and subject_product_id is null
       and subject_cluster_id is null and subject_generated_opportunity_id is null)
    or (subject_type = 'pain_point_cluster' and subject_cluster_id is not null and subject_product_id is null
       and subject_category_id is null and subject_generated_opportunity_id is null)
    or (subject_type = 'generated_opportunity' and subject_generated_opportunity_id is not null
       and subject_product_id is null and subject_category_id is null and subject_cluster_id is null)
  ),
  check (analysis_type <> 'comparison' or subject_type = 'product_set'),
  -- A final score exists only at full coverage, never normalised.
  check (score_total is null or score_coverage = 100),
  check (status <> 'completed' or report_json is not null),
  -- Opportunity analyses end with a verdict; comparisons (PRD §11, Phase 2)
  -- rank the set with evidence and carry no verdict or score.
  check (analysis_type <> 'opportunity' or status <> 'completed' or verdict is not null),
  check (analysis_type <> 'comparison' or (verdict is null and score_total is null)),
  -- Defence in depth for the BUILD CANDIDATE gate.
  check (verdict is distinct from 'build_candidate'
         or (score_total is not null and willingness_to_pay_score is not null
             and score_total >= 75 and willingness_to_pay_score >= 10)),
  check (decision_band is null or score_total is not null)
);

create table public.analysis_subject_products (
  analysis_id uuid not null references public.opportunity_analyses(id) on delete cascade,
  product_id uuid not null references public.saas_products(id) on delete restrict,
  role text not null check (role in ('subject','set_member','category_member','cluster_product',
                                     'opportunity_source','competitor')),
  primary key (analysis_id, product_id, role)
);

-- Evidence index of the analysis (report "Evidence index").
create table public.analysis_evidence (
  analysis_id uuid not null references public.opportunity_analyses(id) on delete cascade,
  evidence_item_id uuid not null references public.evidence_items(id) on delete restrict,
  added_by_step_id uuid references public.agent_step_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (analysis_id, evidence_item_id)
);

create or replace function private.trg_analysis_evidence_scope()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.evidence_items e
    where e.id = new.evidence_item_id
      and e.verification_status <> 'rejected'
      and (
        e.product_id in (select sp.product_id from public.analysis_subject_products sp
                         where sp.analysis_id = new.analysis_id)
        or (e.product_id is null and e.company_id in (
              select p.company_id from public.analysis_subject_products sp
              join public.saas_products p on p.id = sp.product_id
              where sp.analysis_id = new.analysis_id))
        or (e.product_id is null and e.company_id is null and e.category_id is null)   -- market-level
        or (e.product_id is null and e.company_id is null and e.category_id is not null  -- category-level
            and exists (select 1 from public.categories c where c.id = e.category_id and c.is_user_visible)
            and (e.category_id = (select a.subject_category_id from public.opportunity_analyses a
                                  where a.id = new.analysis_id)
                 or e.category_id in (select pc.category_id from public.analysis_subject_products sp
                                      join public.product_categories pc on pc.product_id = sp.product_id
                                      where sp.analysis_id = new.analysis_id)))
      )
  ) then
    raise exception 'EVIDENCE_SCOPE_VIOLATION: evidence % outside analysis % scope',
      new.evidence_item_id, new.analysis_id using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger analysis_evidence_scope before insert or update
on public.analysis_evidence for each row execute function private.trg_analysis_evidence_scope();

create table public.analysis_dimension_scores (
  analysis_id uuid not null references public.opportunity_analyses(id) on delete cascade,
  dimension_key public.dimension_key not null,
  weight smallint not null,
  assessment_status public.assessment_status not null,
  rating smallint check (rating between 0 and 5),   -- integer per PD-05
  weighted_points numeric(5,2) generated always as (rating * weight / 5.0) stored,
  explanation text not null check (length(explanation) between 1 and 3000),
  missing_information jsonb not null default '[]'::jsonb,
  proposed_by_step_id uuid references public.agent_step_runs(id) on delete set null,
  primary key (analysis_id, dimension_key),
  check (weight = case dimension_key
                    when 'customer_demand' then 20
                    when 'product_gap' then 20
                    else 15 end),
  -- Not assessed means no rating (never a silent zero).
  check ((assessment_status = 'assessed') = (rating is not null))
);

create table public.dimension_score_evidence (
  analysis_id uuid not null,
  dimension_key public.dimension_key not null,
  evidence_item_id uuid not null,
  support_type text not null default 'supports' check (support_type in ('supports','contradicts','context')),
  primary key (analysis_id, dimension_key, evidence_item_id),
  foreign key (analysis_id, dimension_key)
    references public.analysis_dimension_scores(analysis_id, dimension_key) on delete cascade,
  foreign key (analysis_id, evidence_item_id)
    references public.analysis_evidence(analysis_id, evidence_item_id) on delete restrict
);

-- An assessed dimension needs at least one supporting evidence item
-- (checked at commit).
create or replace function private.trg_dimension_requires_evidence()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.assessment_status = 'assessed' and not exists (
    select 1 from public.dimension_score_evidence d
    where d.analysis_id = new.analysis_id and d.dimension_key = new.dimension_key
      and d.support_type = 'supports'
  ) then
    raise exception 'EVIDENCE_REQUIRED: dimension % assessed without evidence', new.dimension_key
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;
create constraint trigger dimension_requires_evidence
after insert or update on public.analysis_dimension_scores
deferrable initially deferred
for each row execute function private.trg_dimension_requires_evidence();

create table public.analysis_findings (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.opportunity_analyses(id) on delete cascade,
  finding_type public.finding_type not null,
  title text not null check (length(title) between 1 and 200),
  description text not null check (length(description) between 1 and 3000),
  priority smallint check (priority between 1 and 5),
  confidence numeric(5,2) check (confidence between 0 and 100),
  is_hypothesis boolean not null,
  severity public.kill_severity,
  is_substantiated boolean,                 -- computed by the server for kill criteria
  dimension_key public.dimension_key,
  source_agent text not null,
  recommendation text,
  created_at timestamptz not null default now(),
  unique (id, analysis_id),
  check ((finding_type = 'kill_criterion') = (severity is not null)),
  check ((finding_type = 'kill_criterion') = (is_substantiated is not null))
);

create table public.finding_evidence (
  finding_id uuid not null,
  analysis_id uuid not null,
  evidence_item_id uuid not null,
  support_type text not null default 'supports' check (support_type in ('supports','contradicts','context')),
  relevance_score numeric(5,2) check (relevance_score between 0 and 100),
  primary key (finding_id, evidence_item_id),
  foreign key (finding_id, analysis_id) references public.analysis_findings(id, analysis_id) on delete cascade,
  foreign key (analysis_id, evidence_item_id)
    references public.analysis_evidence(analysis_id, evidence_item_id) on delete restrict
);

-- A non-hypothesis finding needs at least one evidence item (checked at commit).
create or replace function private.trg_finding_requires_evidence()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not new.is_hypothesis and not exists (
    select 1 from public.finding_evidence fe
    where fe.finding_id = new.id and fe.support_type = 'supports'
  ) then
    raise exception 'EVIDENCE_REQUIRED: finding % is not a hypothesis and has no evidence', new.id
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;
create constraint trigger finding_requires_evidence
after insert or update on public.analysis_findings
deferrable initially deferred
for each row execute function private.trg_finding_requires_evidence();

create index analyses_workspace_idx on public.opportunity_analyses(workspace_id, created_at desc);
create index analyses_product_idx on public.opportunity_analyses(subject_product_id, created_at desc);
create index analyses_cluster_idx on public.opportunity_analyses(subject_cluster_id);
create index analyses_generated_opp_idx on public.opportunity_analyses(subject_generated_opportunity_id);
create index analysis_subject_products_product_idx on public.analysis_subject_products(product_id);
create index findings_analysis_idx on public.analysis_findings(analysis_id);

do $$
declare t text;
begin
  foreach t in array array[
    'opportunity_analyses','analysis_subject_products','analysis_evidence',
    'analysis_dimension_scores','dimension_score_evidence','analysis_findings','finding_evidence'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
  end loop;
end $$;
-- No INSERT/UPDATE/DELETE grants for authenticated: analyses are created
-- through POST /analyses -> public.sor_request_analysis (service_role) and
-- written only by the worker. This removes the v1.0 hole that let a
-- browser insert a "completed" analysis with an arbitrary score.

create policy analyses_select on public.opportunity_analyses for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy analysis_subject_products_select on public.analysis_subject_products for select to authenticated
  using (exists (select 1 from public.opportunity_analyses a
                 where a.id = analysis_id and private.is_workspace_member(a.workspace_id)));
create policy analysis_evidence_select on public.analysis_evidence for select to authenticated
  using (exists (select 1 from public.opportunity_analyses a
                 where a.id = analysis_id and private.is_workspace_member(a.workspace_id)));
create policy dimension_scores_select on public.analysis_dimension_scores for select to authenticated
  using (exists (select 1 from public.opportunity_analyses a
                 where a.id = analysis_id and private.is_workspace_member(a.workspace_id)));
create policy dimension_evidence_select on public.dimension_score_evidence for select to authenticated
  using (exists (select 1 from public.opportunity_analyses a
                 where a.id = analysis_id and private.is_workspace_member(a.workspace_id)));
create policy findings_select on public.analysis_findings for select to authenticated
  using (exists (select 1 from public.opportunity_analyses a
                 where a.id = analysis_id and private.is_workspace_member(a.workspace_id)));
create policy finding_evidence_select on public.finding_evidence for select to authenticated
  using (exists (select 1 from public.opportunity_analyses a
                 where a.id = analysis_id and private.is_workspace_member(a.workspace_id)));

-- Analysis deletion (PRD §14.4, owner/admin) goes through the API with the
-- server client after authorization, and is audit-logged.

-- ---------------------------------------------------------------------------
-- Report exports (PD-18 A: JSON + Markdown in the MVP). Server-only: no
-- grant to browser roles; the API streams an export after checking
-- membership. [ASSUMPTION] A table instead of a Storage bucket in the MVP:
-- exports are small text renderings of report_json; a private bucket with
-- signed URLs comes with PDF exports (PD-18, later).
-- ---------------------------------------------------------------------------
create table public.report_exports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  analysis_id uuid not null,
  job_execution_id uuid not null unique references public.job_executions(id) on delete cascade,
  format text not null check (format in ('json','markdown')),
  content_type text not null check (content_type in ('application/json','text/markdown; charset=utf-8')),
  filename text not null check (filename ~ '^[A-Za-z0-9._-]{1,200}$'),
  content text not null check (length(content) between 1 and 5000000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (analysis_id, workspace_id)
    references public.opportunity_analyses(id, workspace_id) on delete cascade
);
create index report_exports_analysis_idx on public.report_exports(analysis_id, created_at desc);
alter table public.report_exports enable row level security;
revoke all on table public.report_exports from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Limits
-- ---------------------------------------------------------------------------
insert into public.platform_limits(key, value, description) values
  ('analysis_category_products_quick', '5', 'Category members frozen in a quick analysis'),
  ('analysis_category_products_standard', '10', 'Category members frozen in a standard analysis'),
  ('analysis_category_products_deep', '20', 'Category members frozen in a deep analysis'),
  ('analysis_max_competitors', '30', 'Visible competitors frozen in an analysis scope'),
  ('analysis_max_seconds', '3600', 'Wall-clock budget of an opportunity analysis')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Request (service_role; Implementation Blueprint M7 comment, §8.1)
-- ---------------------------------------------------------------------------
create or replace function public.sor_request_analysis(
  p_workspace_id uuid, p_requested_by uuid, p_idempotency_key text, p_request_hash text,
  p_analysis_type public.analysis_type, p_subject jsonb, p_request jsonb)
returns table (analysis_id uuid, job_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_analysis uuid := gen_random_uuid();
  v_job record;
  v_type text := p_subject ->> 'type';
  v_depth text := coalesce(p_request ->> 'analysis_depth', 'deep');
  v_context jsonb := coalesce(p_request -> 'context', '{}'::jsonb);
  v_options jsonb := coalesce(p_request -> 'options', '{}'::jsonb);
  v_market text := coalesce(p_request -> 'context' ->> 'target_country', 'FR');
  v_scope jsonb := '[]'::jsonb;          -- [{product_id, role}]
  v_members uuid[];
  v_omitted integer := 0;
  v_product public.saas_products;
  v_category public.categories;
  v_cluster public.pain_point_clusters;
  v_opp public.generated_opportunities;
  v_snapshot jsonb;
  v_prefs jsonb;
  v_thresholds jsonb;
  v_bad record;
  v_cap integer;
  v_max_competitors integer := private.limit_int('analysis_max_competitors', 30);
begin
  if not exists (select 1 from public.workspace_members m
                  where m.workspace_id = p_workspace_id and m.user_id = p_requested_by
                    and m.role in ('owner', 'admin', 'member')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'VALIDATION_ERROR: request hash' using errcode = '22023';
  end if;
  -- Comparison analyses (§8.11) are Phase 2 ("Comparateur avancé").
  if p_analysis_type <> 'opportunity' then
    raise exception 'VALIDATION_ERROR: comparison analyses are not available yet' using errcode = '22023';
  end if;
  if v_depth not in ('quick', 'standard', 'deep') or v_market !~ '^[A-Z]{2}$'
     or jsonb_typeof(v_context) <> 'object' or jsonb_typeof(v_options) <> 'object' then
    raise exception 'VALIDATION_ERROR: request' using errcode = '22023';
  end if;

  if v_type = 'product' then
    select * into v_product from public.saas_products p where p.id = (p_subject ->> 'product_id')::uuid;
    if v_product.id is null or v_product.record_status <> 'active' then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_product.exclusion_status <> 'eligible' then
      raise exception 'EXCLUDED_SUBJECT: product is not eligible' using errcode = '23514';
    end if;
    v_members := array[v_product.id];
    v_scope := jsonb_build_array(jsonb_build_object('product_id', v_product.id, 'role', 'subject'));
    v_snapshot := jsonb_build_object('type', 'product', 'product',
                    jsonb_build_object('id', v_product.id, 'name', v_product.name, 'slug', v_product.slug));

  elsif v_type = 'product_set' then
    if jsonb_typeof(p_subject -> 'product_ids') <> 'array' then
      raise exception 'VALIDATION_ERROR: subject' using errcode = '22023';
    end if;
    select array_agg(distinct x::uuid) into v_members
      from jsonb_array_elements_text(p_subject -> 'product_ids') x;
    if coalesce(cardinality(v_members), 0) not between 2 and 10 then
      raise exception 'VALIDATION_ERROR: a product set has 2 to 10 products' using errcode = '22023';
    end if;
    select p.id, p.record_status, p.exclusion_status into v_bad
      from unnest(v_members) u(id) left join public.saas_products p on p.id = u.id
     where p.id is null or p.record_status <> 'active' or p.exclusion_status <> 'eligible'
     order by (p.id is null or p.record_status <> 'active') desc
     limit 1;
    if found then
      if v_bad.id is null or v_bad.record_status <> 'active' then
        raise exception 'NOT_FOUND' using errcode = 'P0002';
      end if;
      raise exception 'EXCLUDED_SUBJECT: product is not eligible' using errcode = '23514';
    end if;
    select jsonb_agg(jsonb_build_object('product_id', p.id, 'role', 'set_member') order by p.name, p.id),
           jsonb_build_object('type', 'product_set', 'products',
             jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'slug', p.slug) order by p.name, p.id))
      into v_scope, v_snapshot
      from public.saas_products p where p.id = any(v_members);

  elsif v_type = 'category' then
    select * into v_category from public.categories c where c.slug = p_subject ->> 'category_slug';
    if v_category.id is null then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_category.is_permanently_excluded then
      raise exception 'EXCLUDED_SUBJECT: category is permanently excluded' using errcode = '23514';
    end if;
    if not v_category.is_user_visible then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
    v_cap := private.limit_int('analysis_category_products_' || v_depth, 20);
    -- Selection rule (recorded): most evidence items first, then name and id.
    select array_agg(x.id order by x.n desc, x.name, x.id) into v_members
      from (select p.id, p.name,
                   (select count(*) from public.evidence_items e
                     where e.product_id = p.id and e.verification_status <> 'rejected') as n
              from public.saas_products p
             where p.record_status = 'active' and p.exclusion_status = 'eligible'
               and exists (select 1 from public.product_categories pc
                            where pc.product_id = p.id and pc.category_id = v_category.id)
             order by 3 desc, p.name, p.id
             limit v_cap) x;
    select jsonb_agg(jsonb_build_object('product_id', u.id, 'role', 'category_member') order by u.ord)
      into v_scope from unnest(v_members) with ordinality u(id, ord);
    v_snapshot := jsonb_build_object('type', 'category',
                    'category', jsonb_build_object('id', v_category.id, 'slug', v_category.slug,
                                                   'name', v_category.name),
                    'selection_rule', 'most_evidence_items_then_name',
                    'max_products', v_cap);

  elsif v_type = 'pain_point_cluster' then
    select * into v_cluster from public.pain_point_clusters c
     where c.id = (p_subject ->> 'cluster_id')::uuid and c.workspace_id = p_workspace_id;
    if v_cluster.id is null then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
    select array_agg(distinct f.product_id) filter (where p.record_status = 'active' and p.exclusion_status = 'eligible'),
           count(distinct f.product_id) filter (where not (p.record_status = 'active' and p.exclusion_status = 'eligible'))
      into v_members, v_omitted
      from public.pain_point_evidence pe
      join public.feedback_problems fp on fp.id = pe.feedback_problem_id
      join public.customer_feedback f on f.id = fp.feedback_id
      join public.saas_products p on p.id = f.product_id
     where pe.cluster_id = v_cluster.id and pe.removed_at is null;
    select jsonb_agg(jsonb_build_object('product_id', u.id, 'role', 'cluster_product') order by u.id)
      into v_scope from unnest(v_members) u(id);
    v_snapshot := jsonb_build_object('type', 'pain_point_cluster',
                    'cluster', jsonb_build_object('id', v_cluster.id, 'name', v_cluster.name,
                                                  'problem_category', v_cluster.problem_category,
                                                  'run_id', v_cluster.run_id));

  elsif v_type = 'generated_opportunity' then
    select * into v_opp from public.generated_opportunities o
     where o.id = (p_subject ->> 'generated_opportunity_id')::uuid and o.workspace_id = p_workspace_id;
    if v_opp.id is null then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_opp.exclusion_status <> 'eligible' then
      raise exception 'EXCLUDED_SUBJECT: generated opportunity is not eligible' using errcode = '23514';
    end if;
    select jsonb_agg(jsonb_build_object('product_id', gp.product_id,
                       'role', case gp.role when 'evidence_source' then 'opportunity_source' else 'competitor' end)
                     order by gp.role, gp.product_id)
             filter (where p.record_status = 'active' and p.exclusion_status = 'eligible'),
           count(*) filter (where not (p.record_status = 'active' and p.exclusion_status = 'eligible'))
      into v_scope, v_omitted
      from public.generated_opportunity_products gp
      join public.saas_products p on p.id = gp.product_id
     where gp.opportunity_id = v_opp.id;
    v_snapshot := jsonb_build_object('type', 'generated_opportunity',
                    'generated_opportunity', jsonb_build_object('id', v_opp.id, 'name', v_opp.name,
                      'problem_statement', v_opp.problem_statement, 'proposed_solution', v_opp.proposed_solution,
                      'value_proposition', v_opp.value_proposition, 'target_persona', v_opp.target_persona));
    v_members := array[]::uuid[];
  else
    raise exception 'VALIDATION_ERROR: subject' using errcode = '22023';
  end if;

  -- Visible competitors of a product or product set (direction: the linked
  -- product competes for the subject's buyers).
  if v_type in ('product', 'product_set') then
    select coalesce(v_scope, '[]'::jsonb) || coalesce(jsonb_agg(jsonb_build_object('product_id', x.id, 'role', 'competitor')
                                                      order by x.name, x.id), '[]'::jsonb)
      into v_scope
      from (select distinct p.id, p.name
              from public.competitor_links l
              join public.saas_products p on p.id = l.competitor_product_id
             where l.product_id = any(v_members) and not (l.competitor_product_id = any(v_members))
               and p.record_status = 'active' and p.exclusion_status = 'eligible'
             order by p.name, p.id
             limit v_max_competitors) x;
    select count(distinct l.competitor_product_id) into v_omitted
      from public.competitor_links l
      join public.saas_products p on p.id = l.competitor_product_id
     where l.product_id = any(v_members)
       and not (p.record_status = 'active' and p.exclusion_status = 'eligible');
  end if;

  if coalesce(jsonb_array_length(v_scope), 0) = 0 then
    raise exception 'VALIDATION_ERROR: empty scope' using errcode = '22023';
  end if;

  -- BUILD thresholds frozen at request time; a workspace can only raise them (PD-23 A).
  select s.research_preferences into v_prefs from public.workspace_settings s where s.workspace_id = p_workspace_id;
  v_thresholds := jsonb_build_object(
    'min_score', greatest(75, coalesce((v_prefs -> 'stricter_build_thresholds' ->> 'min_score')::integer, 75)),
    'min_wtp', greatest(10, coalesce((v_prefs -> 'stricter_build_thresholds' ->> 'min_wtp')::integer, 10)));

  select * into v_job from private.create_job('opportunity_analysis', p_workspace_id, p_requested_by,
                                               p_idempotency_key, p_request_hash,
                                               jsonb_build_object('analysis_id', v_analysis));
  if not v_job.created then
    return query
      select (j.payload ->> 'analysis_id')::uuid, j.id, false
        from public.job_executions j where j.id = v_job.job_id;
    return;
  end if;

  insert into public.opportunity_analyses (
    id, workspace_id, created_by, analysis_type, subject_type, subject_product_id, subject_category_id,
    subject_cluster_id, subject_generated_opportunity_id, subject_snapshot, analysis_version,
    scoring_rules_version, analysis_depth, target_market, user_context, job_execution_id)
  values (
    v_analysis, p_workspace_id, p_requested_by, p_analysis_type, v_type::public.analysis_subject_type,
    case when v_type = 'product' then v_product.id end,
    case when v_type = 'category' then v_category.id end,
    case when v_type = 'pain_point_cluster' then v_cluster.id end,
    case when v_type = 'generated_opportunity' then v_opp.id end,
    v_snapshot || jsonb_build_object('omitted_excluded_count', coalesce(v_omitted, 0)),
    'opportunity-analysis.v1', 'scoring-1', v_depth, v_market,
    jsonb_build_object('context', v_context, 'options', v_options, 'build_thresholds', v_thresholds),
    v_job.job_id);
  insert into public.analysis_subject_products (analysis_id, product_id, role)
  select v_analysis, (x ->> 'product_id')::uuid, x ->> 'role' from jsonb_array_elements(v_scope) x
  on conflict do nothing;

  return query select v_analysis, v_job.job_id, true;
end;
$$;

-- The analysis mirrors the state of its current job; a needs_review
-- analysis (O7a rejected twice, §9.2) keeps that status.
create or replace function private.trg_sync_analysis_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.job_kind <> 'opportunity_analysis' or new.state is not distinct from old.state then
    return new;
  end if;
  update public.opportunity_analyses a
     set status = case
                    when a.status = 'needs_review' and new.state in ('completed', 'partial') then 'needs_review'
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
                                then coalesce(new.terminal_reason, a.terminal_reason) else null end,
         started_at = case when new.state = 'running' then coalesce(a.started_at, now()) else a.started_at end,
         completed_at = case when new.state in ('completed', 'partial', 'failed', 'cancelled', 'dead_letter')
                             then now() else null end
   where a.job_execution_id = new.id;
  return new;
end;
$$;
create trigger job_executions_sync_analysis after update of state on public.job_executions
for each row execute function private.trg_sync_analysis_state();

-- ---------------------------------------------------------------------------
-- Worker RPCs (service_role)
-- ---------------------------------------------------------------------------
create or replace function private.running_analysis(p_analysis_id uuid)
returns public.opportunity_analyses
language plpgsql
stable
set search_path = ''
as $$
declare v public.opportunity_analyses;
begin
  select a.* into v from public.opportunity_analyses a
    join public.job_executions j on j.id = a.job_execution_id
   where a.id = p_analysis_id and j.state = 'running';
  if v.id is null then
    raise exception 'INVALID_STATE: analysis job not running' using errcode = '55000';
  end if;
  return v;
end;
$$;

-- Evidence index (§8.1): the scope trigger rejects anything outside the scope.
create or replace function public.sor_analysis_add_evidence(
  p_analysis_id uuid, p_step_id uuid, p_evidence_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  perform private.running_analysis(p_analysis_id);
  insert into public.analysis_evidence (analysis_id, evidence_item_id, added_by_step_id)
  select p_analysis_id, x, p_step_id from unnest(p_evidence_ids) x
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- O7a rejected twice (§9.2): the analysis needs review, without a score.
create or replace function public.sor_analysis_needs_review(p_analysis_id uuid, p_limitations jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.running_analysis(p_analysis_id);
  update public.opportunity_analyses
     set status = 'needs_review', limitations = coalesce(p_limitations, '[]'::jsonb)
   where id = p_analysis_id;
end;
$$;

-- Final write of one analysis: dimensions, findings, scores, verdict and
-- report in one transaction. Rewrites are idempotent (worker-provided finding
-- ids). The database recomputes what it can and refuses any inconsistency
-- with the deterministic rules (defence in depth for §9).
create or replace function public.sor_analysis_finalize(p_analysis_id uuid, p_result jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.opportunity_analyses;
  d jsonb;
  f jsonb;
  s jsonb := p_result -> 'score';
  v_coverage numeric;
  v_points numeric;
  v_wtp_rating smallint;
  v_score numeric;
  v_wtp numeric;
  v_band public.decision_band;
  v_verdict public.analysis_verdict := (p_result ->> 'verdict')::public.analysis_verdict;
  v_fatal boolean;
  v_unresolved boolean;
  v_bad uuid;
begin
  v := private.running_analysis(p_analysis_id);

  delete from public.analysis_findings where analysis_id = p_analysis_id;
  delete from public.analysis_dimension_scores where analysis_id = p_analysis_id;

  for d in select * from jsonb_array_elements(p_result -> 'dimensions') loop
    insert into public.analysis_dimension_scores (analysis_id, dimension_key, weight, assessment_status, rating,
                                                  explanation, missing_information, proposed_by_step_id)
    values (p_analysis_id, (d ->> 'dimension_key')::public.dimension_key,
            case d ->> 'dimension_key' when 'customer_demand' then 20 when 'product_gap' then 20 else 15 end,
            (d ->> 'assessment_status')::public.assessment_status, (d ->> 'rating')::smallint,
            d ->> 'explanation', coalesce(d -> 'missing_information', '[]'::jsonb),
            (d ->> 'proposed_by_step_id')::uuid);
    insert into public.dimension_score_evidence (analysis_id, dimension_key, evidence_item_id, support_type)
    select p_analysis_id, (d ->> 'dimension_key')::public.dimension_key, (e ->> 'evidence_id')::uuid,
           coalesce(e ->> 'support_type', 'supports')
      from jsonb_array_elements(coalesce(d -> 'evidence', '[]'::jsonb)) e
    on conflict do nothing;
  end loop;

  for f in select * from jsonb_array_elements(coalesce(p_result -> 'findings', '[]'::jsonb)) loop
    insert into public.analysis_findings (id, analysis_id, finding_type, title, description, priority, confidence,
                                          is_hypothesis, severity, is_substantiated, dimension_key, source_agent,
                                          recommendation)
    values ((f ->> 'id')::uuid, p_analysis_id, (f ->> 'finding_type')::public.finding_type, f ->> 'title',
            f ->> 'description', (f ->> 'priority')::smallint, (f ->> 'confidence')::numeric,
            (f ->> 'is_hypothesis')::boolean, (f ->> 'severity')::public.kill_severity,
            case when f ->> 'finding_type' = 'kill_criterion' then false end,
            (f ->> 'dimension_key')::public.dimension_key, f ->> 'source_agent', f ->> 'recommendation');
    insert into public.finding_evidence (finding_id, analysis_id, evidence_item_id, support_type, relevance_score)
    select (f ->> 'id')::uuid, p_analysis_id, (e ->> 'evidence_id')::uuid, coalesce(e ->> 'support_type', 'supports'),
           (e ->> 'relevance_score')::numeric
      from jsonb_array_elements(coalesce(f -> 'evidence', '[]'::jsonb)) e
    on conflict do nothing;
  end loop;

  -- §9.5: substantiated = a supporting item, verified, reliability ≤ 3.
  update public.analysis_findings af
     set is_substantiated = exists (
           select 1 from public.finding_evidence fe join public.evidence_items e on e.id = fe.evidence_item_id
            where fe.finding_id = af.id and fe.support_type = 'supports'
              and e.verification_status = 'verified' and e.reliability_level <= 3)
   where af.analysis_id = p_analysis_id and af.finding_type = 'kill_criterion';
  select f2.id into v_bad
    from jsonb_array_elements(coalesce(p_result -> 'findings', '[]'::jsonb)) x
    join public.analysis_findings f2 on f2.id = (x ->> 'id')::uuid
   where f2.finding_type = 'kill_criterion'
     and f2.is_substantiated is distinct from (x ->> 'is_substantiated')::boolean
   limit 1;
  if v_bad is not null then
    raise exception 'SCORING_MISMATCH: kill criterion substantiation' using errcode = '23514';
  end if;

  -- Coverage, points, WTP and band recomputed from the stored dimensions.
  select coalesce(sum(weight) filter (where assessment_status = 'assessed'), 0),
         coalesce(sum(weighted_points), 0),
         max(rating) filter (where dimension_key = 'willingness_to_pay')
    into v_coverage, v_points, v_wtp_rating
    from public.analysis_dimension_scores where analysis_id = p_analysis_id;
  if (select count(*) from public.analysis_dimension_scores where analysis_id = p_analysis_id) <> 6 then
    raise exception 'SCORING_MISMATCH: six dimensions expected' using errcode = '23514';
  end if;
  v_score := case when v_coverage = 100 then v_points end;
  v_wtp := v_wtp_rating * 3;
  v_band := case when v_score is null then null
                 when v_score < 50 then 'reject' when v_score < 65 then 'low_potential'
                 when v_score < 75 then 'to_investigate' when v_score < 85 then 'interesting'
                 else 'priority' end;
  if (s ->> 'score_coverage')::numeric is distinct from v_coverage
     or (s ->> 'provisional_points')::numeric is distinct from v_points
     or (s ->> 'score_total')::numeric is distinct from v_score
     or (s ->> 'willingness_to_pay_score')::numeric is distinct from v_wtp
     or (s ->> 'decision_band')::public.decision_band is distinct from v_band then
    raise exception 'SCORING_MISMATCH: score' using errcode = '23514';
  end if;

  -- Verdict gates the database can check (§9.6).
  select exists (select 1 from public.analysis_findings where analysis_id = p_analysis_id
                   and finding_type = 'kill_criterion' and severity = 'critical' and is_substantiated),
         exists (select 1 from public.analysis_findings where analysis_id = p_analysis_id
                   and finding_type = 'kill_criterion' and severity = 'critical' and not is_substantiated)
    into v_fatal, v_unresolved;
  if v_fatal and v_verdict <> 'reject' then
    raise exception 'SCORING_MISMATCH: fatal flaw must reject' using errcode = '23514';
  end if;
  if not v_fatal and v_coverage < 100 and v_verdict <> 'validate_first' then
    raise exception 'SCORING_MISMATCH: incomplete coverage is validate_first' using errcode = '23514';
  end if;
  if v_verdict = 'reject' and not v_fatal and not (v_score < 50) then
    raise exception 'SCORING_MISMATCH: reject only for a fatal flaw or a score below 50' using errcode = '23514';
  end if;
  if v_verdict = 'build_candidate' and (
       v_unresolved
       or v_score < greatest(75, coalesce((v.user_context -> 'build_thresholds' ->> 'min_score')::numeric, 75))
       or v_wtp < greatest(10, coalesce((v.user_context -> 'build_thresholds' ->> 'min_wtp')::numeric, 10))
       or (s ->> 'confidence_score')::numeric < 70
       or not exists (select 1 from public.analysis_evidence ae join public.evidence_items e on e.id = ae.evidence_item_id
                       where ae.analysis_id = p_analysis_id and e.verification_status = 'verified'
                         and e.monetization_signal in ('payment_confirmed', 'customer_verified'))) then
    raise exception 'SCORING_MISMATCH: build gates' using errcode = '23514';
  end if;

  -- Every evidence ID cited in the report belongs to the evidence index.
  select x.id into v_bad
    from (select (jsonb_path_query(p_result -> 'report', 'lax $.**.evidence_id') #>> '{}')::uuid as id) x
   where not exists (select 1 from public.analysis_evidence ae
                      where ae.analysis_id = p_analysis_id and ae.evidence_item_id = x.id)
   limit 1;
  if v_bad is not null then
    raise exception 'EVIDENCE_SCOPE_VIOLATION: report cites evidence outside the index' using errcode = '23514';
  end if;

  update public.opportunity_analyses
     set score_total = v_score,
         provisional_points = v_points,
         score_coverage = v_coverage,
         willingness_to_pay_score = v_wtp,
         confidence_score = (s ->> 'confidence_score')::numeric,
         decision_band = v_band,
         verdict = v_verdict,
         verdict_reasons = coalesce(p_result -> 'verdict_reasons', '[]'::jsonb),
         executive_summary = p_result ->> 'executive_summary',
         report_json = p_result -> 'report',
         limitations = coalesce(p_result -> 'limitations', '[]'::jsonb)
   where id = p_analysis_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- User actions (service_role, called by the API after authorization)
-- ---------------------------------------------------------------------------

-- DELETE W/analyses/{id} (PRD §14.4): admin+, finished analyses, audit-logged.
create or replace function public.sor_delete_analysis(
  p_workspace_id uuid, p_actor uuid, p_analysis_id uuid, p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v public.opportunity_analyses;
begin
  if not exists (select 1 from public.workspace_members m
                  where m.workspace_id = p_workspace_id and m.user_id = p_actor
                    and m.role in ('owner', 'admin')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v from public.opportunity_analyses a
   where a.id = p_analysis_id and a.workspace_id = p_workspace_id for update;
  if v.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v.status not in ('completed', 'partial', 'failed', 'cancelled', 'needs_review') then
    raise exception 'INVALID_STATE: analysis not finished' using errcode = '55000';
  end if;
  -- Children citing the evidence index first (restrict foreign keys).
  delete from public.analysis_findings where analysis_id = p_analysis_id;
  delete from public.analysis_dimension_scores where analysis_id = p_analysis_id;
  delete from public.opportunity_analyses where id = p_analysis_id;
  insert into public.audit_logs (workspace_id, actor_user_id, actor_kind, action, resource_type, resource_id,
                                 request_id, metadata)
  values (p_workspace_id, p_actor, 'user', 'opportunity_analysis.delete', 'opportunity_analysis', p_analysis_id,
          p_request_id, jsonb_build_object('subject_type', v.subject_type, 'verdict', v.verdict));
end;
$$;

-- POST W/analyses/{id}/retry: a new job for a failed, partial, cancelled or
-- needs_review analysis; previous results are cleared (never shown as current).
create or replace function public.sor_retry_analysis(
  p_workspace_id uuid, p_actor uuid, p_analysis_id uuid, p_idempotency_key text, p_request_hash text)
returns table (job_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.opportunity_analyses;
  v_job record;
begin
  if not exists (select 1 from public.workspace_members m
                  where m.workspace_id = p_workspace_id and m.user_id = p_actor
                    and m.role in ('owner', 'admin', 'member')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v from public.opportunity_analyses a
   where a.id = p_analysis_id and a.workspace_id = p_workspace_id for update;
  if v.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_job from private.create_job('opportunity_analysis', p_workspace_id, p_actor, p_idempotency_key,
                                               p_request_hash,
                                               jsonb_build_object('analysis_id', p_analysis_id, 'retry', true));
  if not v_job.created then
    return query select v_job.job_id, false;
    return;
  end if;
  if v.status not in ('failed', 'partial', 'cancelled', 'needs_review') then
    raise exception 'INVALID_STATE: only failed, partial, cancelled or needs_review analyses can be retried'
      using errcode = '55000';
  end if;
  delete from public.analysis_findings where analysis_id = p_analysis_id;
  delete from public.analysis_dimension_scores where analysis_id = p_analysis_id;
  update public.opportunity_analyses
     set job_execution_id = v_job.job_id, status = 'queued', terminal_reason = null, completed_at = null,
         score_total = null, provisional_points = null, score_coverage = null, willingness_to_pay_score = null,
         confidence_score = null, decision_band = null, verdict = null, verdict_reasons = '[]'::jsonb,
         executive_summary = null, report_json = null, limitations = '[]'::jsonb
   where id = p_analysis_id;
  return query select v_job.job_id, true;
end;
$$;

-- Report export jobs (POST W/analyses/{id}/exports, §10): one more kind for
-- the generic request RPC of M5 (unchanged otherwise).
create or replace function public.sor_request_job(
  p_kind public.job_kind, p_workspace_id uuid, p_requested_by uuid,
  p_idempotency_key text, p_request_hash text, p_payload jsonb)
returns table (job_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.saas_products;
  v_analysis public.opportunity_analyses;
  v_rows integer;
begin
  if p_kind not in ('product_enrichment', 'catalog_import', 'feedback_import', 'report_export') then
    raise exception 'VALIDATION_ERROR: job kind not available' using errcode = '22023';
  end if;
  if not exists (select 1 from public.workspace_members m
                  where m.workspace_id = p_workspace_id and m.user_id = p_requested_by
                    and m.role in ('owner', 'admin', 'member')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'VALIDATION_ERROR: request hash' using errcode = '22023';
  end if;

  if p_kind = 'product_enrichment' then
    if (p_payload ->> 'product_id') is null
       or (p_payload - 'product_id') <> '{}'::jsonb then
      raise exception 'VALIDATION_ERROR: payload' using errcode = '22023';
    end if;
    select * into v_product from public.saas_products p where p.id = (p_payload ->> 'product_id')::uuid;
    if v_product.id is null or v_product.record_status <> 'active' then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_product.exclusion_status <> 'eligible' then
      raise exception 'EXCLUDED_SUBJECT: product is not eligible' using errcode = '23514';
    end if;
    if v_product.website_url is null then
      raise exception 'VALIDATION_ERROR: product has no official URL' using errcode = '22023';
    end if;
  elsif p_kind = 'report_export' then
    if (p_payload ->> 'analysis_id') is null or coalesce(p_payload ->> 'format', '') not in ('json', 'markdown')
       or (p_payload - 'analysis_id' - 'format') <> '{}'::jsonb then
      raise exception 'VALIDATION_ERROR: payload' using errcode = '22023';
    end if;
    select * into v_analysis from public.opportunity_analyses a
     where a.id = (p_payload ->> 'analysis_id')::uuid and a.workspace_id = p_workspace_id;
    if v_analysis.id is null then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_analysis.report_json is null or v_analysis.status not in ('completed', 'partial') then
      raise exception 'INVALID_STATE: the analysis has no report' using errcode = '55000';
    end if;
  else
    -- Imports carry the raw CSV; the worker parses and validates every row.
    v_rows := (p_payload ->> 'row_count')::integer;
    if coalesce(jsonb_typeof(p_payload -> 'csv'), '') <> 'string' or length(p_payload ->> 'csv') > 2000000
       or v_rows is null or v_rows < 1 or v_rows > private.limit_int('import_max_rows', 1000) then
      raise exception 'VALIDATION_ERROR: csv' using errcode = '22023';
    end if;
    if p_kind = 'feedback_import' and coalesce(jsonb_typeof(p_payload -> 'rights_declaration'), '') <> 'object' then
      raise exception 'VALIDATION_ERROR: rights declaration' using errcode = '22023';
    end if;
  end if;

  return query select * from private.create_job(p_kind, p_workspace_id, p_requested_by,
                                                 p_idempotency_key, p_request_hash, p_payload);
end;
$$;

create or replace function public.sor_save_report_export(
  p_job_id uuid, p_format text, p_filename text, p_content_type text, p_content text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.job_executions;
  v_id uuid;
begin
  select * into v_job from public.job_executions j where j.id = p_job_id and j.job_kind = 'report_export';
  if v_job.id is null or v_job.state <> 'running' then
    raise exception 'INVALID_STATE: export job not running' using errcode = '55000';
  end if;
  if p_format is distinct from v_job.payload ->> 'format' then
    raise exception 'VALIDATION_ERROR: format' using errcode = '22023';
  end if;
  insert into public.report_exports (workspace_id, analysis_id, job_execution_id, format, content_type, filename,
                                     content, created_by)
  values (v_job.workspace_id, (v_job.payload ->> 'analysis_id')::uuid, p_job_id, p_format, p_content_type,
          p_filename, p_content, v_job.requested_by)
  on conflict (job_execution_id) do update
    set content = excluded.content, filename = excluded.filename, content_type = excluded.content_type
  returning id into v_id;
  return v_id;
end;
$$;

-- Pain point runs whose clusters are analysis subjects cannot be deleted
-- (the analysis keeps its subject; M6 function, one more check).
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
  if exists (select 1 from public.opportunity_analyses a
               join public.pain_point_clusters c on c.id = a.subject_cluster_id
              where c.run_id = p_run_id) then
    raise exception 'INVALID_STATE: clusters used by an opportunity analysis' using errcode = '55000';
  end if;
  delete from public.pain_point_runs where id = p_run_id;
  insert into public.audit_logs (workspace_id, actor_user_id, actor_kind, action, resource_type, resource_id,
                                 request_id, metadata)
  values (p_workspace_id, p_actor, 'user', 'pain_point_run.delete', 'pain_point_run', p_run_id, p_request_id,
          jsonb_build_object('title', v_run.title));
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.sor_request_analysis(uuid, uuid, text, text, public.analysis_type, jsonb, jsonb)',
    'public.sor_analysis_add_evidence(uuid, uuid, uuid[])',
    'public.sor_analysis_needs_review(uuid, jsonb)',
    'public.sor_analysis_finalize(uuid, jsonb)',
    'public.sor_delete_analysis(uuid, uuid, uuid, uuid)',
    'public.sor_retry_analysis(uuid, uuid, uuid, text, text)',
    'public.sor_request_job(public.job_kind, uuid, uuid, text, text, jsonb)',
    'public.sor_save_report_export(uuid, text, text, text, text)',
    'public.sor_delete_pain_point_run(uuid, uuid, uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array[
    'private.trg_sync_analysis_state()',
    'private.running_analysis(uuid)',
    'private.trg_analysis_evidence_scope()',
    'private.trg_dimension_requires_evidence()',
    'private.trg_finding_requires_evidence()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
