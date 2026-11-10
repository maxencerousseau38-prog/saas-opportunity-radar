-- Discover at catalog scale (10 November 2026): the first real bulk load
-- (Wikidata + Uneed, ~8,600 visible products, ~630 companies) made
-- catalog_search_v2 and catalog_count_v2 take ~18 s as a viewer, past the 8 s
-- statement timeout of `authenticated`.
--
-- Cause (EXPLAIN ANALYZE): inside this SQL function the generic catalog-plan
-- filter is estimated to keep one product, so the planner joined companies
-- with a nested loop over a full companies scan, and the companies RLS policy
-- (private.is_visible_company) ran once per product and company pair: 5.4
-- million calls. Refreshing statistics does not help (it was measured worse).
--
-- Fix: the same function with one primary-key lookup of the product's company
-- (LIMIT 1 prevents the planner from flattening it back into that join). The
-- filter semantics, columns, grants and RLS are unchanged; measured locally on
-- the real snapshots: 17.9 s -> 0.9 s (search) and 16.0 s -> 0.8 s (count).
create or replace function private.catalog_filtered(p_workspace_id uuid, p_plan jsonb)
returns table (
  id uuid,
  first_discovered_at timestamptz,
  start_year integer,
  team_size integer,
  min_monthly_eur numeric,
  monetization_score integer,
  last_activity_at timestamptz,
  text_rank real
)
language sql
stable
set search_path = ''
as $$
  with base as (
    select
      p.id,
      p.first_discovered_at,
      p.customer_type,
      p.billing_models,
      p.pricing_status,
      p.product_status,
      p.search_vector,
      p.name,
      p.last_verified_at,
      c.country_code,
      c.company_type,
      c.founder_led,
      c.funding_status,
      c.employee_min,
      c.employee_max,
      coalesce(c.founded_year, p.launch_year) as start_year,
      coalesce(c.employee_max, c.employee_min) as team_size,
      (select min(
                case pp.billing_period when 'year' then pp.price_amount / 12 else pp.price_amount end
                * case when pp.currency = 'EUR' then 1 else fx.rate_to_eur end)
         from public.pricing_plans pp
         left join lateral (
           select f.rate_to_eur from public.fx_rates f
           where f.currency = pp.currency order by f.rate_date desc limit 1) fx on true
        where pp.product_id = p.id and pp.superseded_at is null
          and pp.price_amount > 0 and pp.billing_period in ('month', 'year')) as min_monthly_eur,
      exists (select 1 from public.pricing_plans pp
               where pp.product_id = p.id and pp.superseded_at is null
                 and (pp.custom_pricing or pp.billing_period = 'custom')) as has_custom_plan,
      exists (select 1 from public.pricing_plans pp
               where pp.product_id = p.id and pp.superseded_at is null and pp.price_amount > 0) as has_paid_plan,
      (select count(*)::integer from public.evidence_items e
        where e.product_id = p.id and e.verification_status = 'verified'
          and e.monetization_signal in ('payment_confirmed', 'customer_verified')) as monetization_score,
      greatest(p.last_verified_at,
               (select max(s.signal_date)::timestamptz from public.company_signals s
                 where s.product_id = p.id)) as last_activity_at,
      ws.is_hidden,
      ws.status as ws_status,
      case when nullif(p_plan ->> 'text', '') is null then null
           else ts_rank(p.search_vector, websearch_to_tsquery('english', p_plan ->> 'text')) end as text_rank
    from public.saas_products p
    -- One primary-key lookup per product (LIMIT 1 keeps the planner from
    -- flattening it back into a join that calls the companies RLS helper
    -- once per product and company pair).
    left join lateral (
      select c1.country_code, c1.company_type, c1.founder_led, c1.funding_status,
             c1.employee_min, c1.employee_max, c1.founded_year
      from public.companies c1 where c1.id = p.company_id limit 1) c on true
    left join public.workspace_product_states ws
      on ws.product_id = p.id and ws.workspace_id = p_workspace_id
  )
  select b.id, b.first_discovered_at, b.start_year, b.team_size, b.min_monthly_eur,
         b.monetization_score, b.last_activity_at, b.text_rank
  from base b
  where
    -- hidden products (PRD §3.4)
    (coalesce((p_plan ->> 'include_hidden')::boolean, false) or coalesce(b.is_hidden, false) = false)
    -- text search (name substring or full text)
    and (nullif(p_plan ->> 'text', '') is null
         or b.search_vector @@ websearch_to_tsquery('english', p_plan ->> 'text')
         or b.name ilike '%' || replace(replace(replace(p_plan ->> 'text', '\', '\\'), '%', '\%'), '_', '\_') || '%')
    -- A. customer type
    and (p_plan -> 'customer_types' is null
         or (b.customer_type = 'unknown' and coalesce((p_plan -> 'customer_types' ->> 'include_unknown')::boolean, false))
         or b.customer_type::text in (select jsonb_array_elements_text(p_plan -> 'customer_types' -> 'values')))
    -- B. team size (ranges on employee_max, else employee_min)
    and (p_plan -> 'team' is null
         or (b.team_size is null and coalesce((p_plan -> 'team' ->> 'include_unknown')::boolean, false))
         or exists (select 1 from jsonb_array_elements(p_plan -> 'team' -> 'ranges') r
                     where b.team_size >= coalesce((r ->> 'min')::integer, 0)
                       and (r ->> 'max' is null or b.team_size <= (r ->> 'max')::integer)))
    -- C. headquarters country
    and (p_plan -> 'hq_countries' is null
         or (b.country_code is null and coalesce((p_plan -> 'hq_countries' ->> 'include_unknown')::boolean, false))
         or b.country_code in (select jsonb_array_elements_text(p_plan -> 'hq_countries' -> 'values')))
    -- D. age (founding year, else launch year)
    and (p_plan -> 'founded' is null
         or (b.start_year is null and coalesce((p_plan -> 'founded' ->> 'include_unknown')::boolean, false))
         or exists (select 1 from jsonb_array_elements(p_plan -> 'founded' -> 'ranges') r
                     where (r ->> 'min' is null or b.start_year >= (r ->> 'min')::integer)
                       and (r ->> 'max' is null or b.start_year <= (r ->> 'max')::integer)))
    -- E. categories (a parent slug includes its children)
    and (p_plan -> 'category_slugs' is null
         or exists (select 1 from public.product_categories pc
                     join public.categories cat on cat.id = pc.category_id
                     left join public.categories parent on parent.id = cat.parent_id
                     where pc.product_id = b.id
                       and (cat.slug in (select jsonb_array_elements_text(p_plan -> 'category_slugs'))
                            or parent.slug in (select jsonb_array_elements_text(p_plan -> 'category_slugs')))))
    -- F. billing models (empty array = unknown)
    and (p_plan -> 'billing_models' is null
         or (cardinality(b.billing_models) = 0 and coalesce((p_plan -> 'billing_models' ->> 'include_unknown')::boolean, false))
         or b.billing_models && array(select jsonb_array_elements_text(p_plan -> 'billing_models' -> 'values'))::public.billing_model[])
    -- G. price bands (indicative EUR monthly entry price)
    and (p_plan -> 'price' is null
         or (coalesce((p_plan -> 'price' ->> 'free')::boolean, false) and b.pricing_status = 'free')
         or (coalesce((p_plan -> 'price' ->> 'custom')::boolean, false) and (b.pricing_status = 'custom' or b.has_custom_plan))
         or (b.min_monthly_eur is null and b.pricing_status <> 'free'
             and coalesce((p_plan -> 'price' ->> 'include_unknown')::boolean, false))
         or exists (select 1 from jsonb_array_elements(p_plan -> 'price' -> 'ranges') r
                     where b.min_monthly_eur >= coalesce((r ->> 'min')::numeric, 0)
                       and (r ->> 'max' is null or b.min_monthly_eur < (r ->> 'max')::numeric)))
    -- I. commercial validation (OR inside the group)
    and (p_plan -> 'commercial_validation' is null
         or jsonb_array_length(p_plan -> 'commercial_validation') = 0
         or exists (select 1 from jsonb_array_elements_text(p_plan -> 'commercial_validation') v
                     where (v = 'paying_customers_confirmed' and b.monetization_score > 0)
                        or (v = 'customer_reviews' and (
                              exists (select 1 from public.customer_feedback f where f.product_id = b.id)
                              or exists (select 1 from public.company_signals s where s.product_id = b.id and s.signal_type = 'review_count')))
                        or (v = 'testimonials' and exists (select 1 from public.company_signals s
                              where s.product_id = b.id and s.signal_type = 'testimonial'))
                        or (v = 'case_studies' and exists (select 1 from public.company_signals s
                              where s.product_id = b.id and s.signal_type = 'case_study'))
                        or (v = 'paid_subscriptions' and b.has_paid_plan)
                        or (v = 'traction_signals' and exists (select 1 from public.company_signals s
                              where s.product_id = b.id and s.signal_type in (
                                'review_count','customer_logo','commercial_reference','product_hunt_presence',
                                'headcount_change','launch_or_update','commercial_activity')))
                        or (v = 'monetization_unverified' and b.has_paid_plan and b.monetization_score = 0)
                        or (v = 'insufficient_data' and not b.has_paid_plan and b.monetization_score = 0
                            and not exists (select 1 from public.company_signals s where s.product_id = b.id))))
    -- J. company profile (OR inside the group)
    and (p_plan -> 'company_profile' is null
         or (coalesce((p_plan -> 'company_profile' ->> 'include_unknown')::boolean, false)
             and coalesce(b.company_type, 'unknown') = 'unknown' and b.founder_led is null)
         or exists (select 1 from jsonb_array_elements_text(p_plan -> 'company_profile' -> 'values') v
                     where (v = 'founder_led' and b.founder_led)
                        or (v = 'indie_saas' and b.company_type = 'independent' and b.team_size <= 20
                            and b.funding_status <> 'externally_funded')
                        or (v = 'small_team' and b.team_size <= 20)
                        or (v = 'independent' and b.company_type = 'independent')
                        or (v = 'funded' and b.funding_status = 'externally_funded')
                        or (v = 'bootstrapped' and b.funding_status = 'bootstrapped')
                        or (v = 'subsidiary_or_group' and b.company_type in ('subsidiary', 'public_company'))
                        or (v = 'unknown' and coalesce(b.company_type, 'unknown') = 'unknown')))
    -- O. configurable exclusions (each one removes matching products)
    and not exists (
      select 1 from jsonb_array_elements_text(coalesce(p_plan -> 'configurable_exclusions', '[]'::jsonb)) x
      where (x = 'b2c_only' and b.customer_type = 'b2c')
         or (x = 'groups_and_large_companies' and (b.company_type in ('subsidiary', 'public_company') or b.employee_min > 100))
         or (x = 'free_without_monetization' and b.pricing_status = 'free')
         or (x = 'no_identifiable_activity' and b.product_status = 'discontinued')
         or (x = 'too_recent_without_demand_proof'
             and b.start_year >= coalesce((p_plan ->> 'current_year')::integer, extract(year from now())::integer) - 1
             and b.monetization_score = 0
             and not exists (select 1 from public.customer_feedback f where f.product_id = b.id)
             and not exists (select 1 from public.company_signals s where s.product_id = b.id
                               and s.signal_type in ('review_count', 'testimonial', 'case_study')))
         or (x = 'very_technical_devtools' and exists (
               select 1 from public.product_categories pc
               join public.categories cat on cat.id = pc.category_id
               join public.categories parent on parent.id = cat.parent_id
               where pc.product_id = b.id and pc.is_primary and parent.slug = 'developer-tools'))
         or (x = 'already_analyzed_and_rejected' and b.ws_status = 'rejected'))
$$;

grant execute on function private.catalog_filtered(uuid, jsonb) to authenticated;
