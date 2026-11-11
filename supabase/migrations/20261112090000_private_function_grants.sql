-- Sprint 7 (S7.4a) — security review: execute privileges of private helpers.
-- Source: docs/SECURITY_REVIEW.md (finding L1), Technical Blueprint §11.2
-- ("helper functions in the non-exposed private schema … minimal execute
-- grants").
--
-- Functions are executable by PUBLIC when created. Sensitive private
-- functions already revoke it explicitly; these thirteen kept the default, so
-- `anon` could execute them. `anon` has no USAGE on the private schema, so
-- they were unreachable, but the grant itself is wrong: revoke it, and keep
-- exactly the previous access for `authenticated` (row-level policies, the
-- catalog search running as the caller, triggers fired by browser writes)
-- and `service_role` (server writes fire the same triggers).
-- No behaviour change for signed-in users or the server.

do $$
declare f text;
begin
  foreach f in array array[
    'private.set_updated_at()',
    'private.valid_country_codes(text[])',
    'private.refresh_product_search_vector()',
    'private.assert_evidence_for_product(uuid, uuid)',
    'private.trg_evidence_scope_product()',
    'private.trg_competitor_evidence_scope()',
    'private.trg_evidence_entity_consistency()',
    'private.trg_feedback_evidence_consistency()',
    'private.trg_provenance_scope()',
    'private.trg_exclusion_guard()',
    'private.trg_category_exclusion_guard()',
    'private.catalog_filtered(uuid, jsonb)',
    'private.catalog_sort_value(text, integer, uuid, timestamptz, integer, integer, integer, timestamptz, real)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- Functions created later in `private` by the migration role are not
-- executable by PUBLIC unless granted explicitly (pgTAP 019 lists every
-- function the browser roles may execute).
alter default privileges in schema private revoke execute on functions from public;
