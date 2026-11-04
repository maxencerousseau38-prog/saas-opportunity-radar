-- workspace_members: role matrix (Implementation Blueprint §12).
begin;
select no_plan();
select tests.seed();

-- Isolation.
select tests.authenticate_as(tests.id('a6'));
select is((select count(*)::int from public.workspace_members), 0, 'a non-member sees no membership');
select is((select count(*)::int from public.workspaces), 0, 'a non-member sees no workspace');

select tests.authenticate_as(tests.id('a4'));
select is((select count(*)::int from public.workspace_members where workspace_id = tests.id('b1')), 4,
  'a viewer sees the members of their workspace');
select is((select count(*)::int from public.workspace_members where workspace_id = tests.id('b2')), 0,
  'a viewer does not see another workspace');

-- Inserts.
select throws_ok($$insert into public.workspace_members (workspace_id, user_id, role)
                   values (tests.id('b1'), tests.id('a6'), 'member')$$, '42501', null,
  'a viewer cannot add members');
select tests.authenticate_as(tests.id('a3'));
select throws_ok($$insert into public.workspace_members (workspace_id, user_id, role)
                   values (tests.id('b1'), tests.id('a6'), 'member')$$, '42501', null,
  'a member cannot add members');
select tests.authenticate_as(tests.id('a2'));
select throws_ok($$insert into public.workspace_members (workspace_id, user_id, role)
                   values (tests.id('b1'), tests.id('a6'), 'owner')$$, '42501', null,
  'an admin cannot add an owner');
select throws_ok($$insert into public.workspace_members (workspace_id, user_id, role)
                   values (tests.id('b2'), tests.id('a6'), 'member')$$, '42501', null,
  'an admin cannot add members to another workspace');
select lives_ok($$insert into public.workspace_members (workspace_id, user_id, role)
                  values (tests.id('b1'), tests.id('a6'), 'viewer')$$,
  'an admin can add a viewer');

-- Updates.
with u as (update public.workspace_members set role = 'viewer'
           where workspace_id = tests.id('b1') and user_id = tests.id('a3') returning 1)
select is(count(*)::int, 1, 'an admin can change a member''s role') from u;
with u as (update public.workspace_members set role = 'member'
           where workspace_id = tests.id('b1') and user_id = tests.id('a1') returning 1)
select is(count(*)::int, 0, 'an admin cannot change the owner''s role') from u;
with u as (update public.workspace_members set role = 'member'
           where workspace_id = tests.id('b1') and user_id = tests.id('a2') returning 1)
select is(count(*)::int, 0, 'an admin cannot change their own role') from u;
select throws_ok($$update public.workspace_members set role = 'owner'
                   where workspace_id = tests.id('b1') and user_id = tests.id('a3')$$, '42501', null,
  'nobody can be promoted to owner by an update');
select throws_ok($$update public.workspace_members set user_id = tests.id('a5')
                   where workspace_id = tests.id('b1') and user_id = tests.id('a3')$$, '42501', null,
  'the member identity column is immutable');

select tests.authenticate_as(tests.id('a3'));
with u as (update public.workspace_members set role = 'member'
           where workspace_id = tests.id('b1') and user_id = tests.id('a4') returning 1)
select is(count(*)::int, 0, 'a non-admin cannot change roles') from u;

-- Deletes.
select tests.authenticate_as(tests.id('a4'));
with d as (delete from public.workspace_members
           where workspace_id = tests.id('b1') and user_id = tests.id('a3') returning 1)
select is(count(*)::int, 0, 'a viewer cannot remove another member') from d;
with d as (delete from public.workspace_members
           where workspace_id = tests.id('b1') and user_id = tests.id('a4') returning 1)
select is(count(*)::int, 1, 'a viewer can leave the workspace') from d;

select tests.authenticate_as(tests.id('a2'));
with d as (delete from public.workspace_members
           where workspace_id = tests.id('b1') and user_id = tests.id('a1') returning 1)
select is(count(*)::int, 0, 'an admin cannot remove the owner') from d;
with d as (delete from public.workspace_members
           where workspace_id = tests.id('b1') and user_id = tests.id('a6') returning 1)
select is(count(*)::int, 1, 'an admin can remove a non-owner member') from d;

select tests.authenticate_as(tests.id('a1'));
with d as (delete from public.workspace_members
           where workspace_id = tests.id('b1') and user_id = tests.id('a1') returning 1)
select is(count(*)::int, 0, 'the owner cannot leave without transferring ownership') from d;

select * from finish();
rollback;
