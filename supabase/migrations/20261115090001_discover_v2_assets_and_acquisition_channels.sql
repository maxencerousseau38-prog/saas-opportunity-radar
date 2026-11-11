-- Discover V2 — sourced catalogue visuals and observed acquisition channels.
-- No connector is enabled by this migration. Catalog facts remain server-written.

create table public.product_acquisition_channels (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.saas_products(id) on delete cascade,
  channel_key text not null check (channel_key ~ '^[a-z][a-z0-9_]{0,59}$'),
  channel_category text not null check (channel_category in (
    'organic','community','content_search','social','partnership','paid','other','unknown'
  )),
  role text not null check (role in ('primary','secondary','unknown')),
  fact_status public.fact_status not null,
  confidence numeric(5,2) check (confidence between 0 and 100),
  method text not null check (length(method) between 1 and 100),
  inference_rationale text,
  evidence_id uuid references public.evidence_items(id) on delete restrict,
  observed_at timestamptz not null default now(),
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  check (
    (fact_status = 'unknown' and channel_key = 'unknown' and channel_category = 'unknown' and role = 'unknown' and evidence_id is null)
    or (fact_status <> 'unknown' and channel_key <> 'unknown' and channel_category <> 'unknown' and role in ('primary','secondary') and evidence_id is not null)
  ),
  check (fact_status <> 'unknown' or confidence is null),
  check (fact_status <> 'estimated' or nullif(inference_rationale, '') is not null)
);
create unique index product_acquisition_channel_current
  on public.product_acquisition_channels(product_id, channel_key) where is_current;
create unique index product_acquisition_channel_primary
  on public.product_acquisition_channels(product_id) where is_current and role = 'primary';
create index product_acquisition_channel_filter
  on public.product_acquisition_channels(channel_key, fact_status, product_id) where is_current;

create table public.product_visual_assets (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.saas_products(id) on delete cascade,
  asset_type text not null check (asset_type in (
    'official_hero','product_screenshot','official_illustration'
  )),
  source_url text not null check (source_url ~* '^https://'),
  delivery_path text check (
    delivery_path is null or (delivery_path ~ '^/[^/]' and delivery_path not like '//%')
  ),
  content_hash text not null check (length(content_hash) >= 16),
  alt_text text not null check (length(alt_text) between 1 and 500),
  rights_basis text not null check (length(rights_basis) between 1 and 1000),
  rights_status text not null check (rights_status in ('approved','unknown','restricted','removed')),
  verification_status public.verification_status not null default 'unverified',
  confidence numeric(5,2) check (confidence between 0 and 100),
  evidence_id uuid not null references public.evidence_items(id) on delete restrict,
  observed_at timestamptz not null default now(),
  is_primary boolean not null default false,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  check (rights_status <> 'approved' or verification_status = 'verified')
);
create unique index product_visual_asset_primary
  on public.product_visual_assets(product_id) where is_current and is_primary
    and rights_status = 'approved' and verification_status = 'verified';
create index product_visual_asset_eligible
  on public.product_visual_assets(product_id, observed_at desc)
  where is_current and rights_status = 'approved' and verification_status = 'verified';

alter table public.product_acquisition_channels enable row level security;
alter table public.product_visual_assets enable row level security;
revoke all on table public.product_acquisition_channels, public.product_visual_assets from anon, authenticated;
grant select on public.product_acquisition_channels, public.product_visual_assets to authenticated;

grant all on table
  public.product_acquisition_channels,
  public.product_visual_assets
to service_role;

create policy product_acquisition_channels_read on public.product_acquisition_channels
  for select to authenticated using (
    private.is_visible_product(product_id)
    and (evidence_id is null or private.is_visible_evidence(evidence_id))
  );
create policy product_visual_assets_read on public.product_visual_assets
  for select to authenticated using (
    is_current and rights_status = 'approved' and verification_status = 'verified'
    and private.is_visible_product(product_id)
    and private.is_visible_evidence(evidence_id)
  );

create or replace function private.check_product_discover_evidence()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_evidence_product uuid;
  v_fact_status public.fact_status;
  v_verification_status public.verification_status;
begin
  if new.evidence_id is null then return new; end if;
  select e.product_id, e.fact_status, e.verification_status
    into v_evidence_product, v_fact_status, v_verification_status
    from public.evidence_items e where e.id = new.evidence_id;
  if v_evidence_product is distinct from new.product_id then
    raise exception 'EVIDENCE_SCOPE_VIOLATION' using errcode = '23514';
  end if;
  if tg_table_name = 'product_acquisition_channels' and v_fact_status is distinct from new.fact_status then
    raise exception 'EVIDENCE_STATUS_MISMATCH' using errcode = '23514';
  end if;
  if tg_table_name = 'product_acquisition_channels' and new.fact_status = 'confirmed'
      and v_verification_status <> 'verified' then
    raise exception 'CONFIRMED_CHANNEL_REQUIRES_VERIFIED_EVIDENCE' using errcode = '23514';
  end if;
  if tg_table_name = 'product_visual_assets' and v_verification_status <> 'verified' then
    raise exception 'VISUAL_ASSET_REQUIRES_VERIFIED_EVIDENCE' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.check_product_discover_evidence() from public, anon, authenticated;
create trigger product_acquisition_channel_evidence_scope
  before insert or update of product_id, evidence_id, fact_status on public.product_acquisition_channels
  for each row execute function private.check_product_discover_evidence();
create trigger product_visual_asset_evidence_scope
  before insert or update of product_id, evidence_id on public.product_visual_assets
  for each row execute function private.check_product_discover_evidence();

-- OR within selected channel/status values; unsourced products match only
-- when the explicit unknown option is enabled.
create or replace function private.catalog_channel_matches(p_product_id uuid, p_filter jsonb)
returns boolean language sql stable set search_path = '' as $$
  select private.is_visible_product(p_product_id) and (
    p_filter is null or exists (
      select 1 from public.product_acquisition_channels c
      where c.product_id = p_product_id and c.is_current and c.fact_status <> 'unknown'
        and (jsonb_array_length(coalesce(p_filter -> 'values', '[]'::jsonb)) = 0
          or c.channel_key in (select jsonb_array_elements_text(p_filter -> 'values')))
        and (jsonb_array_length(coalesce(p_filter -> 'statuses', '[]'::jsonb)) = 0
          or c.fact_status::text in (select jsonb_array_elements_text(p_filter -> 'statuses')))
    ) or (coalesce((p_filter ->> 'include_unknown')::boolean, false) and not exists (
      select 1 from public.product_acquisition_channels c
      where c.product_id = p_product_id and c.is_current and c.fact_status <> 'unknown'
    ))
  );
$$;
revoke all on function private.catalog_channel_matches(uuid, jsonb) from public, anon;
grant execute on function private.catalog_channel_matches(uuid, jsonb) to authenticated;

-- Versioned RPCs preserve the existing RPC contract for other callers while
-- adding this new optional filter. The public endpoint still uses the same
-- catalog plan, membership gate, stable ordering and cursor semantics.
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
    select f.id, private.catalog_sort_value(p_sort, p_seed, f.id, f.first_discovered_at,
      f.start_year, f.team_size, f.monetization_score, f.last_activity_at, f.text_rank) as sv
    from private.catalog_filtered(p_workspace_id, p_plan) f
    where private.catalog_channel_matches(f.id, p_plan -> 'acquisition_channels')
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
  from ranked r join public.saas_products p on p.id=r.id
  left join public.companies c on c.id=p.company_id
  left join public.workspace_product_states ws on ws.product_id=p.id and ws.workspace_id=p_workspace_id
  where p_after_value is null or (r.sv,r.id)<(p_after_value,p_after_id)
  order by r.sv desc,r.id desc limit p_limit;
end;
$$;

create or replace function public.catalog_count_v2(p_workspace_id uuid,p_plan jsonb)
returns bigint language plpgsql stable set search_path = '' as $$
begin
  if not private.is_workspace_member(p_workspace_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return (select count(*) from private.catalog_filtered(p_workspace_id,p_plan) f
    where private.catalog_channel_matches(f.id,p_plan -> 'acquisition_channels'));
end;
$$;

create or replace function public.catalog_discover_metadata(p_product_ids uuid[])
returns table(product_id uuid,acquisition_channels jsonb,visual_asset jsonb)
language plpgsql stable set search_path = '' as $$
begin
  if cardinality(p_product_ids)>100 then
    raise exception 'VALIDATION_ERROR: too many products' using errcode = '22023';
  end if;
  return query
  select p.id,
    coalesce((select jsonb_agg(jsonb_build_object(
      'channel_key',c.channel_key,'channel_category',c.channel_category,
      'role',c.role,'status',c.fact_status,'confidence',c.confidence,
      'observed_at',c.observed_at,'source_url',sr.canonical_url,
      'source_name',s.name,'evidence_id',e.id
    ) order by (c.role='primary') desc,c.channel_key)
      from public.product_acquisition_channels c
      join public.evidence_items e on e.id=c.evidence_id
      join public.source_snapshots ss on ss.id=e.source_snapshot_id
      join public.source_records sr on sr.id=ss.source_record_id
      join public.sources s on s.id=sr.source_id
      where c.product_id=p.id and c.is_current and c.fact_status<>'unknown'
        and private.is_visible_evidence(e.id)),'[]'::jsonb),
    (select jsonb_build_object(
      'asset_type',a.asset_type,'url',a.delivery_path,'alt_text',a.alt_text,
      'source_url',sr.canonical_url,'observed_at',a.observed_at,
      'rights_basis',a.rights_basis,'confidence',a.confidence
    ) from public.product_visual_assets a
      join public.evidence_items e on e.id=a.evidence_id
      join public.source_snapshots ss on ss.id=e.source_snapshot_id
      join public.source_records sr on sr.id=ss.source_record_id
      where a.product_id=p.id and a.delivery_path is not null
        and a.is_current and a.is_primary
        and a.rights_status='approved' and a.verification_status='verified'
        and private.is_visible_evidence(e.id)
      order by a.observed_at desc limit 1)
  from public.saas_products p where p.id=any(p_product_ids)
    and private.is_visible_product(p.id);
end;
$$;

revoke all on function public.catalog_search_v2(uuid,jsonb,text,integer,numeric,uuid,integer) from public,anon;
revoke all on function public.catalog_count_v2(uuid,jsonb) from public,anon;
revoke all on function public.catalog_discover_metadata(uuid[]) from public,anon;
grant execute on function public.catalog_search_v2(uuid,jsonb,text,integer,numeric,uuid,integer) to authenticated;
grant execute on function public.catalog_count_v2(uuid,jsonb) to authenticated;
grant execute on function public.catalog_discover_metadata(uuid[]) to authenticated;
