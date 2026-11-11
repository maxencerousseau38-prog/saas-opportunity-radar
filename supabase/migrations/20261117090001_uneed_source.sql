-- Uneed as a second catalog source (10 November 2026; terms review in
-- docs/DATA_SOURCES.md, official pages frozen in docs/sources/terms).
-- Uneed publishes a free, read-only API over its product data ("No
-- authentication in v1; per-IP rate limits apply"; "the legitimate
-- alternative to scraping"). No data licence is stated: metadata only, with
-- attribution "Source: Uneed, uneed.best". Listings go through the same
-- ingestion RPC as Wikidata (sor_ingest_catalog_listing).
insert into public.sources (source_key, name, source_type, access_method, base_url, terms_url,
                            terms_reviewed_at, terms_review_notes, integration_status, default_reliability_level,
                            rate_limit_per_minute, quota_per_day, is_enabled, storage_policy)
values
  ('uneed', 'Uneed', 'directory', 'official_api', 'https://mcp.uneed.best/v1',
   'https://www.uneed.best/terms-of-use', '2026-11-10 18:00:00+00',
   'Official read-only API (OpenAPI "Uneed read API" 1.1.0): no authentication in v1, per-IP rate limits. uneed.best/mcp: "Clean, structured, rate-limited access to our data: the legitimate alternative to scraping." Terms of use forbid automated posting and vote manipulation, not reading the API. No data licence stated (launch statistics only are CC BY 4.0): metadata only (name, own website, short description, category and tags, launch date, Uneed page), no logo, image, review or maker data; attribution "Source: Uneed, uneed.best". Product listings are maker-declared (reliability 3).',
   'integrated', 3, 50, 1000, true, 'metadata_only')
on conflict (source_key) do nothing;
