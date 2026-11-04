-- M4 — reference data
-- Source: docs/IMPLEMENTATION_BLUEPRINT.md §3 (M4). Keep both in sync.

create table public.platform_limits (
  key text primary key check (key ~ '^[a-z_]{3,80}$'),
  value jsonb not null,
  description text not null,
  updated_at timestamptz not null default now()
);
alter table public.platform_limits enable row level security;
revoke all on table public.platform_limits from anon, authenticated;   -- server-only

create table public.exclusion_rules (
  id uuid primary key default gen_random_uuid(),
  rule_set_version text not null,
  rule_key text not null,
  rule_kind text not null check (rule_kind in ('excluded_category','core_purpose_phrase','review_phrase')),
  pattern text not null,
  outcome text not null check (outcome in ('excluded','needs_review','flag_only')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (rule_set_version, rule_key)
);
alter table public.exclusion_rules enable row level security;
revoke all on table public.exclusion_rules from anon, authenticated;   -- server-only, audit mirror

-- Non-AI defaults. AI budget defaults are inserted once the PD-08 benchmark
-- has fixed them (PD-24, pending).
insert into public.platform_limits(key, value, description) values
  ('max_owned_workspaces_per_user', '5', 'Workspaces a user may own'),
  ('max_concurrent_jobs_per_workspace', '3', 'Running jobs per workspace'),
  ('job_max_attempts', '5', 'Attempts before dead letter'),
  ('job_lease_seconds', '120', 'Lease and visibility timeout per heartbeat cycle'),
  ('job_heartbeat_seconds', '30', 'Heartbeat interval'),
  ('discovery_max_candidates', '100', 'Candidates per discovery run'),
  ('discovery_max_source_requests', '200', 'External requests per discovery run'),
  ('fetch_max_bytes', '5242880', 'Safe fetcher response limit (5 MiB)'),
  ('fetch_timeout_ms', '15000', 'Safe fetcher timeout'),
  ('fetch_max_redirects', '5', 'Safe fetcher redirect limit'),
  ('api_rate_limit_job_posts_per_hour', '30', 'Job-creating POSTs per user per hour');

-- Taxonomy (PRD §4.2.E). Child slugs are prefixed by the parent slug.
-- Developer Tools gets a negative priority weight (PRD: less prioritized
-- in default recommendations, still available through filters).
with parents(name, slug, weight) as (values
  ('Marketing & Growth','marketing-growth',10),
  ('Sales & CRM','sales-crm',0),
  ('Data & Analytics','data-analytics',5),
  ('Automation & AI','automation-ai',0),
  ('Business Operations','business-operations',0),
  ('E-commerce','ecommerce',0),
  ('Developer Tools','developer-tools',-50))
insert into public.categories(name, slug, priority_weight)
select name, slug, weight from parents;

with children(parent_slug, name, suffix) as (values
  ('marketing-growth','Marketing Automation','marketing-automation'),
  ('marketing-growth','Campaign Management','campaign-management'),
  ('marketing-growth','Marketing Analytics','marketing-analytics'),
  ('marketing-growth','Attribution','attribution'),
  ('marketing-growth','Conversion Optimization','conversion-optimization'),
  ('marketing-growth','Lead Generation','lead-generation'),
  ('marketing-growth','Lead Management','lead-management'),
  ('marketing-growth','Email Marketing','email-marketing'),
  ('marketing-growth','Social Media Management','social-media-management'),
  ('marketing-growth','SEO','seo'),
  ('marketing-growth','Content Marketing','content-marketing'),
  ('marketing-growth','Advertising Management','advertising-management'),
  ('marketing-growth','Marketing Intelligence','marketing-intelligence'),
  ('sales-crm','CRM','crm'),
  ('sales-crm','Sales Automation','sales-automation'),
  ('sales-crm','Sales Intelligence','sales-intelligence'),
  ('sales-crm','Lead Qualification','lead-qualification'),
  ('sales-crm','Customer Relationship Management','customer-relationship-management'),
  ('sales-crm','Sales Engagement','sales-engagement'),
  ('data-analytics','Business Intelligence','business-intelligence'),
  ('data-analytics','Data Analytics','data-analytics'),
  ('data-analytics','Reporting','reporting'),
  ('data-analytics','Dashboarding','dashboarding'),
  ('data-analytics','Data Integration','data-integration'),
  ('data-analytics','Data Visualization','data-visualization'),
  ('data-analytics','Monitoring','monitoring'),
  ('automation-ai','Workflow Automation','workflow-automation'),
  ('automation-ai','AI Agents','ai-agents'),
  ('automation-ai','AI Productivity','ai-productivity'),
  ('automation-ai','Business Process Automation','business-process-automation'),
  ('automation-ai','AI Analytics','ai-analytics'),
  ('business-operations','Project Management','project-management'),
  ('business-operations','Finance Operations','finance-operations'),
  ('business-operations','Customer Support','customer-support'),
  ('business-operations','Document Automation','document-automation'),
  ('business-operations','Business Management','business-management'),
  ('ecommerce','Store Management','store-management'),
  ('ecommerce','Conversion Optimization','conversion-optimization'),
  ('ecommerce','Customer Experience','customer-experience'),
  ('ecommerce','E-commerce Analytics','ecommerce-analytics'),
  ('ecommerce','Inventory Management','inventory-management'),
  ('developer-tools','API Platforms','api-platforms'),
  ('developer-tools','Developer Productivity','developer-productivity'),
  ('developer-tools','Monitoring','monitoring'),
  ('developer-tools','Infrastructure','infrastructure'))
insert into public.categories(parent_id, name, slug)
select p.id, c.name, c.parent_slug || '-' || c.suffix
from children c join public.categories p on p.slug = c.parent_slug;
-- e.g. 'data-analytics-data-analytics', 'ecommerce-conversion-optimization'.

-- Hidden, permanently excluded categories (PRD §1.3, §4.2.O; ADR-010).
-- Used only by the server-side classifier; never user-visible.
insert into public.categories(name, slug, is_user_visible, is_permanently_excluded, priority_weight) values
  ('Excluded: Affiliate Marketing','excluded-affiliate-marketing', false, true, -100),
  ('Excluded: Affiliate Networks','excluded-affiliate-networks', false, true, -100),
  ('Excluded: Partner Programs & Partner Management','excluded-partner-management', false, true, -100),
  ('Excluded: Partner Marketplaces','excluded-partner-marketplaces', false, true, -100),
  ('Excluded: Partner / Affiliate Attribution','excluded-partner-attribution', false, true, -100),
  ('Excluded: Partner / Affiliate Commissions & Payouts','excluded-partner-commissions-payouts', false, true, -100),
  ('Excluded: Referral / Affiliate Networks','excluded-referral-affiliate-networks', false, true, -100);

-- Source registry: every source starts as 'planned' and disabled. The
-- migration that ships a tested connector sets it to 'integrated'.
insert into public.sources(source_key, name, source_type, access_method, default_reliability_level) values
  ('manual_entry','Manual entry','manual_entry','manual_entry',4),
  ('user_import','User CSV import','user_import','user_import',4),
  ('official_website','Official website','official_website','official_website_fetch',1);
-- Third-party sources (Product Hunt, G2, Capterra, Reddit, X, LinkedIn,
-- Crunchbase, AlternativeTo, BuiltWith/Wappalyzer, Similarweb; PRD §13.1)
-- are inserted only after their terms review (PD-14 A; G2 first, pending
-- approval PD-26; Discovery search sources PD-28; ADR-013).

-- exclusion_rules mirrors packages/domain/src/exclusion (rule set 'excl-1');
-- §5.4 is the authoritative list. The code is the executor; this table is
-- the audit mirror and a pgTAP test checks both are in sync.
insert into public.exclusion_rules(rule_set_version, rule_key, rule_kind, pattern, outcome) values
  ('excl-1','R1','excluded_category','categories.is_permanently_excluded','excluded'),
  ('excl-1','R2','core_purpose_phrase','affiliate marketing|affiliate programs?|affiliate networks?|affiliate management|affiliate tracking|affiliate software|affiliate platform|affiliate attribution|affiliate commissions?|affiliate payouts?','excluded'),
  ('excl-1','R3','core_purpose_phrase','partner programs?|partner management|partner relationship management|PRM|partner ecosystem|partner marketplace|partner portal|channel partners?|partner attribution|partner commissions?|partner payouts?|partnership management|partnerships platform','excluded'),
  ('excl-1','R4','core_purpose_phrase','referral networks?|affiliate and referral|referral and affiliate','excluded'),
  ('excl-1','R5','core_purpose_phrase','(commission|payout) WITH (affiliate|partner) in the same core text','excluded'),
  ('excl-1','R6','review_phrase','commission management|sales commissions?|referral programs?|referral marketing|customer referrals?','flag_only'),  -- PD-11 A
  ('excl-1','R7','review_phrase','standalone affiliate (core texts) | standalone partners? (primary use case only)','needs_review'),
  ('excl-1','R8','review_phrase','R2-R5 phrases in description only','needs_review'),
  ('excl-1','R10','review_phrase','LLM core_purpose_flag = affiliate_or_partner','needs_review');
-- R9 (feature-only mention -> eligible + incidental flag) has no exclusion outcome.
