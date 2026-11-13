-- Discover search speed in production (13 November 2026). As a signed-in
-- member, the first Discover page took 4.6 s on the hosted project (8,540
-- visible SaaS) and, on a cold start with the count in parallel, reached the
-- 8 s statement timeout of the authenticated role ("canceling statement due to
-- statement timeout"). Two causes, two fixes; results, ordering, cursors and
-- security are unchanged:
--
-- 1. The verified-payment count of every product read each of its evidence
--    rows through the evidence RLS helper before the cheap filters (about
--    20,000 helper calls, 2.5 s). A partial index holds only the evidence
--    that can match (verified payment or customer proof): almost no row is
--    read, the RLS policy still applies to every row that is.
-- 2. catalog_search_v2 joined categories, company, workspace state and
--    collections for every matching product, then sorted and kept one page.
--    It now sorts and pages the ranked ids first, then enriches only the page.
-- 3. private.catalog_channel_matches ran once per product (8,540 calls of a
--    non-inlinable function, 1.5 s) even without any Acquisition Channel
--    filter. Without that filter only its visibility check is kept
--    (private.is_visible_product, the same check it starts with); with the
--    filter it runs as before. Search and count use the same predicate.

create index if not exists evidence_items_verified_monetization_idx
  on public.evidence_items (product_id)
  where verification_status = 'verified'
    and monetization_signal in ('payment_confirmed', 'customer_verified');

create or replace function public.catalog_search_v2(
  p_workspace_id uuid, p_plan jsonb, p_sort text default 'relevance',
  p_seed integer default 0, p_after_value numeric default null,
  p_after_id uuid default null, p_limit integer default 30
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
begin
  if p_sort not in ('relevance','recently_added','newest','oldest','smallest_team',
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
      case when p_sort = 'least_analyzed' then
        -(select count(distinct a.id) from public.analysis_subject_products asp
            join public.opportunity_analyses a on a.id = asp.analysis_id
           where asp.product_id = f.id and a.workspace_id = p_workspace_id
             and asp.role in ('subject','set_member'))::numeric * 1e12
        + extract(epoch from f.first_discovered_at)::numeric
      else private.catalog_sort_value(p_sort, p_seed, f.id, f.first_discovered_at,
        f.start_year, f.team_size, f.monetization_score, f.last_activity_at, f.text_rank) end as sv
    from private.catalog_filtered(p_workspace_id, p_plan) f
    where case when p_plan -> 'acquisition_channels' is null
               then private.is_visible_product(f.id)
               else private.catalog_channel_matches(f.id, p_plan -> 'acquisition_channels') end
  ), page as (
    -- Same keyset and order as before, applied before any enrichment.
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
create or replace function public.catalog_count_v2(p_workspace_id uuid,p_plan jsonb)
returns bigint language plpgsql stable set search_path = '' as $$
begin
  if not private.is_workspace_member(p_workspace_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return (select count(*) from private.catalog_filtered(p_workspace_id,p_plan) f
    where case when p_plan -> 'acquisition_channels' is null
               then private.is_visible_product(f.id)
               else private.catalog_channel_matches(f.id, p_plan -> 'acquisition_channels') end);
end;
$$;

revoke all on function public.catalog_search_v2(uuid,jsonb,text,integer,numeric,uuid,integer) from public,anon;
grant execute on function public.catalog_search_v2(uuid,jsonb,text,integer,numeric,uuid,integer) to authenticated;
revoke all on function public.catalog_count_v2(uuid,jsonb) from public,anon;
grant execute on function public.catalog_count_v2(uuid,jsonb) to authenticated;
