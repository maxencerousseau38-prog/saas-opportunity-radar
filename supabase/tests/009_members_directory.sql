-- Member directory and server-side member invitation (Implementation Blueprint §10, §12).
begin;
select no_plan();
select tests.seed();

select ok(not has_function_privilege('authenticated',
  'public.sor_add_member_by_email(uuid,uuid,text,public.workspace_role)', 'EXECUTE'),
  'browsers cannot call the member RPC');
select ok(not has_function_privilege('anon', 'public.workspace_member_directory(uuid)', 'EXECUTE'),
  'anon cannot read the member directory');

select tests.authenticate_as(tests.id('a4'));
select is((select count(*)::int from public.workspace_member_directory(tests.id('b1'))), 4,
  'a viewer sees the members of the workspace');
select is((select email from public.workspace_member_directory(tests.id('b1')) where user_id = tests.id('a1')),
  'owner@test.local', 'with their e-mail addresses');
select throws_ok($$select * from public.workspace_member_directory(tests.id('b2'))$$, '42501', null,
  'members of another workspace are not listed');

select tests.as_service_role();
select throws_ok($$select public.sor_add_member_by_email(tests.id('b1'), tests.id('a3'), 'newcomer@test.local', 'viewer')$$,
  '42501', null, 'a member cannot invite');
select throws_ok($$select public.sor_add_member_by_email(tests.id('b1'), tests.id('a2'), 'newcomer@test.local', 'owner')$$,
  '22023', null, 'nobody can be invited as owner');
select throws_ok($$select public.sor_add_member_by_email(tests.id('b1'), tests.id('a2'), 'nobody@test.local', 'viewer')$$,
  'P0002', null, 'an unknown e-mail asks the API to send an invitation');
select throws_ok($$select public.sor_add_member_by_email(tests.id('b1'), tests.id('a2'), 'member@test.local', 'viewer')$$,
  '55000', null, 'an existing member cannot be added twice');
select is(public.sor_add_member_by_email(tests.id('b1'), tests.id('a2'), ' Newcomer@Test.local ', 'member'),
  tests.id('a6'), 'an admin adds an existing account, e-mail matched case-insensitively');
select is((select role::text || '/' || invited_by::text from public.workspace_members
            where workspace_id = tests.id('b1') and user_id = tests.id('a6')),
  'member/' || tests.id('a2')::text, 'the membership records its role and inviter');
select is((select count(*)::int from public.audit_logs where action = 'workspace.member_added'), 1,
  'the addition is audited');

select * from finish();
rollback;
