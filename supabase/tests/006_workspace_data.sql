-- Workspace-owned tables: per-role behaviour and isolation (Implementation Blueprint §12).
begin;
select no_plan();
select tests.seed();

-- Fixtures owned by the member (a3) and by another workspace.
select tests.as_owner_role();
insert into public.collections (id, workspace_id, name, created_by) values
  (tests.id('c10'), tests.id('b1'), 'Best', tests.id('a3')),
  (tests.id('c20'), tests.id('b2'), 'Other workspace', tests.id('a5'));
insert into public.saved_searches (id, workspace_id, name, created_by) values
  (tests.id('5501'), tests.id('b1'), 'Search by member', tests.id('a3')),
  (tests.id('5502'), tests.id('b1'), 'Search by admin', tests.id('a2'));
insert into public.tags (id, workspace_id, name, created_by) values
  (tests.id('7a01'), tests.id('b1'), 'MarTech', tests.id('a3'));

-- ---------------------------------------------------------------- collections
select tests.authenticate_as(tests.id('a3'));
select lives_ok($$insert into public.collections (workspace_id, name, created_by)
                  values (tests.id('b1'), 'US to France', tests.id('a3'))$$,
  'a member can create a collection');
select throws_ok($$insert into public.collections (workspace_id, name, created_by)
                   values (tests.id('b1'), 'Spoofed', tests.id('a2'))$$, '42501', null,
  'a collection cannot be created on behalf of someone else');
with u as (update public.collections set name = 'Best ones' where id = tests.id('c10') returning 1)
select is(count(*)::int, 1, 'a member can rename a collection') from u;
select throws_ok($$update public.collections set workspace_id = tests.id('b2') where id = tests.id('c10')$$,
  '42501', null, 'a collection cannot be moved to another workspace');
with d as (delete from public.collections where id = tests.id('c10') returning 1)
select is(count(*)::int, 0, 'a member cannot delete a collection') from d;
select is((select count(*)::int from public.collections where id = tests.id('c20')), 0,
  'collections of another workspace are invisible');

select tests.authenticate_as(tests.id('a4'));
select throws_ok($$insert into public.collections (workspace_id, name, created_by)
                   values (tests.id('b1'), 'Viewer list', tests.id('a4'))$$, '42501', null,
  'a viewer cannot create a collection');
with u as (update public.collections set name = 'Hijacked' where id = tests.id('c10') returning 1)
select is(count(*)::int, 0, 'a viewer cannot rename a collection') from u;

select tests.authenticate_as(tests.id('a6'));
select throws_ok($$insert into public.collections (workspace_id, name, created_by)
                   values (tests.id('b1'), 'Intruder', tests.id('a6'))$$, '42501', null,
  'a non-member cannot create a collection');

-- ----------------------------------------------------------- collection_items
select tests.authenticate_as(tests.id('a3'));
select lives_ok($$insert into public.collection_items (collection_id, workspace_id, product_id, added_by)
                  values (tests.id('c10'), tests.id('b1'), tests.id('d1'), tests.id('a3'))$$,
  'a member can add a visible product to a collection');
select throws_ok($$insert into public.collection_items (collection_id, workspace_id, product_id, added_by)
                   values (tests.id('c10'), tests.id('b1'), tests.id('d3'), tests.id('a3'))$$, '42501', null,
  'an excluded product cannot be added to a collection');
with u as (update public.collection_items set notes = 'Worth a look' where collection_id = tests.id('c10') returning 1)
select is(count(*)::int, 1, 'a member can edit collection notes') from u;

select tests.authenticate_as(tests.id('a4'));
with u as (update public.collection_items set notes = 'x' where collection_id = tests.id('c10') returning 1)
select is(count(*)::int, 0, 'a viewer cannot edit collection notes') from u;

select tests.as_owner_role();
select throws_ok($$insert into public.collection_items (collection_id, workspace_id, product_id, added_by)
                   values (tests.id('c10'), tests.id('b2'), tests.id('d2'), tests.id('a3'))$$, '23503', null,
  'a collection item always belongs to its collection''s workspace');

-- ------------------------------------------------------------- saved_searches
select tests.authenticate_as(tests.id('a4'));
with d as (delete from public.saved_searches where workspace_id = tests.id('b1') returning 1)
select is(count(*)::int, 0, 'a viewer cannot delete saved searches') from d;
select throws_ok($$insert into public.saved_searches (workspace_id, name, created_by)
                   values (tests.id('b1'), 'Viewer search', tests.id('a4'))$$, '42501', null,
  'a viewer cannot create saved searches');

select tests.authenticate_as(tests.id('a3'));
with u as (update public.saved_searches set name = 'Mine' where id = tests.id('5501') returning 1)
select is(count(*)::int, 1, 'a member can edit their own saved search') from u;
with u as (update public.saved_searches set name = 'Not mine' where id = tests.id('5502') returning 1)
select is(count(*)::int, 0, 'a member cannot edit someone else''s saved search') from u;
with d as (delete from public.saved_searches where id = tests.id('5502') returning 1)
select is(count(*)::int, 0, 'a member cannot delete someone else''s saved search') from d;

select tests.authenticate_as(tests.id('a2'));
with d as (delete from public.saved_searches where id = tests.id('5501') returning 1)
select is(count(*)::int, 1, 'an admin can delete any saved search') from d;

-- --------------------------------------------------- workspace_product_states
select tests.authenticate_as(tests.id('a3'));
select lives_ok($$insert into public.workspace_product_states (workspace_id, product_id, is_favorite, updated_by)
                  values (tests.id('b1'), tests.id('d1'), true, tests.id('a3'))$$,
  'a member can favourite a visible product');
select throws_ok($$insert into public.workspace_product_states (workspace_id, product_id, updated_by)
                   values (tests.id('b1'), tests.id('d2'), tests.id('a3'))$$, '42501', null,
  'a candidate product cannot be tracked in a workspace');
with u as (update public.workspace_product_states set status = 'to_research', updated_by = tests.id('a3')
           where product_id = tests.id('d1') returning 1)
select is(count(*)::int, 1, 'a member can change a product status') from u;
with d as (delete from public.workspace_product_states where product_id = tests.id('d1') returning 1)
select is(count(*)::int, 0, 'a member cannot delete a product state') from d;

select tests.authenticate_as(tests.id('a4'));
with u as (update public.workspace_product_states set is_hidden = true, updated_by = tests.id('a4')
           where product_id = tests.id('d1') returning 1)
select is(count(*)::int, 0, 'a viewer cannot change a product state') from u;

-- -------------------------------------------------------- tags and assignments
select tests.authenticate_as(tests.id('a3'));
select lives_ok($$insert into public.tag_assignments (workspace_id, tag_id, product_id, assigned_by)
                  values (tests.id('b1'), tests.id('7a01'), tests.id('d1'), tests.id('a3'))$$,
  'a member can tag a visible product');
select throws_ok($$update public.tag_assignments set assigned_by = tests.id('a2')$$, '42501', null,
  'tag assignments are immutable');

select tests.authenticate_as(tests.id('a4'));
select throws_ok($$insert into public.tags (workspace_id, name, created_by)
                   values (tests.id('b1'), 'Viewer tag', tests.id('a4'))$$, '42501', null,
  'a viewer cannot create tags');

-- ------------------------------------------------- catalog_correction_reports
select tests.authenticate_as(tests.id('a3'));
select lives_ok($$insert into public.catalog_correction_reports
                    (workspace_id, product_id, reported_by, report_type, message)
                  values (tests.id('b1'), tests.id('d1'), tests.id('a3'), 'wrong_category', 'Not analytics')$$,
  'a member can report incorrect information');
select throws_ok($$insert into public.catalog_correction_reports
                     (workspace_id, product_id, reported_by, report_type, message, status)
                   values (tests.id('b1'), tests.id('d1'), tests.id('a3'), 'other', 'x', 'accepted')$$,
  '42501', null, 'a member cannot set the resolution status');
select throws_ok($$update public.catalog_correction_reports set status = 'accepted'$$, '42501', null,
  'only the platform operator resolves reports');

-- ---------------------------------------------------- settings and workspaces
select tests.authenticate_as(tests.id('a3'));
with u as (update public.workspace_settings set ai_preferences = '{}'::jsonb, updated_by = tests.id('a3')
           where workspace_id = tests.id('b1') returning 1)
select is(count(*)::int, 0, 'a member cannot edit workspace settings') from u;

select tests.authenticate_as(tests.id('a2'));
with u as (update public.workspace_settings set ai_preferences = '{}'::jsonb, updated_by = tests.id('a2')
           where workspace_id = tests.id('b1') returning 1)
select is(count(*)::int, 1, 'an admin can edit workspace settings') from u;
with u as (update public.workspaces set name = 'Renamed' where id = tests.id('b1') returning 1)
select is(count(*)::int, 0, 'an admin cannot rename the workspace') from u;

select tests.authenticate_as(tests.id('a1'));
with u as (update public.workspaces set name = 'Renamed' where id = tests.id('b1') returning 1)
select is(count(*)::int, 1, 'the owner can rename the workspace') from u;

select * from finish();
rollback;
