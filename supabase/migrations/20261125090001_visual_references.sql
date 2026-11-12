-- S8.5 — Visual references (PD-38, amendment of ADR-016; product-owner
-- decision of 12 November 2026).
--
-- Besides operator-admitted private copies (rights documented case by case),
-- two automatic kinds of product visuals, displayed BY REFERENCE (the browser
-- loads the image from its origin; SOR stores no copy: the free plan's 500 MB
-- database cannot hold thousands of images, and nothing is reproduced):
--   * licensed_image: the Wikidata image of the product (P18) hosted on
--     Wikimedia Commons under a free licence (CC0, public domain, CC BY,
--     CC BY-SA), with its licence and the attribution it requires;
--   * publisher_share_image: the link-preview image (og:image / twitter:image)
--     the publisher declares on its own official site. Not a licence: labelled
--     as such, taken only from the product's official domain, removable at once.
-- Precedence on a card: operator-approved copy > free licence > publisher
-- share image. Collection runs in a workflow (docs/DATA_SOURCES.md); the
-- service-role RPC below records one reference with its evidence.

-- ------------------------------------------------------------ source
insert into public.sources (source_key, name, source_type, access_method, base_url, terms_url,
                            terms_reviewed_at, terms_review_notes, integration_status, default_reliability_level,
                            rate_limit_per_minute, quota_per_day, is_enabled, storage_policy)
values
  ('wikimedia_commons', 'Wikimedia Commons', 'other', 'official_api', 'https://commons.wikimedia.org/w/api.php',
   'https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia', '2026-11-12 18:00:00+00',
   'Media files under free licences; reuse allowed under each file''s licence (attribution, and share-alike for CC BY-SA). Licence, author and file page read from the official API (imageinfo extmetadata) and shown with the image; only CC0, public domain, CC BY and CC BY-SA are accepted. Images are displayed by reference (no copy stored).',
   'integrated', 3, 30, null, true, 'metadata_only')
on conflict (source_key) do nothing;

-- ------------------------------------------------------------ vocabulary
do $$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.product_visual_assets'::regclass
       and con.contype = 'c'
       and (pg_get_constraintdef(con.oid) like '%asset_type = ANY%'
            or pg_get_constraintdef(con.oid) like '%rights_status = ANY%'
            or pg_get_constraintdef(con.oid) like '%delivery_mode%')
  loop
    execute format('alter table public.product_visual_assets drop constraint %I', c.conname);
  end loop;
end
$$;

alter table public.product_visual_assets
  add column licence_code text check (licence_code is null or licence_code ~ '^[A-Za-z0-9.+-]{2,40}$'),
  add column licence_url text check (licence_url is null or licence_url ~* '^https?://'),
  add column attribution text check (attribution is null or length(attribution) between 1 and 500);

alter table public.product_visual_assets
  add constraint product_visual_assets_asset_type_check
    check (asset_type in ('official_hero','product_screenshot','official_illustration',
                          'licensed_image','publisher_share_image')),
  add constraint product_visual_assets_rights_status_check
    check (rights_status in ('approved','licensed','publisher_published','unknown','restricted','removed')),
  add constraint product_visual_assets_delivery_mode_check
    check (delivery_mode in ('private_copy','external_reference')),
  -- Each kind keeps its own rules: a reference is never presented as an
  -- operator-approved copy, and a free-licence image always carries its licence.
  add constraint product_visual_asset_kind_rules check (
    (delivery_mode = 'private_copy'
       and asset_type in ('official_hero','product_screenshot','official_illustration')
       and rights_status not in ('licensed','publisher_published'))
    or (delivery_mode = 'external_reference' and delivery_path is null and (
         (asset_type = 'licensed_image' and rights_status in ('licensed','removed')
            and licence_code is not null and licence_url is not null)
      or (asset_type = 'publisher_share_image' and rights_status in ('publisher_published','removed')))));

-- One primary visual per product, whatever its kind.
create unique index product_visual_asset_one_primary
  on public.product_visual_assets(product_id) where is_current and is_primary;

-- ------------------------------------------------------------ evidence trigger
-- Same rules; verified evidence is required for an operator-approved copy
-- only (a reference rests on declared evidence: the Commons file page or the
-- publisher's own page).
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
    if (to_jsonb(new) ->> 'rights_status') = 'approved' and v_verification_status <> 'verified' then
      raise exception 'VISUAL_ASSET_REQUIRES_VERIFIED_EVIDENCE' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.check_product_discover_evidence() from public, anon, authenticated;

-- ------------------------------------------------------------ read policy
drop policy product_visual_assets_read on public.product_visual_assets;
create policy product_visual_assets_read on public.product_visual_assets
  for select to authenticated using (
    is_current
    and ((rights_status = 'approved' and verification_status = 'verified')
         or rights_status in ('licensed','publisher_published'))
    and private.is_visible_product(product_id)
    and private.is_visible_evidence(evidence_id)
  );

-- ------------------------------------------------------------ record a reference
-- p_ref keys: kind (licensed | publisher), listing_source_key,
-- listing_external_id (the catalog listing the visual belongs to), image_url,
-- page_url (Commons file page, or the official page that declares the image),
-- content_hash (of the bytes checked at collection, or the Commons SHA-1),
-- content_type, width, height, alt_text, observed_at; licensed only:
-- licence_code, licence_url, attribution. Expected refusals return a status
-- (no_product, not_visible, domain_mismatch) so a batch continues; malformed
-- input raises VALIDATION_ERROR.
create or replace function public.sor_record_visual_reference(p_ref jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_kind text := p_ref ->> 'kind';
  v_image text := btrim(coalesce(p_ref ->> 'image_url', ''));
  v_page text := btrim(coalesce(p_ref ->> 'page_url', ''));
  v_hash text := lower(btrim(coalesce(p_ref ->> 'content_hash', '')));
  v_alt text := btrim(coalesce(p_ref ->> 'alt_text', ''));
  v_width integer;
  v_height integer;
  v_observed timestamptz;
  v_licence text := nullif(btrim(coalesce(p_ref ->> 'licence_code', '')), '');
  v_licence_url text := nullif(btrim(coalesce(p_ref ->> 'licence_url', '')), '');
  v_attribution text := nullif(btrim(coalesce(p_ref ->> 'attribution', '')), '');
  v_product uuid;
  v_domain text;
  v_host text;
  v_source public.sources;
  v_existing uuid;
  v_record uuid;
  v_snapshot uuid;
  v_evidence uuid;
  v_id uuid := gen_random_uuid();
  v_asset_type text;
  v_status text;
  v_rank integer;
  v_best integer;
  v_primary boolean;
begin
  begin
    v_width := (p_ref ->> 'width')::integer;
    v_height := (p_ref ->> 'height')::integer;
    v_observed := coalesce((p_ref ->> 'observed_at')::timestamptz, now());
  exception when others then
    raise exception 'VALIDATION_ERROR: visual reference' using errcode = '22023';
  end;
  if not coalesce(v_kind in ('licensed', 'publisher')
     and v_image ~* '^https://[a-z0-9.-]+(:[0-9]+)?/\S+$' and length(v_image) <= 2000
     and v_page ~* '^https://[a-z0-9.-]+(:[0-9]+)?(/\S*)?$' and length(v_page) <= 2000
     and v_hash ~ '^[0-9a-f]{16,128}$'
     and length(v_alt) between 1 and 500
     and v_width between 1 and 20000 and v_height between 1 and 20000
     and v_observed <= now() + interval '1 minute', false) then
    raise exception 'VALIDATION_ERROR: visual reference' using errcode = '22023';
  end if;
  if v_kind = 'licensed' then
    if not coalesce(v_image ~* '^https://upload\.wikimedia\.org/'
       and v_page ~* '^https://commons\.wikimedia\.org/'
       and v_licence ~ '^(CC0-1\.0|Public-Domain|CC-BY(-SA)?-(1\.0|2\.0|2\.5|3\.0|4\.0))$'
       and v_licence_url ~* '^https?://'
       and (v_attribution is not null or v_licence in ('CC0-1.0', 'Public-Domain')), false) then
      raise exception 'VALIDATION_ERROR: free licence required' using errcode = '22023';
    end if;
  else
    -- A share image is the publisher's declaration: no licence is implied.
    v_licence := null;
    v_licence_url := null;
    v_attribution := null;
  end if;

  select i.product_id into v_product
    from public.entity_identifiers i
    join public.sources s on s.id = i.source_id
   where s.source_key = p_ref ->> 'listing_source_key'
     and i.identifier_type = 'external_id'
     and i.value_normalized = p_ref ->> 'listing_external_id'
     and i.product_id is not null and i.valid_to is null
   limit 1;
  if v_product is null then
    return jsonb_build_object('status', 'no_product');
  end if;
  if not private.is_visible_product(v_product) then
    return jsonb_build_object('status', 'not_visible', 'product_id', v_product);
  end if;
  if v_kind = 'publisher' then
    -- Only from the product's own site (or a subdomain of it).
    select lower(p.primary_domain) into v_domain from public.saas_products p where p.id = v_product;
    v_host := lower(substring(v_page from '^https://([^/:?#]+)'));
    if v_domain is null or v_domain = '' or not (v_host = v_domain or v_host like '%.' || v_domain) then
      return jsonb_build_object('status', 'domain_mismatch', 'product_id', v_product);
    end if;
  end if;

  v_asset_type := case v_kind when 'licensed' then 'licensed_image' else 'publisher_share_image' end;
  v_status := case v_kind when 'licensed' then 'licensed' else 'publisher_published' end;
  v_rank := case v_kind when 'licensed' then 2 else 1 end;

  -- Replay: same image, same bytes.
  select a.id into v_existing from public.product_visual_assets a
   where a.product_id = v_product and a.is_current and a.asset_type = v_asset_type
     and a.source_url = v_image and a.content_hash = v_hash;
  if v_existing is not null then
    update public.product_visual_assets set last_checked_at = now(), last_check_status = 'unchanged'
     where id = v_existing;
    return jsonb_build_object('status', 'existing', 'asset_id', v_existing, 'product_id', v_product);
  end if;

  select * into v_source from public.sources s
   where s.source_key = case v_kind when 'licensed' then 'wikimedia_commons' else 'official_website' end;
  if v_source.id is null or not v_source.is_enabled or v_source.integration_status <> 'integrated' then
    raise exception 'INVALID_STATE: source not enabled' using errcode = '55000';
  end if;

  -- A newer reference of the same kind replaces the previous one (history kept).
  update public.product_visual_assets
     set is_current = false, is_primary = false, last_checked_at = now(), last_check_status = 'changed'
   where product_id = v_product and is_current and asset_type = v_asset_type;

  insert into public.source_records (source_id, canonical_url, title)
    values (v_source.id, v_page, left('Visual: ' || v_alt, 500))
    on conflict (source_id, canonical_url) do update set title = coalesce(public.source_records.title, excluded.title)
    returning id into v_record;
  insert into public.source_snapshots (source_record_id, content_hash, fetch_status, retrieved_at,
                                       last_retrieved_at, storage_status, extracted_metadata, extraction_status)
    values (v_record, v_hash, 'ok', v_observed, v_observed, 'reference_only',
            jsonb_build_object('purpose', 'visual_reference', 'kind', v_kind, 'image_url', v_image,
                               'content_type', p_ref ->> 'content_type', 'width', v_width, 'height', v_height,
                               'licence_code', v_licence, 'licence_url', v_licence_url,
                               'attribution', v_attribution),
            'completed')
    on conflict (source_record_id, content_hash)
      do update set last_retrieved_at = greatest(public.source_snapshots.last_retrieved_at, excluded.last_retrieved_at)
    returning id into v_snapshot;
  insert into public.evidence_items (product_id, source_snapshot_id, claim_type, claim_text, claim_value,
                                     evidence_type, fact_status, reliability_level, verification_status,
                                     observed_at, extraction_method)
    values (v_product, v_snapshot, 'visual_asset', left(v_alt, 1000),
            jsonb_build_object('kind', v_kind, 'image_url', v_image, 'content_hash', v_hash,
                               'licence_code', v_licence, 'attribution', v_attribution),
            case v_kind when 'licensed' then 'third_party_report' else 'official_statement' end::public.evidence_type,
            'declared', case v_kind when 'licensed' then 3 else 2 end, 'unverified', v_observed,
            'structured_parse')
    returning id into v_evidence;

  select max(case a.rights_status when 'approved' then 3 when 'licensed' then 2
                                  when 'publisher_published' then 1 else 0 end)
    into v_best from public.product_visual_assets a
   where a.product_id = v_product and a.is_current and a.is_primary;
  v_primary := coalesce(v_best, 0) < v_rank;
  if v_primary then
    update public.product_visual_assets set is_primary = false where product_id = v_product and is_primary;
  end if;

  insert into public.product_visual_assets (id, product_id, asset_type, source_url, delivery_path, content_hash,
                                            alt_text, rights_basis, rights_status, verification_status,
                                            evidence_id, observed_at, is_primary, is_current, rights_evidence_url,
                                            width, height, last_checked_at, last_check_status, delivery_mode,
                                            licence_code, licence_url, attribution)
    values (v_id, v_product, v_asset_type, v_image, null, v_hash, v_alt,
            case v_kind
              when 'licensed' then left(format('%s, %s (Wikimedia Commons)', v_licence,
                                               coalesce(v_attribution, 'sans attribution requise')), 1000)
              else 'Image de partage publiée par l''éditeur sur son site officiel (aperçu de lien, PD-38) : pas de licence vérifiée'
            end,
            v_status, 'unverified', v_evidence, v_observed, v_primary, true, v_page,
            v_width, v_height, now(), 'unchanged', 'external_reference',
            v_licence, v_licence_url, v_attribution);
  insert into public.audit_logs (actor_kind, action, resource_type, resource_id, metadata)
    values ('worker', 'catalog.visual_reference_recorded', 'product_visual_asset', v_id,
            jsonb_build_object('product_id', v_product, 'kind', v_kind, 'image_url', v_image,
                               'page_url', v_page, 'licence_code', v_licence, 'primary', v_primary));
  return jsonb_build_object('status', 'created', 'asset_id', v_id, 'product_id', v_product, 'primary', v_primary);
end;
$$;
revoke all on function public.sor_record_visual_reference(jsonb) from public, anon, authenticated;
grant execute on function public.sor_record_visual_reference(jsonb) to service_role;

-- ------------------------------------------------------------ Discover DTO
-- Same signature. The visual is the best current primary one: an approved
-- private copy (SOR delivery path), else a free-licence image, else the
-- publisher's share image (both by reference: their https image URL). The
-- kind, licence and attribution travel with it so the card states them.
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
      'asset_type',a.asset_type,
      'url',case a.delivery_mode when 'private_copy' then a.delivery_path else a.source_url end,
      'alt_text',a.alt_text,
      'source_url',sr.canonical_url,'observed_at',a.observed_at,
      'rights_basis',a.rights_basis,'confidence',a.confidence,
      'width',a.width,'height',a.height,
      'delivery_mode',a.delivery_mode,'rights_status',a.rights_status,
      'licence_code',a.licence_code,'licence_url',a.licence_url,'attribution',a.attribution
    ) from public.product_visual_assets a
      join public.evidence_items e on e.id=a.evidence_id
      join public.source_snapshots ss on ss.id=e.source_snapshot_id
      join public.source_records sr on sr.id=ss.source_record_id
      where a.product_id=p.id and a.is_current and a.is_primary
        and ((a.rights_status='approved' and a.verification_status='verified'
              and a.delivery_mode='private_copy' and a.delivery_path is not null)
             or (a.rights_status in ('licensed','publisher_published')
                 and a.delivery_mode='external_reference'))
        and private.is_visible_evidence(e.id)
      order by case a.rights_status when 'approved' then 3 when 'licensed' then 2 else 1 end desc,
               a.observed_at desc
      limit 1)
  from public.saas_products p where p.id=any(p_product_ids)
    and private.is_visible_product(p.id);
end;
$$;
