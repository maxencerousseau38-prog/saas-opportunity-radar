-- Atomic workspace bootstrap and ownership transfer (CLAUDE.md §7.10–11).
begin;
select no_plan();
select tests.seed();

-- Bootstrap by a signed-in user.
select tests.authenticate_as(tests.id('a6'));
select lives_ok($$select public.create_workspace('Mon espace')$$,
  'a signed-in user can create a workspace');
select throws_ok($$select public.create_workspace('   ')$$, '22023', null,
  'an empty workspace name is rejected');
select throws_ok($$insert into public.workspaces (name, created_by) values ('Direct', tests.id('a6'))$$,
  '42501', null, 'workspaces cannot be inserted directly');
select throws_ok($$select public.sor_transfer_ownership(tests.id('b1'), tests.id('a1'), tests.id('a6'))$$,
  '42501', null, 'the browser role cannot transfer ownership');

select tests.as_owner_role();
select is((select count(*)::int from public.workspaces where created_by = tests.id('a6') and name = 'Mon espace'), 1,
  'the workspace row exists');
select is((select role::text from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
            where w.created_by = tests.id('a6') and w.name = 'Mon espace' and m.user_id = tests.id('a6')),
  'owner', 'the creator is the owner, in the same transaction');
select is((select count(*)::int from public.workspace_settings s join public.workspaces w on w.id = s.workspace_id
            where w.created_by = tests.id('a6')), 1, 'workspace settings are initialised');
select is((select count(*)::int from public.audit_logs where actor_user_id = tests.id('a6')
            and action = 'workspace.create'), 1, 'the creation is audit-logged');

-- Limit on owned workspaces (platform_limits.max_owned_workspaces_per_user = 5).
select tests.authenticate_as(tests.id('a6'));
select public.create_workspace('Espace ' || g) from generate_series(2, 5) as g;
select throws_ok($$select public.create_workspace('Espace 6')$$, '54000', null,
  'a user cannot own more workspaces than the platform limit');

-- Missing identity.
select tests.as_owner_role();
select set_config('request.jwt.claims', '', true);
select set_config('role', 'authenticated', true);
select throws_ok($$select public.create_workspace('Sans identité')$$, '28000', null,
  'bootstrap requires an authenticated identity');

-- Anonymous role.
select tests.as_anon();
select throws_ok($$select public.create_workspace('Anonyme')$$, '42501', null,
  'anon cannot call the bootstrap function');

-- Single owner and ownership transfer (server role path).
select tests.as_owner_role();
select throws_ok($$insert into public.workspace_members (workspace_id, user_id, role)
                   values (tests.id('b1'), tests.id('a6'), 'owner')$$,
  '23505', null, 'a workspace has a single owner');
select throws_ok($$select public.sor_transfer_ownership(tests.id('b1'), tests.id('a2'), tests.id('a3'))$$,
  '42501', null, 'only the current owner can transfer ownership');
select lives_ok($$select public.sor_transfer_ownership(tests.id('b1'), tests.id('a1'), tests.id('a2'))$$,
  'the owner can transfer ownership to a member');
select is((select role::text from public.workspace_members where workspace_id = tests.id('b1') and user_id = tests.id('a2')),
  'owner', 'the new owner holds the owner role');
select is((select role::text from public.workspace_members where workspace_id = tests.id('b1') and user_id = tests.id('a1')),
  'admin', 'the previous owner becomes admin');

select * from finish();
rollback;
