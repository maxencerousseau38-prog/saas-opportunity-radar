-- Discover feed renewal (PD-41, rule feed-1; product-owner instruction of
-- 13 November 2026): at each opening the feed is renewed — catalogue
-- additions never seen first, cards already shown less often, profiles
-- already opened even less often, no useless repetition — without breaking
-- the keyset pagination or the favourites.
--
-- 1. public.workspace_feed_signals: per workspace and product, how many feed
--    sessions showed the card and when, and when a profile was opened from
--    the feed. Workspace data (like workspace_product_states), readable by
--    members only, written only by the server (sor_record_feed_signals,
--    called by an authenticated API route after the role check).
--    Favourites, hidden products, notes and statuses are not touched.
-- 2. A feed session starts at a server time (as_of). Signals recorded during
--    the session never change the session's own order: the ranking reads the
--    value before the session (prev_*), so pages stay consistent and coming
--    back from a profile shows the same feed. The next session sees them.
-- 3. private.feed_score mirrors @sor/domain feedScore (feed-1); the sort key
--    'discovery' ("Pour vous") ranks every visible product with it, in a new
--    catalog_search_v3 (v2 is kept unchanged for the deployed web app during
--    the rollout; same filters, count, keyset, enrichment and security).

create table public.workspace_feed_signals (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_id uuid not null references public.saas_products(id) on delete cascade,
  shown_count integer not null default 0 check (shown_count >= 0),
  last_shown_at timestamptz,
  prev_shown_at timestamptz,
  opened_count integer not null default 0 check (opened_count >= 0),
  last_opened_at timestamptz,
  prev_opened_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, product_id),
  check (prev_shown_at is null or prev_shown_at <= last_shown_at),
  check (prev_opened_at is null or prev_opened_at <= last_opened_at)
);
create index workspace_feed_signals_product_idx on public.workspace_feed_signals (product_id);

alter table public.workspace_feed_signals enable row level security;
revoke all on public.workspace_feed_signals from public, anon, authenticated;
grant select on public.workspace_feed_signals to authenticated;
grant all on public.workspace_feed_signals to service_role;
create policy workspace_feed_signals_select on public.workspace_feed_signals for select to authenticated
  using (private.is_workspace_member(workspace_id));

-- Mirror of @sor/domain feedScore (feed-1). Same constants, same ranges;
-- pgTAP 030 asserts the cases of packages/domain/src/__tests__/feed-ranking.test.ts.
create or replace function private.feed_score(
  p_draw numeric, p_age_days numeric, p_shown_count integer,
  p_days_since_shown numeric, p_days_since_opened numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_days_since_opened is not null then
      p_draw - 0.4 - 1.2 * greatest(0, 1 - greatest(0, p_days_since_opened) / 30)
    when coalesce(p_shown_count, 0) > 0 and p_days_since_shown is not null then
      p_draw - 0.9 * greatest(0, 1 - greatest(0, p_days_since_shown) / 7)
             - 0.08 * least(p_shown_count, 5)
    else
      p_draw + 0.5 + 1.0 * greatest(0, 1 - greatest(0, coalesce(p_age_days, 1e6)) / 14)
  end
$$;
revoke all on function private.feed_score(numeric, numeric, integer, numeric, numeric) from public;
grant execute on function private.feed_score(numeric, numeric, integer, numeric, numeric) to authenticated;

create or replace function public.catalog_search_v3(
  p_workspace_id uuid, p_plan jsonb, p_sort text default 'relevance',
  p_seed integer default 0, p_as_of timestamptz default null,
  p_after_value numeric default null, p_after_id uuid default null, p_limit integer default 30
)
returns table (
  id uuid, sort_value text, slug text, name text, tagline text,
  short_description text, website_url text, logo_url text,
  customer_type public.customer_type, pricing_status public.pricing_status,
  billing_models public.billing_model[], country_code char(2), employee_min integer,
  employee_max integer, start_year integer, categories jsonb, is_favorite boolean,
  is_hidden boolean, workspace_status public.opportunity_status,
  last_viewed_at timestamptz, in_collection boolean
)
language plpgsql stable set search_path = '' as $$
declare
  v_as_of timestamptz := coalesce(p_as_of, now());
begin
  if p_sort not in ('discovery','relevance','recently_added','newest','oldest','smallest_team',
      'best_monetization_evidence','most_recent_activity','random','least_analyzed') then
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
      case
      when p_sort = 'discovery' then round(
        -- A text search keeps its relevance first; the feed order breaks ties.
        coalesce(f.text_rank::numeric * 1e12, 0) + private.feed_score(
          (('x' || substr(md5(f.id::text || coalesce(p_seed, 0)::text), 1, 8))::bit(32)::bigint)::numeric
            / 4294967296,
          extract(epoch from (v_as_of - f.first_discovered_at))::numeric / 86400,
          case when s.last_shown_at >= v_as_of then s.shown_count - 1 else coalesce(s.shown_count, 0) end,
          extract(epoch from (v_as_of - case when s.last_shown_at >= v_as_of
                                             then s.prev_shown_at else s.last_shown_at end))::numeric / 86400,
          -- An opening from the feed, or a profile view, before the session.
          extract(epoch from (v_as_of - greatest(
            case when s.last_opened_at >= v_as_of then s.prev_opened_at else s.last_opened_at end,
            case when ws.last_viewed_at < v_as_of then ws.last_viewed_at end)))::numeric / 86400),
        12)
      when p_sort = 'least_analyzed' then
        -(select count(distinct a.id) from public.analysis_subject_products asp
            join public.opportunity_analyses a on a.id = asp.analysis_id
           where asp.product_id = f.id and a.workspace_id = p_workspace_id
             and asp.role in ('subject','set_member'))::numeric * 1e12
        + extract(epoch from f.first_discovered_at)::numeric
      else private.catalog_sort_value(p_sort, p_seed, f.id, f.first_discovered_at,
        f.start_year, f.team_size, f.monetization_score, f.last_activity_at, f.text_rank) end as sv
    from private.catalog_filtered(p_workspace_id, p_plan) f
    left join public.workspace_feed_signals s
      on p_sort = 'discovery' and s.workspace_id = p_workspace_id and s.product_id = f.id
    left join public.workspace_product_states ws
      on p_sort = 'discovery' and ws.workspace_id = p_workspace_id and ws.product_id = f.id
    where case when p_plan -> 'acquisition_channels' is null
               then private.is_visible_product(f.id)
               else private.catalog_channel_matches(f.id, p_plan -> 'acquisition_channels') end
  ), page as (
    select r.id, r.sv from ranked r
    where p_after_value is null or (r.sv, r.id) < (p_after_value, p_after_id)
    order by r.sv desc, r.id desc
    limit p_limit
  )
  select r.id, r.sv::text, p.slug, p.name, p.tagline, p.short_description,
    p.website_url, p.logo_url, p.customer_type, p.pricing_status, p.billing_models,
    c.country_code, c.employee_min, c.employee_max, coalesce(c.founded_year,p.launch_year),
    coalesce((select jsonb_agg(jsonb_build_object('slug',cat.slug,'name',cat.name,'is_primary',pc.is_primary)
      order by pc.is_primary desc,cat.name)
      from public.product_categories pc join public.categories cat on cat.id=pc.category_id
      where pc.product_id=p.id),'[]'::jsonb),
    coalesce(ws.is_favorite,false),coalesce(ws.is_hidden,false),ws.status,ws.last_viewed_at,
    exists(select 1 from public.collection_items ci
      where ci.workspace_id=p_workspace_id and ci.product_id=p.id)
  from page r join public.saas_products p on p.id=r.id
  left join public.companies c on c.id=p.company_id
  left join public.workspace_product_states ws on ws.product_id=p.id and ws.workspace_id=p_workspace_id
  order by r.sv desc,r.id desc;
end;
$$;
revoke all on function public.catalog_search_v3(uuid,jsonb,text,integer,timestamptz,numeric,uuid,integer) from public,anon;
grant execute on function public.catalog_search_v3(uuid,jsonb,text,integer,timestamptz,numeric,uuid,integer) to authenticated;

-- Server-only write path. The API route has authenticated the user and
-- checked an editing role; the role is checked again here (the service role
-- bypasses RLS). A card shown several times in one session counts once; the
-- value before the session is kept in prev_* for the session's own ranking.
create or replace function public.sor_record_feed_signals(
  p_workspace_id uuid, p_actor_id uuid, p_started_at timestamptz,
  p_shown uuid[], p_opened uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Never before the session start, whatever the clocks: an in-session
  -- signal must read as in-session (last_* >= as_of).
  v_now timestamptz := greatest(now(), p_started_at);
  v_shown integer;
  v_opened integer;
begin
  if p_started_at is null or p_started_at > now() + interval '5 minutes'
     or p_started_at < now() - interval '24 hours' then
    raise exception 'VALIDATION_ERROR: feed session' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_shown), 0) > 100 or coalesce(cardinality(p_opened), 0) > 20 then
    raise exception 'VALIDATION_ERROR: too many signals' using errcode = '22023';
  end if;
  if not exists (select 1 from public.workspace_members m
                  where m.workspace_id = p_workspace_id and m.user_id = p_actor_id
                    and m.role in ('owner', 'admin', 'member')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.workspace_feed_signals as s (workspace_id, product_id, shown_count, last_shown_at)
  select p_workspace_id, p.id, 1, v_now
    from (select distinct unnest(coalesce(p_shown, '{}')) as id) x
    join public.saas_products p on p.id = x.id
   where p.record_status = 'active' and p.exclusion_status = 'eligible'
  on conflict (workspace_id, product_id) do update
     set shown_count = s.shown_count + 1, prev_shown_at = s.last_shown_at,
         last_shown_at = v_now, updated_at = now()
   where s.last_shown_at is null or s.last_shown_at < p_started_at;
  get diagnostics v_shown = row_count;

  insert into public.workspace_feed_signals as s (workspace_id, product_id, opened_count, last_opened_at)
  select p_workspace_id, p.id, 1, v_now
    from (select distinct unnest(coalesce(p_opened, '{}')) as id) x
    join public.saas_products p on p.id = x.id
   where p.record_status = 'active' and p.exclusion_status = 'eligible'
  on conflict (workspace_id, product_id) do update
     set opened_count = s.opened_count + 1, prev_opened_at = s.last_opened_at,
         last_opened_at = v_now, updated_at = now()
   where s.last_opened_at is null or s.last_opened_at < p_started_at;
  get diagnostics v_opened = row_count;

  return v_shown + v_opened;
end;
$$;
revoke all on function public.sor_record_feed_signals(uuid, uuid, timestamptz, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.sor_record_feed_signals(uuid, uuid, timestamptz, uuid[], uuid[]) to service_role;
