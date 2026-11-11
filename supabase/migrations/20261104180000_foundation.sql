-- M1 — foundation
-- Source: docs/IMPLEMENTATION_BLUEPRINT.md §3 (M1). Keep both in sync.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Defence in depth for objects created by the migration role.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

create type public.company_type as enum ('independent','subsidiary','public_company','unknown');
create type public.funding_status as enum ('bootstrapped','externally_funded','unknown');
create type public.product_status as enum ('active','beta','discontinued','unknown');
create type public.record_status as enum ('candidate','active','needs_review','archived','merged');
create type public.exclusion_status as enum ('unassessed','eligible','excluded','needs_review');
create type public.customer_type as enum ('b2b','b2c','b2b_b2c','unknown');
-- PRD §4.2.F values; an empty array means "unknown".
create type public.billing_model as enum (
  'monthly_subscription','annual_subscription','freemium','free_trial',
  'usage_based','per_user','volume_based','license','other'
);
create type public.pricing_status as enum ('free','paid','freemium','custom','unknown');
create type public.maturity_stage as enum ('new','launching','established','growing','mature','unknown');
create type public.presence_status as enum ('present','not_observed','unknown');
create type public.technology_tag as enum (
  'web_app','mobile_app','api','ai_native','no_code_low_code','browser_extension'
);
create type public.integration_category as enum (
  'crm','ecommerce','marketing','analytics','communication','payments','other'
);
create type public.fact_status as enum ('confirmed','estimated','declared','unknown');
create type public.verification_status as enum (
  'unverified','verified','needs_review','rejected','stale'
);
create type public.source_type as enum (
  'official_website','review_platform','directory','community','social',
  'company_database','search_provider','manual_entry','user_import','other'
);
create type public.source_access_method as enum (
  'official_api','contract','public_feed','official_website_fetch',
  'manual_entry','user_import'
);
create type public.source_integration_status as enum (
  'planned','in_development','integrated','disabled','blocked'
);
create type public.fetch_status as enum (
  'ok','blocked','unavailable','not_supported','rate_limited','error'
);
create type public.content_storage_status as enum (
  'stored_full','stored_excerpt','reference_only','removed'
);
create type public.evidence_type as enum (
  'official_statement','customer_review','pricing_evidence',
  'customer_case_study','public_metric','technical_evidence',
  'market_evidence','third_party_report','user_declared','inference'
);
create type public.claim_type as enum (
  'product_exists','product_description','category','pricing',
  'paid_customer_signal','customer_identity','employee_count',
  'founding_year','headquarters','customer_country','market_presence',
  'language','platform','feature','integration','maturity',
  'company_profile','traction_signal','customer_feedback','customer_pain','market_size',
  'market_trend','competitor_relation','localization','funding',
  'traffic','other'
);
create type public.extraction_method as enum (
  'official_api','structured_parse','llm_extraction','manual_entry','user_import'
);
-- WTP / monetization evidence categories (CLAUDE.md §10).
create type public.monetization_signal as enum (
  'payment_confirmed','customer_verified','paid_plan_available',
  'purchase_intent','problem_signal','unknown'
);
create type public.feature_availability as enum (
  'available','beta','planned','removed','not_observed','unknown'
);
create type public.competitor_relationship as enum (
  'direct','indirect','alternative','substitute','adjacent'
);
create type public.review_sentiment as enum ('positive','neutral','negative','mixed','unknown');
-- PRD §4.2.N complaint categories (+ reliability, other).
create type public.problem_category as enum (
  'pricing','ux','missing_features','bugs','support','integrations',
  'performance','documentation','customization','complexity',
  'reliability','other'
);
create type public.resolution_status as enum ('resolved','unresolved','unknown');
create type public.workspace_role as enum ('owner','admin','member','viewer');
-- PRD §10.3 statuses.
create type public.opportunity_status as enum (
  'discovered','to_research','analyzing','validate','validated','rejected','building'
);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.valid_country_codes(p text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(c ~ '^[A-Z]{2}$'), true) from unnest(p) as c;
$$;
