-- Hacker News as a catalog source (PD-42, product-owner instruction of
-- 13 November 2026: "Active Hacker News", catalog collection chosen).
-- The Y Combinator Terms of Use were read on 10 November 2026 (official page
-- frozen in docs/sources/terms, review in docs/DATA_SOURCES.md): the official
-- API is the means Hacker News makes available; personal, non-commercial use;
-- metadata only (no username, no user text). The source becomes 'integrated'
-- with its terms review date, like Wikidata and Uneed.
--
-- It stays DISABLED here, in every environment: a source is enabled only on
-- the product owner's go-ahead per environment (docs/DATA_SOURCES.md, rule 5).
-- Enabling it also lets AI Discovery use it (PD-28): CI and local stacks keep
-- it disabled so that no test calls the real API.
update public.sources
   set integration_status = 'integrated',
       terms_reviewed_at = '2026-11-10 17:21:00+00',
       terms_review_notes = 'Official API (github.com/HackerNews/API, MIT repository; no data licence stated). Y Combinator Terms of Use (www.ycombinator.com/legal, read 10 Nov 2026): no copying, scraping or data mining of the Site "except as expressly authorized"; no commercial use of any portion of the Site. The official API is the means made available: personal, non-commercial use only. Metadata only: story id, name and tagline from a Show HN title, the product''s own site, year, HN item page; never the username (by), user text or comments. Catalog collection (PD-42): latest Show HN stories (at most 200), 60 requests a minute; a story is kept only with a stated name matching its own website domain. Discovery search (PD-28).'
 where source_key = 'hacker_news';
