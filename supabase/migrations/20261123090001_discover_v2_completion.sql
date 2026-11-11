-- S8.3 — Discover V2 completion (ADR-016 / PD-36, ADR-017 / PD-37).
--
-- 1. Acquisition Channels: an audited operator path records a channel with
--    its evidence (manual_entry source, the page the operator cites), the
--    primacy excerpt a primary role needs, and the deterministic confidence
--    computed by @sor/domain (chanconf-1) with its reasons; retraction keeps
--    history.
-- 2. Product visuals: a private copy (server-only table, never a public
--    bucket) admitted only when the documented rights cover copying and
--    private storage; delivered by an authenticated route; removal deletes
--    the bytes and hides the asset at once; revalidation hides an asset whose
--    source changed or disappeared.
-- 3. Discover sort `least_analyzed` (fewest analyses of the product in the
--    workspace, then the most recently added) on real workspace data.
-- No connector, source or collection is enabled by this migration.

alter type public.claim_type add value if not exists 'acquisition_channel';
alter type public.claim_type add value if not exists 'visual_asset';

-- ------------------------------------------------------------ Acquisition Channels
alter table public.product_acquisition_channels
  add column role_rationale text check (role_rationale is null or length(role_rationale) between 1 and 1000),
  add column confidence_method text check (confidence_method is null or confidence_method ~ '^[a-z0-9_-]{1,40}$'),
  add column confidence_reasons jsonb not null default '[]'::jsonb
    check (jsonb_typeof(confidence_reasons) = 'array'),
  add column recorded_by uuid references auth.users(id) on delete set null,
  add column retracted_at timestamptz,
  add column retraction_reason text check (retraction_reason is null or length(retraction_reason) between 1 and 1000);
-- A primary role needs evidence of primacy (ADR-017 §3). NOT VALID: rows
-- written before S8.3 are not rewritten; every new write is checked.
alter table public.product_acquisition_channels
  add constraint product_acquisition_channel_primary_rationale
    check (role <> 'primary' or nullif(btrim(role_rationale), '') is not null) not valid,
  add constraint product_acquisition_channel_retraction
    check (retracted_at is null or (not is_current and retraction_reason is not null));

-- ------------------------------------------------------------ Product visuals
alter table public.product_visual_assets
  add column rights_evidence_url text check (rights_evidence_url is null or rights_evidence_url ~* '^https://'),
  add column delivery_mode text not null default 'private_copy' check (delivery_mode = 'private_copy'),
  add column width integer check (width is null or width between 1 and 20000),
  add column height integer check (height is null or height between 1 and 20000),
  add column admitted_by uuid references auth.users(id) on delete set null,
  add column removed_at timestamptz,
  add column removal_reason text check (removal_reason is null or length(removal_reason) between 1 and 1000),
  add column last_checked_at timestamptz,
  add column last_check_status text
    check (last_check_status is null or last_check_status in ('unchanged','changed','unavailable','refused'));
alter table public.product_visual_assets
  add constraint product_visual_asset_rights_evidence
    check (rights_status <> 'approved' or rights_evidence_url is not null) not valid,
  add constraint product_visual_asset_removed
    check (rights_status <> 'removed' or (not is_current and not is_primary and removed_at is not null));
create unique index product_visual_asset_current_hash
  on public.product_visual_assets(product_id, content_hash) where is_current;

-- Private copy of an admitted visual. Server-only: no browser grant, no
-- policy; the delivery route reads it with the service role after the
-- browser's own RLS read of product_visual_assets succeeded.
create table public.product_visual_asset_files (
  asset_id uuid primary key references public.product_visual_assets(id) on delete cascade,
  content_type text not null check (content_type in ('image/png','image/jpeg','image/webp')),
  byte_size integer not null check (byte_size between 1 and 2097152),
  content bytea not null check (octet_length(content) = byte_size),
  created_at timestamptz not null default now()
);
alter table public.product_visual_asset_files enable row level security;
revoke all on table public.product_visual_asset_files from public, anon, authenticated;
grant all on table public.product_visual_asset_files to service_role;

-- ------------------------------------------------------------ evidence trigger fix
-- The trigger of 20261115090001 read NEW.fact_status in a condition also evaluated for
-- product_visual_assets, which has no such column: every visual insert failed
-- ("record new has no field fact_status"). Same rules, one branch per table.
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
  if tg_table_name = 'product_acquisition_channels' then
    if v_fact_status is distinct from (to_jsonb(new) ->> 'fact_status')::public.fact_status then
      raise exception 'EVIDENCE_STATUS_MISMATCH' using errcode = '23514';
    end if;
    if (to_jsonb(new) ->> 'fact_status') = 'confirmed' and v_verification_status <> 'verified' then
      raise exception 'CONFIRMED_CHANNEL_REQUIRES_VERIFIED_EVIDENCE' using errcode = '23514';
    end if;
  elsif tg_table_name = 'product_visual_assets' then
    if v_verification_status <> 'verified' then
      raise exception 'VISUAL_ASSET_REQUIRES_VERIFIED_EVIDENCE' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.check_product_discover_evidence() from public, anon, authenticated;

-- ------------------------------------------------------------ helpers
create or replace function private.assert_platform_operator(p_operator uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_operator is null or not exists (
    select 1 from public.platform_operators o where o.user_id = p_operator
  ) then
    raise exception 'FORBIDDEN: platform operator required' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.assert_platform_operator(uuid) from public, anon, authenticated;

-- One manual_entry snapshot of a page cited by the operator (SOR did not
-- fetch it). Replay-safe on (record, content hash).
create or replace function private.operator_cited_snapshot(
  p_url text, p_title text, p_hash text, p_observed_at timestamptz, p_storage public.content_storage_status,
  p_metadata jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_source uuid;
  v_record uuid;
  v_snapshot uuid;
begin
  select s.id into v_source from public.sources s
   where s.source_key = 'manual_entry' and s.is_enabled and s.integration_status = 'integrated';
  if v_source is null then
    raise exception 'VALIDATION_ERROR: manual_entry source not integrated' using errcode = '22023';
  end if;
  insert into public.source_records (source_id, canonical_url, title)
    values (v_source, p_url, left(p_title, 500))
    on conflict (source_id, canonical_url) do update set title = coalesce(excluded.title, public.source_records.title)
    returning id into v_record;
  insert into public.source_snapshots (source_record_id, content_hash, fetch_status, retrieved_at,
                                       last_retrieved_at, storage_status, extracted_metadata, extraction_status)
    values (v_record, p_hash, 'ok', p_observed_at, p_observed_at, p_storage, coalesce(p_metadata, '{}'::jsonb),
            'not_applicable')
    on conflict (source_record_id, content_hash)
      do update set last_retrieved_at = greatest(public.source_snapshots.last_retrieved_at, excluded.last_retrieved_at)
    returning id into v_snapshot;
  return v_snapshot;
end;
$$;
revoke all on function private.operator_cited_snapshot(text, text, text, timestamptz, public.content_storage_status, jsonb)
  from public, anon, authenticated;

-- ------------------------------------------------------------ record a channel
-- p_claim keys: channel_key, channel_category, role, status, evidence_kind
-- (official_statement | third_party_report | inference), verified, source_url,
-- excerpt, observed_at, rationale, role_rationale, confidence,
-- confidence_method, confidence_reasons. The caller (operator API) has already
-- normalized the key and computed the confidence with @sor/domain; the rules
-- are checked again here.
create or replace function public.sor_operator_record_acquisition_channel(
  p_operator uuid, p_product_id uuid, p_claim jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_key text := p_claim ->> 'channel_key';
  v_category text := p_claim ->> 'channel_category';
  v_role text := p_claim ->> 'role';
  v_status text := p_claim ->> 'status';
  v_kind text := p_claim ->> 'evidence_kind';
  v_verified boolean := coalesce((p_claim ->> 'verified')::boolean, false);
  v_url text := p_claim ->> 'source_url';
  v_excerpt text := btrim(coalesce(p_claim ->> 'excerpt', ''));
  v_observed timestamptz := coalesce((p_claim ->> 'observed_at')::timestamptz, now());
  v_rationale text := nullif(btrim(coalesce(p_claim ->> 'rationale', '')), '');
  v_role_rationale text := nullif(btrim(coalesce(p_claim ->> 'role_rationale', '')), '');
  v_confidence numeric := (p_claim ->> 'confidence')::numeric;
  v_snapshot uuid;
  v_evidence uuid;
  v_channel uuid;
begin
  perform private.assert_platform_operator(p_operator);
  if not private.is_visible_product(p_product_id) then
    raise exception 'VALIDATION_ERROR: product not visible' using errcode = '22023';
  end if;
  if not coalesce(v_key ~ '^[a-z][a-z0-9_]{0,59}$' and v_key <> 'unknown'
     and v_category in ('organic','community','content_search','social','partnership','paid','other')
     and v_role in ('primary','secondary')
     and v_status in ('confirmed','declared','estimated')
     and v_kind in ('official_statement','third_party_report','inference')
     and v_url ~* '^https://'
     and length(v_excerpt) between 1 and 2000
     and v_observed <= now() + interval '1 minute'
     and v_confidence between 0 and 100, false) then
    raise exception 'VALIDATION_ERROR: invalid channel claim' using errcode = '22023';
  end if;
  if v_status = 'confirmed' and (not v_verified or v_kind = 'inference') then
    raise exception 'VALIDATION_ERROR: confirmed requires verified direct evidence' using errcode = '22023';
  end if;
  if v_status = 'declared' and v_kind = 'inference' then
    raise exception 'VALIDATION_ERROR: a declaration is not an inference' using errcode = '22023';
  end if;
  if v_status = 'estimated' and (v_kind <> 'inference' or v_rationale is null) then
    raise exception 'VALIDATION_ERROR: an estimate needs its method and indices' using errcode = '22023';
  end if;
  if v_role = 'primary' and v_role_rationale is null then
    raise exception 'VALIDATION_ERROR: primary needs evidence of primacy' using errcode = '22023';
  end if;
  if v_role = 'primary' and exists (
    select 1 from public.product_acquisition_channels c
    where c.product_id = p_product_id and c.is_current and c.role = 'primary' and c.channel_key <> v_key
  ) then
    raise exception 'PRIMARY_EXISTS: retract the current primary channel first' using errcode = '55000';
  end if;

  v_snapshot := private.operator_cited_snapshot(
    v_url, 'Acquisition channel: ' || v_key,
    encode(pg_catalog.sha256(convert_to(v_url || '|' || v_key || '|' || v_excerpt || '|' || v_observed::text, 'UTF8')), 'hex'),
    v_observed, 'stored_excerpt',
    jsonb_build_object('recorded_by', 'platform_operator', 'fetched_by_sor', false, 'purpose', 'acquisition_channel'));
  insert into public.evidence_items (product_id, source_snapshot_id, claim_type, claim_text, claim_value,
                                     evidence_type, fact_status, reliability_level, confidence,
                                     verification_status, verified_at, observed_at, extraction_method)
    values (p_product_id, v_snapshot, 'acquisition_channel', v_excerpt,
            jsonb_build_object('channel_key', v_key, 'role', v_role, 'role_rationale', v_role_rationale,
                               'rationale', v_rationale),
            v_kind::public.evidence_type, v_status::public.fact_status,
            case v_kind when 'official_statement' then 2 when 'third_party_report' then 3 else 4 end,
            v_confidence,
            case when v_verified then 'verified' else 'unverified' end::public.verification_status,
            case when v_verified then now() end, v_observed, 'manual_entry')
    returning id into v_evidence;

  update public.product_acquisition_channels c set is_current = false
   where c.product_id = p_product_id and c.channel_key = v_key and c.is_current;
  insert into public.product_acquisition_channels (product_id, channel_key, channel_category, role, fact_status,
                                                   confidence, method, inference_rationale, evidence_id,
                                                   observed_at, role_rationale, confidence_method,
                                                   confidence_reasons, recorded_by)
    values (p_product_id, v_key, v_category, v_role, v_status::public.fact_status, v_confidence,
            'operator_' || v_kind, v_rationale, v_evidence, v_observed, v_role_rationale,
            p_claim ->> 'confidence_method', coalesce(p_claim -> 'confidence_reasons', '[]'::jsonb), p_operator)
    returning id into v_channel;
  insert into public.audit_logs (actor_user_id, actor_kind, action, resource_type, resource_id, metadata)
    values (p_operator, 'platform_operator', 'catalog.acquisition_channel_recorded', 'product_acquisition_channel',
            v_channel, jsonb_build_object('product_id', p_product_id, 'channel_key', v_key, 'role', v_role,
                                          'status', v_status, 'evidence_id', v_evidence, 'source_url', v_url));
  return v_channel;
end;
$$;

create or replace function public.sor_operator_retract_acquisition_channel(
  p_operator uuid, p_channel_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_row public.product_acquisition_channels;
begin
  perform private.assert_platform_operator(p_operator);
  if nullif(btrim(coalesce(p_reason, '')), '') is null or length(p_reason) > 1000 then
    raise exception 'VALIDATION_ERROR: a retraction needs a reason' using errcode = '22023';
  end if;
  select * into v_row from public.product_acquisition_channels where id = p_channel_id for update;
  if v_row.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if not v_row.is_current then
    raise exception 'CONFLICT: channel is not current' using errcode = '55000';
  end if;
  update public.product_acquisition_channels
     set is_current = false, retracted_at = now(), retraction_reason = btrim(p_reason)
   where id = p_channel_id;
  insert into public.audit_logs (actor_user_id, actor_kind, action, resource_type, resource_id, metadata)
    values (p_operator, 'platform_operator', 'catalog.acquisition_channel_retracted', 'product_acquisition_channel',
            p_channel_id, jsonb_build_object('product_id', v_row.product_id, 'channel_key', v_row.channel_key,
                                             'reason', btrim(p_reason)));
end;
$$;

-- ------------------------------------------------------------ admit a visual
-- p_asset keys: asset_type, image_url, page_url, alt_text, rights_basis,
-- rights_evidence_url, covers_private_copy, content_type, width, height,
-- observed_at, primary. The bytes were fetched by the worker's SSRF-safe
-- fetcher and checked by @sor/domain (format, size, shape); the hash is
-- recomputed here.
create or replace function public.sor_admit_visual_asset(
  p_operator uuid, p_product_id uuid, p_asset jsonb, p_content bytea)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_hash text;
  v_existing uuid;
  v_type text := p_asset ->> 'asset_type';
  v_content_type text := p_asset ->> 'content_type';
  v_page text := p_asset ->> 'page_url';
  v_image text := p_asset ->> 'image_url';
  v_observed timestamptz := coalesce((p_asset ->> 'observed_at')::timestamptz, now());
  v_primary boolean := coalesce((p_asset ->> 'primary')::boolean, true);
  v_snapshot uuid;
  v_evidence uuid;
begin
  perform private.assert_platform_operator(p_operator);
  if not private.is_visible_product(p_product_id) then
    raise exception 'VALIDATION_ERROR: product not visible' using errcode = '22023';
  end if;
  -- Rights first: nothing is stored unless they cover a private copy.
  if coalesce((p_asset ->> 'covers_private_copy')::boolean, false) is not true
     or nullif(btrim(coalesce(p_asset ->> 'rights_basis', '')), '') is null
     or coalesce(p_asset ->> 'rights_evidence_url', '') !~* '^https://' then
    raise exception 'RIGHTS_NOT_ESTABLISHED: documented rights must cover a private copy' using errcode = '22023';
  end if;
  if not coalesce(v_type in ('official_hero','product_screenshot','official_illustration')
     and v_content_type in ('image/png','image/jpeg','image/webp')
     and octet_length(p_content) between 1 and 2097152
     and v_page ~* '^https://' and v_image ~* '^https://'
     and length(btrim(p_asset ->> 'alt_text')) between 1 and 500
     and (p_asset ->> 'width')::integer between 1 and 20000
     and (p_asset ->> 'height')::integer between 1 and 20000
     and v_observed <= now() + interval '1 minute', false) then
    raise exception 'VALIDATION_ERROR: invalid visual asset' using errcode = '22023';
  end if;
  v_hash := encode(pg_catalog.sha256(p_content), 'hex');
  select a.id into v_existing from public.product_visual_assets a
   where a.product_id = p_product_id and a.content_hash = v_hash and a.is_current;
  if v_existing is not null then
    return jsonb_build_object('asset_id', v_existing, 'status', 'existing');
  end if;

  v_snapshot := private.operator_cited_snapshot(
    v_page, 'Product visual', v_hash, v_observed, 'reference_only',
    jsonb_build_object('recorded_by', 'platform_operator', 'purpose', 'visual_asset', 'image_url', v_image,
                       'rights_evidence_url', p_asset ->> 'rights_evidence_url'));
  insert into public.evidence_items (product_id, source_snapshot_id, claim_type, claim_text, claim_value,
                                     evidence_type, fact_status, reliability_level, verification_status,
                                     verified_at, observed_at, extraction_method)
    values (p_product_id, v_snapshot, 'visual_asset', p_asset ->> 'alt_text',
            jsonb_build_object('asset_type', v_type, 'image_url', v_image, 'content_hash', v_hash),
            'official_statement', 'confirmed', 2, 'verified', now(), v_observed, 'manual_entry')
    returning id into v_evidence;

  if v_primary then
    update public.product_visual_assets set is_primary = false
     where product_id = p_product_id and is_primary;
  end if;
  insert into public.product_visual_assets (id, product_id, asset_type, source_url, delivery_path, content_hash,
                                            alt_text, rights_basis, rights_status, verification_status,
                                            evidence_id, observed_at, is_primary, is_current, rights_evidence_url,
                                            width, height, admitted_by, last_checked_at, last_check_status)
    values (v_id, p_product_id, v_type, v_image, '/api/v1/catalog/assets/' || v_id, v_hash,
            p_asset ->> 'alt_text', btrim(p_asset ->> 'rights_basis'), 'approved', 'verified', v_evidence,
            v_observed, v_primary, true, p_asset ->> 'rights_evidence_url',
            (p_asset ->> 'width')::integer, (p_asset ->> 'height')::integer, p_operator, now(), 'unchanged');
  insert into public.product_visual_asset_files (asset_id, content_type, byte_size, content)
    values (v_id, v_content_type, octet_length(p_content), p_content);
  insert into public.audit_logs (actor_user_id, actor_kind, action, resource_type, resource_id, metadata)
    values (p_operator, 'platform_operator', 'catalog.visual_asset_admitted', 'product_visual_asset', v_id,
            jsonb_build_object('product_id', p_product_id, 'asset_type', v_type, 'image_url', v_image,
                               'page_url', v_page, 'rights_evidence_url', p_asset ->> 'rights_evidence_url',
                               'content_hash', v_hash));
  return jsonb_build_object('asset_id', v_id, 'status', 'created');
end;
$$;

-- Takedown or loss of rights: hidden at once, private copy deleted.
create or replace function public.sor_operator_remove_visual_asset(
  p_operator uuid, p_asset_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_row public.product_visual_assets;
begin
  perform private.assert_platform_operator(p_operator);
  if nullif(btrim(coalesce(p_reason, '')), '') is null or length(p_reason) > 1000 then
    raise exception 'VALIDATION_ERROR: a removal needs a reason' using errcode = '22023';
  end if;
  select * into v_row from public.product_visual_assets where id = p_asset_id for update;
  if v_row.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_row.rights_status = 'removed' then
    raise exception 'CONFLICT: asset already removed' using errcode = '55000';
  end if;
  update public.product_visual_assets
     set rights_status = 'removed', is_current = false, is_primary = false, removed_at = now(),
         removal_reason = btrim(p_reason)
   where id = p_asset_id;
  delete from public.product_visual_asset_files where asset_id = p_asset_id;
  insert into public.audit_logs (actor_user_id, actor_kind, action, resource_type, resource_id, metadata)
    values (p_operator, 'platform_operator', 'catalog.visual_asset_removed', 'product_visual_asset', p_asset_id,
            jsonb_build_object('product_id', v_row.product_id, 'reason', btrim(p_reason)));
end;
$$;

-- Revalidation by the worker: an unchanged source keeps the asset; a changed,
-- unavailable or refused source hides it and deletes the private copy (the
-- operator re-admits the new visual if its rights still hold).
create or replace function public.sor_record_visual_asset_check(
  p_asset_id uuid, p_result text, p_content_hash text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_row public.product_visual_assets;
  v_result text := p_result;
begin
  if p_result not in ('unchanged','changed','unavailable','refused') then
    raise exception 'VALIDATION_ERROR: check result' using errcode = '22023';
  end if;
  select * into v_row from public.product_visual_assets where id = p_asset_id for update;
  if v_row.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if not v_row.is_current then
    raise exception 'CONFLICT: asset is not current' using errcode = '55000';
  end if;
  if v_result = 'unchanged' and p_content_hash is distinct from v_row.content_hash then
    v_result := 'changed';
  end if;
  if v_result = 'unchanged' then
    update public.product_visual_assets set last_checked_at = now(), last_check_status = 'unchanged'
     where id = p_asset_id;
  else
    update public.product_visual_assets
       set last_checked_at = now(), last_check_status = v_result, is_current = false, is_primary = false
     where id = p_asset_id;
    delete from public.product_visual_asset_files where asset_id = p_asset_id;
  end if;
  insert into public.audit_logs (actor_kind, action, resource_type, resource_id, metadata)
    values ('worker', 'catalog.visual_asset_checked', 'product_visual_asset', p_asset_id,
            jsonb_build_object('product_id', v_row.product_id, 'result', v_result));
  return v_result;
end;
$$;

revoke all on function public.sor_operator_record_acquisition_channel(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.sor_operator_retract_acquisition_channel(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.sor_admit_visual_asset(uuid, uuid, jsonb, bytea) from public, anon, authenticated;
revoke all on function public.sor_operator_remove_visual_asset(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.sor_record_visual_asset_check(uuid, text, text) from public, anon, authenticated;
grant execute on function public.sor_operator_record_acquisition_channel(uuid, uuid, jsonb) to service_role;
grant execute on function public.sor_operator_retract_acquisition_channel(uuid, uuid, text) to service_role;
grant execute on function public.sor_admit_visual_asset(uuid, uuid, jsonb, bytea) to service_role;
grant execute on function public.sor_operator_remove_visual_asset(uuid, uuid, text) to service_role;
grant execute on function public.sor_record_visual_asset_check(uuid, text, text) to service_role;

-- ------------------------------------------------------------ Discover DTO
-- Same signature; adds the primacy excerpt, the confidence method and reasons
-- of each channel, and the dimensions of the visual (layout without shift).
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
      'source_name',s.name,'evidence_id',e.id,
      'role_rationale',c.role_rationale,'inference_rationale',c.inference_rationale,
      'confidence_method',c.confidence_method,'confidence_reasons',c.confidence_reasons
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
      'rights_basis',a.rights_basis,'confidence',a.confidence,
      'width',a.width,'height',a.height
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

-- ------------------------------------------------------------ least_analyzed
-- Fewest opportunity analyses of the product in this workspace (as subject or
-- product-set member), then the most recently added. Real workspace data only.
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
revoke all on function public.catalog_search_v2(uuid,jsonb,text,integer,numeric,uuid,integer) from public,anon;
grant execute on function public.catalog_search_v2(uuid,jsonb,text,integer,numeric,uuid,integer) to authenticated;
