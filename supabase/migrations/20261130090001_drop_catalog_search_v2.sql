-- Drop catalog_search_v2 (follow-up of PD-41, product-owner instruction of
-- 13 November 2026). The web app deployed with PR #18 calls
-- catalog_search_v3 only; v2 was kept just for the rollout. Checked before
-- dropping: no function, view or other object depends on it, and no code of
-- the repository calls it any more (tests and the CI timing step use v3).
-- Nothing else changes: catalog_count_v2, catalog_discover_metadata and
-- catalog_search_v3 keep their grants.
drop function if exists public.catalog_search_v2(uuid, jsonb, text, integer, numeric, uuid, integer);
