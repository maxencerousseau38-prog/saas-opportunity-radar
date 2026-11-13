-- Site visuals, follow-up of 20261126090001 (PD-40, visref-2), found while
-- loading the real snapshots locally:
-- 1. The same bytes can be both a product's share image and its site hero or
--    screenshot (one image per product and hash: product_visual_asset_current_hash).
--    The better-ranked kind now relabels the image; a lower-ranked kind never
--    downgrades it (replay returns "existing").
-- 2. Two listings of one product (Wikidata and Uneed) loaded concurrently
--    collided: one writer per product at a time (transaction advisory lock).
-- Same signature, same grants (service_role only).

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
  v_primary boolean;
  v_same uuid;
  v_same_rank integer;
begin
  begin
    v_width := (p_ref ->> 'width')::integer;
    v_height := (p_ref ->> 'height')::integer;
    v_observed := coalesce((p_ref ->> 'observed_at')::timestamptz, now());
  exception when others then
    raise exception 'VALIDATION_ERROR: visual reference' using errcode = '22023';
  end;
  if not coalesce(v_kind in ('site_hero', 'site_screenshot', 'licensed', 'publisher')
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
    -- A share image, a hero or a screenshot shown by the publisher on its own
    -- site: the publisher's declaration, no licence is implied.
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
  -- One writer per product at a time: two listings of the same product
  -- (Wikidata and Uneed) may be loaded concurrently.
  perform pg_advisory_xact_lock(hashtextextended('visual:' || v_product::text, 0));
  if v_kind <> 'licensed' then
    -- Only from the product's own site (or a subdomain of it).
    select lower(p.primary_domain) into v_domain from public.saas_products p where p.id = v_product;
    v_host := lower(substring(v_page from '^https://([^/:?#]+)'));
    if v_domain is null or v_domain = '' or not (v_host = v_domain or v_host like '%.' || v_domain) then
      return jsonb_build_object('status', 'domain_mismatch', 'product_id', v_product);
    end if;
  end if;

  v_asset_type := case v_kind when 'licensed' then 'licensed_image'
                               when 'site_hero' then 'official_hero'
                               when 'site_screenshot' then 'product_screenshot'
                               else 'publisher_share_image' end;
  v_status := case v_kind when 'licensed' then 'licensed' else 'publisher_published' end;

  -- Replay: same image, same bytes.
  select a.id into v_existing from public.product_visual_assets a
   where a.product_id = v_product and a.is_current and a.asset_type = v_asset_type
     and a.delivery_mode = 'external_reference'
     and a.source_url = v_image and a.content_hash = v_hash;
  if v_existing is not null then
    update public.product_visual_assets set last_checked_at = now(), last_check_status = 'unchanged'
     where id = v_existing;
    return jsonb_build_object('status', 'existing', 'asset_id', v_existing, 'product_id', v_product);
  end if;

  -- The same image already shown under another kind (a share image that is
  -- also the site's hero, a free-licence copy…): one row per image, with the
  -- better-ranked kind; a lower-ranked kind never relabels it.
  select a.id, private.visual_rank(a.rights_status, a.asset_type) into v_same, v_same_rank
    from public.product_visual_assets a
   where a.product_id = v_product and a.is_current and a.content_hash = v_hash
   limit 1;
  if v_same is not null then
    if v_same_rank >= private.visual_rank(v_status, v_asset_type) then
      update public.product_visual_assets set last_checked_at = now(), last_check_status = 'unchanged'
       where id = v_same;
      return jsonb_build_object('status', 'existing', 'asset_id', v_same, 'product_id', v_product);
    end if;
    update public.product_visual_assets
       set is_current = false, is_primary = false, last_checked_at = now(), last_check_status = 'changed'
     where id = v_same;
  end if;

  select * into v_source from public.sources s
   where s.source_key = case v_kind when 'licensed' then 'wikimedia_commons' else 'official_website' end;
  if v_source.id is null or not v_source.is_enabled or v_source.integration_status <> 'integrated' then
    raise exception 'INVALID_STATE: source not enabled' using errcode = '55000';
  end if;

  -- A newer reference of the same kind replaces the previous one (history
  -- kept). The site keeps one image per product, hero or screenshot. An
  -- operator-approved private copy is never replaced by a reference.
  update public.product_visual_assets
     set is_current = false, is_primary = false, last_checked_at = now(), last_check_status = 'changed'
   where product_id = v_product and is_current and delivery_mode = 'external_reference'
     and (asset_type = v_asset_type
          or (v_kind in ('site_hero', 'site_screenshot')
              and asset_type in ('official_hero', 'product_screenshot')));

  insert into public.source_records (source_id, canonical_url, title)
    values (v_source.id, v_page, left('Visual: ' || v_alt, 500))
    on conflict (source_id, canonical_url) do update set title = coalesce(public.source_records.title, excluded.title)
    returning id into v_record;
  insert into public.source_snapshots (source_record_id, content_hash, fetch_status, retrieved_at,
                                       last_retrieved_at, storage_status, extracted_metadata, extraction_status)
    values (v_record, v_hash, 'ok', v_observed, v_observed, 'reference_only',
            jsonb_build_object('purpose', 'visual_reference', 'kind', v_kind, 'image_url', v_image,
                               'rules_version', p_ref ->> 'rules_version',
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


  insert into public.product_visual_assets (id, product_id, asset_type, source_url, delivery_path, content_hash,
                                            alt_text, rights_basis, rights_status, verification_status,
                                            evidence_id, observed_at, is_primary, is_current, rights_evidence_url,
                                            width, height, last_checked_at, last_check_status, delivery_mode,
                                            licence_code, licence_url, attribution)
    values (v_id, v_product, v_asset_type, v_image, null, v_hash, v_alt,
            case v_kind
              when 'licensed' then left(format('%s, %s (Wikimedia Commons)', v_licence,
                                               coalesce(v_attribution, 'sans attribution requise')), 1000)
              when 'site_hero' then 'Visuel principal montré par l''éditeur sur la page d''accueil de son site officiel (PD-40) : pas de licence vérifiée'
              when 'site_screenshot' then 'Capture de l''interface montrée par l''éditeur sur son site officiel (PD-40) : pas de licence vérifiée'
              else 'Image de partage publiée par l''éditeur sur son site officiel (aperçu de lien, PD-38) : pas de licence vérifiée'
            end,
            v_status, 'unverified', v_evidence, v_observed, false, true, v_page,
            v_width, v_height, now(), 'unchanged', 'external_reference',
            v_licence, v_licence_url, v_attribution);
  -- The best current visual of the product becomes (or stays) its primary one.
  perform private.refresh_primary_visual(v_product);
  select a.is_primary into v_primary from public.product_visual_assets a where a.id = v_id;
  insert into public.audit_logs (actor_kind, action, resource_type, resource_id, metadata)
    values ('worker', 'catalog.visual_reference_recorded', 'product_visual_asset', v_id,
            jsonb_build_object('product_id', v_product, 'kind', v_kind, 'image_url', v_image,
                               'page_url', v_page, 'licence_code', v_licence, 'primary', v_primary));
  return jsonb_build_object('status', 'created', 'asset_id', v_id, 'product_id', v_product, 'primary', v_primary);
end;
$$;
revoke all on function public.sor_record_visual_reference(jsonb) from public, anon, authenticated;
grant execute on function public.sor_record_visual_reference(jsonb) to service_role;
