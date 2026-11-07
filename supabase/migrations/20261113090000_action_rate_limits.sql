-- Sprint 7 (S7.4d) — rate limits on abuse-prone actions (security review
-- finding M3): member invitations (they send emails), manual catalog
-- additions (they write the global catalog) and correction reports.
-- Same fixed-window counters as the S7.2 job-request limit
-- (rate_limit_counters, Implementation Blueprint §10 "keyed by user and route
-- class"); the API calls sor_consume_rate_limit before the action.

insert into public.platform_limits(key, value, description) values
  ('api_rate_limit_invitations_per_hour', '20', 'Member invitations per workspace per hour (emails sent)'),
  ('api_rate_limit_manual_additions_per_hour', '20', 'Manual catalog additions per user per hour'),
  ('api_rate_limit_correction_reports_per_hour', '30', 'Catalog correction reports per user per hour')
on conflict (key) do nothing;

-- Like private.consume_rate_limit (S7.2) with the action named in the error,
-- e.g. 'RATE_LIMITED: invitations retry_after=120'.
create or replace function private.consume_named_rate_limit(
  p_bucket text, p_limit integer, p_window interval, p_label text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_start timestamptz := pg_catalog.date_bin(p_window, now(), timestamptz '2000-01-01 00:00:00+00');
  v_count integer;
begin
  insert into public.rate_limit_counters (bucket_key, window_start, request_count)
  values (p_bucket, v_start, 1)
  on conflict (bucket_key, window_start)
    do update set request_count = public.rate_limit_counters.request_count + 1
  returning request_count into v_count;
  if v_count > p_limit then
    raise exception 'RATE_LIMITED: % retry_after=%', p_label,
      greatest(1, ceil(extract(epoch from (v_start + p_window - clock_timestamp())))::integer)
      using errcode = '54000';
  end if;
  delete from public.rate_limit_counters c where c.bucket_key = p_bucket and c.window_start < v_start;
  return v_count;
end;
$$;

-- Service role only. p_subject: the workspace for invitations, the acting
-- user for manual additions and correction reports.
create or replace function public.sor_consume_rate_limit(p_action text, p_subject uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_subject is null then
    raise exception 'VALIDATION_ERROR: subject' using errcode = '22023';
  end if;
  case p_action
    when 'invitation' then
      return private.consume_named_rate_limit('invitation:' || p_subject::text,
        private.limit_int('api_rate_limit_invitations_per_hour', 20), interval '1 hour', 'invitations');
    when 'manual_addition' then
      return private.consume_named_rate_limit('manual_addition:' || p_subject::text,
        private.limit_int('api_rate_limit_manual_additions_per_hour', 20), interval '1 hour', 'manual additions');
    when 'correction_report' then
      return private.consume_named_rate_limit('correction_report:' || p_subject::text,
        private.limit_int('api_rate_limit_correction_reports_per_hour', 30), interval '1 hour', 'correction reports');
    else
      raise exception 'VALIDATION_ERROR: action' using errcode = '22023';
  end case;
end;
$$;

revoke all on function private.consume_named_rate_limit(text, integer, interval, text) from public, anon, authenticated;
revoke all on function public.sor_consume_rate_limit(text, uuid) from public, anon, authenticated;
grant execute on function public.sor_consume_rate_limit(text, uuid) to service_role;
