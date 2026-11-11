-- S8.4 — Ask AI completion (ADR-015 / PD-35, PRODUCT_VISION §4).
-- Ask AI stays a manual handoff: no model call, no API key. This migration
-- only widens the saved session's vocabulary:
--   * subjects: a category (bounded sample of its catalog SaaS) and a
--     workspace Pain Point Cluster, besides one to five catalog SaaS;
--   * strategies: SaaS discovery (A), customer voice (B) and opportunity
--     analysis with SOR's reference grid (D), besides the existing ones.
-- Existing rows keep valid values; grants and RLS are unchanged.

do $$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.external_research_sessions'::regclass
       and con.contype = 'c'
       and (pg_get_constraintdef(con.oid) like '%subject_type%'
            or pg_get_constraintdef(con.oid) like '%strategy%')
  loop
    execute format('alter table public.external_research_sessions drop constraint %I', c.conname);
  end loop;
end
$$;

alter table public.external_research_sessions
  add constraint external_research_sessions_subject_type_check
    check (subject_type in ('product','product_set','category','pain_point_cluster')),
  add constraint external_research_sessions_strategy_check
    check (strategy in (
      'saas_discovery','customer_voice','opportunity_analysis',
      'better_alternative','cross_competitor_pain_intelligence','independent_saas_discovery',
      'france_europe_adaptation','red_team','compare_competitors'
    ));
