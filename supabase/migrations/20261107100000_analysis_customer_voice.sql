-- Customer voice of an opportunity analysis (Implementation Blueprint §8.4):
-- when no pain point run covers the analysis scope with the current versions,
-- the analysis job runs P1–P7 for its scope. The run is an ordinary pain point
-- run of the workspace (clusters can be inspected and corrected), owned by the
-- analysis job: parameters.analysis_id links it, and its status follows the
-- analysis job. Every function is service_role only.

-- Creates (once) the pain point run of an analysis whose job is running.
create or replace function public.sor_analysis_pain_run(p_analysis_id uuid, p_max_feedback_items integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.opportunity_analyses;
  v_run uuid;
  v_products uuid[];
  v_title text;
begin
  v := private.running_analysis(p_analysis_id);
  perform pg_advisory_xact_lock(hashtext('sor_analysis_pain_run:' || p_analysis_id::text));
  select r.id into v_run from public.pain_point_runs r
   where r.workspace_id = v.workspace_id and r.parameters ->> 'analysis_id' = p_analysis_id::text;
  if v_run is not null then
    return v_run;
  end if;
  if p_max_feedback_items not between 10 and 2000 then
    raise exception 'VALIDATION_ERROR: max_feedback_items' using errcode = '22023';
  end if;
  select array_agg(distinct sp.product_id order by sp.product_id) into v_products
    from public.analysis_subject_products sp
    join public.saas_products p on p.id = sp.product_id
   where sp.analysis_id = p_analysis_id and p.record_status = 'active' and p.exclusion_status = 'eligible';
  if coalesce(cardinality(v_products), 0) = 0 then
    raise exception 'VALIDATION_ERROR: empty scope' using errcode = '22023';
  end if;
  v_title := left('Analyse d’opportunité : ' || coalesce(
               v.subject_snapshot -> 'product' ->> 'name', v.subject_snapshot -> 'category' ->> 'name',
               v.subject_snapshot -> 'cluster' ->> 'name', v.subject_snapshot -> 'generated_opportunity' ->> 'name',
               'ensemble de SaaS'), 200);
  insert into public.pain_point_runs (workspace_id, created_by, title, scope_type, scope_category_id, parameters,
                                      status, job_execution_id, started_at)
  values (v.workspace_id, v.created_by, v_title,
          case when v.subject_type = 'category' then 'category'
               when cardinality(v_products) = 1 then 'product' else 'product_set' end::public.pain_scope_type,
          case when v.subject_type = 'category' then v.subject_category_id end,
          jsonb_build_object('max_feedback_items', p_max_feedback_items, 'analysis_id', p_analysis_id),
          'running', v.job_execution_id, now())
  returning id into v_run;
  insert into public.pain_point_run_products (run_id, product_id, total_known_review_count)
  select v_run, u.id, private.known_review_count(u.id) from unnest(v_products) u(id);
  return v_run;
end;
$$;

-- Ends the analysis-owned run (completed or partial) from the running job.
create or replace function public.sor_analysis_finish_pain_run(p_analysis_id uuid, p_status public.run_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.running_analysis(p_analysis_id);
  if p_status not in ('completed', 'partial') then
    raise exception 'VALIDATION_ERROR: status' using errcode = '22023';
  end if;
  update public.pain_point_runs r
     set status = p_status, completed_at = now()
   where r.parameters ->> 'analysis_id' = p_analysis_id::text and r.status = 'running';
end;
$$;

-- The analysis mirrors its job (M7); an analysis-owned pain point run still
-- running when the job ends takes the job's outcome.
create or replace function private.trg_sync_analysis_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_analysis uuid;
begin
  if new.job_kind <> 'opportunity_analysis' or new.state is not distinct from old.state then
    return new;
  end if;
  update public.opportunity_analyses a
     set status = case
                    when a.status = 'needs_review' and new.state in ('completed', 'partial') then 'needs_review'
                    else case new.state
                           when 'queued' then 'queued'
                           when 'running' then 'running'
                           when 'retrying' then 'running'
                           when 'completed' then 'completed'
                           when 'partial' then 'partial'
                           when 'cancelled' then 'cancelled'
                           else 'failed'
                         end
                  end::public.run_status,
         terminal_reason = case when new.state in ('completed', 'partial', 'failed', 'cancelled', 'dead_letter')
                                then coalesce(new.terminal_reason, a.terminal_reason) else null end,
         started_at = case when new.state = 'running' then coalesce(a.started_at, now()) else a.started_at end,
         completed_at = case when new.state in ('completed', 'partial', 'failed', 'cancelled', 'dead_letter')
                             then now() else null end
   where a.job_execution_id = new.id
  returning a.id into v_analysis;
  if v_analysis is not null and new.state in ('completed', 'partial', 'failed', 'cancelled', 'dead_letter') then
    update public.pain_point_runs r
       set status = case new.state when 'completed' then 'completed' when 'partial' then 'partial'
                                   when 'cancelled' then 'cancelled' else 'failed' end::public.run_status,
           completed_at = now(),
           error_summary = case when new.state in ('failed', 'dead_letter')
                                then coalesce(new.last_error_message, r.error_summary) else r.error_summary end
     where r.parameters ->> 'analysis_id' = v_analysis::text and r.status = 'running';
  end if;
  return new;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.sor_analysis_pain_run(uuid, integer)',
    'public.sor_analysis_finish_pain_run(uuid, public.run_status)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  execute 'revoke all on function private.trg_sync_analysis_state() from public, anon, authenticated';
end $$;
