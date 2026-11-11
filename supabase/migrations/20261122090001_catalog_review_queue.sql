-- S8.2: persisted review queue for collected catalog listings.
--
-- The catalog ingester sends some listings to review instead of writing them
-- (CLAUDE.md §8: a candidate needs a credible identity and official URL, or
-- goes to review): a shared host (app store, code host, social profile), the
-- same registrable domain as an existing product with another URL, a similar
-- name, several products on one domain. Until now these outcomes were only
-- counted (560 of 9,159 listings in the first collection) and lost.
--
-- 1. public.catalog_listing_reviews: one row per (source, source item),
--    server-only (no browser grant; the operator console reads it through
--    the server after the MFA-verified operator check, as for exclusion
--    reviews). It keeps the ingest-ready row (canonical URL, catmap
--    categories, licence, content hash), the exclusion assessment, the reason
--    and the candidate products.
-- 2. sor_catalog_record_review (service_role): idempotent upsert by the
--    ingester. An open review is refreshed; a rejected one is reopened only
--    when the listing changed; a created/attached one is left as is.
-- 3. sor_operator_resolve_catalog_review (service_role, operator checked):
--    create the product, attach the listing to an existing product (both
--    through sor_ingest_catalog_listing, so provenance, identifiers and
--    exclusion are the usual ones), or reject. Creating from a shared host is
--    refused (not an official product site). Every decision is audited.

create table public.catalog_listing_reviews (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete restrict,
  external_id text not null check (length(external_id) between 1 and 200),
  listing jsonb not null check (jsonb_typeof(listing) = 'object'),
  exclusion jsonb not null check (jsonb_typeof(exclusion) = 'object'),
  content_hash text not null check (length(content_hash) >= 16),
  reason text not null check (reason ~ '^[a-z0-9_]{1,80}$'),
  candidate_product_ids uuid[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'created', 'attached', 'rejected')),
  resolved_product_id uuid references public.saas_products(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_note text check (resolution_note is null or length(resolution_note) between 1 and 1000),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (source_id, external_id),
  check ((status = 'open') = (resolved_at is null)),
  check (status not in ('created', 'attached') or resolved_product_id is not null)
);
create index catalog_listing_reviews_open_idx on public.catalog_listing_reviews (first_seen_at)
  where status = 'open';

alter table public.catalog_listing_reviews enable row level security;
revoke all on public.catalog_listing_reviews from public, anon, authenticated;
grant all on public.catalog_listing_reviews to service_role;

create or replace function public.sor_catalog_record_review(
  p_row jsonb, p_exclusion jsonb, p_reason text, p_candidates uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source uuid;
  v_id uuid;
begin
  select s.id into v_source from public.sources s where s.source_key = p_row ->> 'source_key';
  if v_source is null then
    raise exception 'VALIDATION_ERROR: unknown source' using errcode = '22023';
  end if;
  if coalesce(p_row ->> 'external_id', '') = '' or coalesce(p_row ->> 'content_hash', '') = ''
     or coalesce(p_row ->> 'canonical_url', '') = '' or coalesce(trim(p_row ->> 'name'), '') = '' then
    raise exception 'VALIDATION_ERROR: listing' using errcode = '22023';
  end if;
  insert into public.catalog_listing_reviews (source_id, external_id, listing, exclusion, content_hash,
                                              reason, candidate_product_ids)
    values (v_source, p_row ->> 'external_id', p_row, coalesce(p_exclusion, '{}'::jsonb),
            p_row ->> 'content_hash', p_reason, coalesce(p_candidates, '{}'))
    on conflict (source_id, external_id) do update set
      listing = case when public.catalog_listing_reviews.status in ('open', 'rejected')
                     then excluded.listing else public.catalog_listing_reviews.listing end,
      exclusion = case when public.catalog_listing_reviews.status in ('open', 'rejected')
                       then excluded.exclusion else public.catalog_listing_reviews.exclusion end,
      reason = case when public.catalog_listing_reviews.status in ('open', 'rejected')
                    then excluded.reason else public.catalog_listing_reviews.reason end,
      candidate_product_ids = case when public.catalog_listing_reviews.status in ('open', 'rejected')
                                   then excluded.candidate_product_ids
                                   else public.catalog_listing_reviews.candidate_product_ids end,
      -- A rejected listing comes back to review only when its content changed.
      status = case when public.catalog_listing_reviews.status = 'rejected'
                         and public.catalog_listing_reviews.content_hash <> excluded.content_hash
                    then 'open' else public.catalog_listing_reviews.status end,
      resolved_at = case when public.catalog_listing_reviews.status = 'rejected'
                              and public.catalog_listing_reviews.content_hash <> excluded.content_hash
                         then null else public.catalog_listing_reviews.resolved_at end,
      content_hash = case when public.catalog_listing_reviews.status in ('open', 'rejected')
                          then excluded.content_hash else public.catalog_listing_reviews.content_hash end,
      last_seen_at = now()
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.sor_operator_resolve_catalog_review(
  p_operator uuid, p_review_id uuid, p_action text, p_product_id uuid default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.catalog_listing_reviews;
  v_result jsonb;
  v_product uuid;
begin
  if not exists (select 1 from public.platform_operators o where o.user_id = p_operator) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_action not in ('create', 'attach', 'reject') then
    raise exception 'VALIDATION_ERROR: action' using errcode = '22023';
  end if;
  if p_action = 'reject' and coalesce(trim(p_note), '') = '' then
    raise exception 'VALIDATION_ERROR: note' using errcode = '22023';
  end if;
  select * into v_review from public.catalog_listing_reviews r where r.id = p_review_id for update;
  if v_review.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_review.status <> 'open' then
    raise exception 'INVALID_STATE: review already resolved' using errcode = '55000';
  end if;

  if p_action = 'create' then
    -- An app store, code host or social profile is not an official product site.
    if v_review.reason = 'shared_host_website' then
      raise exception 'INVALID_STATE: no product from a shared host' using errcode = '55000';
    end if;
    v_result := public.sor_ingest_catalog_listing(v_review.listing, '{"outcome":"new","rule":"operator"}'::jsonb,
                                                  v_review.exclusion);
    v_product := (v_result ->> 'product_id')::uuid;
  elsif p_action = 'attach' then
    if p_product_id is null or not exists (select 1 from public.saas_products p where p.id = p_product_id) then
      raise exception 'VALIDATION_ERROR: product' using errcode = '22023';
    end if;
    v_result := public.sor_ingest_catalog_listing(
      v_review.listing,
      jsonb_build_object('outcome', 'matched_existing', 'product_id', p_product_id, 'rule', 'operator'),
      v_review.exclusion);
    v_product := (v_result ->> 'product_id')::uuid;
  end if;

  update public.catalog_listing_reviews
     set status = case p_action when 'create' then 'created' when 'attach' then 'attached' else 'rejected' end,
         resolved_product_id = v_product,
         resolved_by = p_operator,
         resolution_note = nullif(trim(p_note), ''),
         resolved_at = now()
   where id = p_review_id;
  insert into public.audit_logs (actor_user_id, actor_kind, action, resource_type, resource_id, metadata)
    values (p_operator, 'platform_operator', 'catalog.listing_review_resolution', 'catalog_listing_review',
            p_review_id, jsonb_build_object('action', p_action, 'product_id', v_product,
                                            'reason', v_review.reason, 'note', nullif(trim(p_note), '')));
  return jsonb_build_object('status', p_action, 'product_id', v_product);
end;
$$;

revoke all on function public.sor_catalog_record_review(jsonb, jsonb, text, uuid[]) from public, anon, authenticated;
revoke all on function public.sor_operator_resolve_catalog_review(uuid, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.sor_catalog_record_review(jsonb, jsonb, text, uuid[]) to service_role;
grant execute on function public.sor_operator_resolve_catalog_review(uuid, uuid, text, uuid, text) to service_role;
