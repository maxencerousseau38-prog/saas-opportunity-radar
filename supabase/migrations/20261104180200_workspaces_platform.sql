-- M3 — workspaces, platform and helpers
-- Source: docs/IMPLEMENTATION_BLUEPRINT.md §3 (M3). Keep both in sync.

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ownership lives only here (no owner_id column on workspaces).
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'member',
  invited_by uuid references auth.users(id),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create unique index workspace_single_owner on public.workspace_members(workspace_id) where role = 'owner';
create index workspace_members_user_idx on public.workspace_members(user_id);

create table public.workspace_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  research_preferences jsonb not null default '{}'::jsonb,   -- PRD §14.1, validated by ResearchPreferencesSchema
  ai_preferences jsonb not null default '{}'::jsonb,         -- PRD §14.2, validated by AiPreferencesSchema
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.platform_operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  note text
);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  description text check (description is null or length(description) <= 1000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name),
  unique (id, workspace_id)
);

-- Status column intentionally absent: per-workspace status lives in
-- workspace_product_states [ACCEPTED: PD-04 / ADR-014, approved 4 Nov 2026].
create table public.collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null,
  workspace_id uuid not null,
  product_id uuid not null references public.saas_products(id) on delete cascade,   -- nullable from M6
  notes text check (notes is null or length(notes) <= 5000),
  added_by uuid not null references auth.users(id),
  added_at timestamptz not null default now(),
  foreign key (collection_id, workspace_id)
    references public.collections(id, workspace_id) on delete cascade
);
create unique index collection_items_product_uniq on public.collection_items(collection_id, product_id)
  where product_id is not null;

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  kind text not null default 'catalog' check (kind in ('catalog','discovery')),  -- PRD §4.3 and §6.4
  search_text text check (search_text is null or length(search_text) <= 2000), -- discovery: the prompt
  filters jsonb not null default '{}'::jsonb,   -- validated by CatalogFiltersSchema (§4.3)
  sort_key text not null default 'relevance',
  is_pinned boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_product_states (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_id uuid not null references public.saas_products(id) on delete cascade,
  status public.opportunity_status not null default 'discovered',
  is_favorite boolean not null default false,
  is_hidden boolean not null default false,          -- PRD §3.4 "Masquer le SaaS"
  personal_notes text check (personal_notes is null or length(personal_notes) <= 10000),
  last_viewed_at timestamptz,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, product_id)
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, name),
  unique (id, workspace_id)
);

-- generated_opportunity_id is added in M6.
create table public.tag_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  tag_id uuid not null,
  product_id uuid not null references public.saas_products(id) on delete cascade,
  assigned_by uuid not null references auth.users(id),
  assigned_at timestamptz not null default now(),
  foreign key (tag_id, workspace_id) references public.tags(id, workspace_id) on delete cascade
);
create unique index tag_assignments_product_uniq on public.tag_assignments(tag_id, product_id)
  where product_id is not null;

create table public.catalog_correction_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_id uuid not null references public.saas_products(id) on delete cascade,
  reported_by uuid not null references auth.users(id),
  report_type text not null check (report_type in (
    'wrong_category','incorrect_information','suspected_excluded_category',
    'duplicate','other')),
  field_key text,
  message text not null check (length(message) between 1 and 2000),
  status text not null default 'open' check (status in ('open','accepted','rejected')),
  resolved_by uuid references auth.users(id),
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_kind text not null check (actor_kind in ('user','platform_operator','server','worker')),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  request_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.rate_limit_counters (
  bucket_key text not null,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (bucket_key, window_start)
);

create index collections_workspace_idx on public.collections(workspace_id);
create index collection_items_workspace_idx on public.collection_items(workspace_id);
create index saved_searches_workspace_idx on public.saved_searches(workspace_id, created_at desc);
create index product_states_product_idx on public.workspace_product_states(product_id);
create index tag_assignments_workspace_idx on public.tag_assignments(workspace_id);
create index correction_reports_status_idx on public.catalog_correction_reports(status, created_at);
create index audit_logs_workspace_idx on public.audit_logs(workspace_id, created_at desc);

create trigger workspaces_updated_at before update on public.workspaces
for each row execute function private.set_updated_at();
create trigger collections_updated_at before update on public.collections
for each row execute function private.set_updated_at();
create trigger saved_searches_updated_at before update on public.saved_searches
for each row execute function private.set_updated_at();
create trigger product_states_updated_at before update on public.workspace_product_states
for each row execute function private.set_updated_at();
create trigger workspace_settings_updated_at before update on public.workspace_settings
for each row execute function private.set_updated_at();

-- Membership helpers: created after workspace_members exists.
-- No user-id parameter: the acting user is always auth.uid().
create or replace function private.is_workspace_member(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id and wm.user_id = auth.uid()
  );
$$;

create or replace function private.has_workspace_role(
  p_workspace_id uuid, p_roles public.workspace_role[])
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role = any(p_roles)
  );
$$;

create or replace function private.can_edit(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.has_workspace_role(p_workspace_id, array['owner','admin','member']::public.workspace_role[]);
$$;

create or replace function private.can_admin(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.has_workspace_role(p_workspace_id, array['owner','admin']::public.workspace_role[]);
$$;

revoke all on function private.is_workspace_member(uuid) from public;
revoke all on function private.has_workspace_role(uuid, public.workspace_role[]) from public;
revoke all on function private.can_edit(uuid) from public;
revoke all on function private.can_admin(uuid) from public;
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.has_workspace_role(uuid, public.workspace_role[]) to authenticated;
grant execute on function private.can_edit(uuid) to authenticated;
grant execute on function private.can_admin(uuid) to authenticated;

-- collection_items.workspace_id must match the collection (enforced by the
-- composite FK); tag_assignments likewise via (tag_id, workspace_id).

-- Atomic workspace bootstrap (callable by an authenticated user for
-- themselves only).
create or replace function public.create_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_max integer;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  if p_name is null or length(trim(p_name)) not between 1 and 120 then
    raise exception 'VALIDATION_ERROR: name' using errcode = '22023';
  end if;
  select (value #>> '{}')::integer into v_max
    from public.platform_limits where key = 'max_owned_workspaces_per_user';
  if (select count(*) from public.workspace_members
      where user_id = v_user and role = 'owner') >= coalesce(v_max, 5) then
    raise exception 'LIMIT_EXCEEDED: workspaces' using errcode = '54000';
  end if;

  insert into public.workspaces(name, created_by) values (trim(p_name), v_user) returning id into v_id;
  insert into public.workspace_members(workspace_id, user_id, role) values (v_id, v_user, 'owner');
  insert into public.workspace_settings(workspace_id, updated_by) values (v_id, v_user);
  insert into public.audit_logs(workspace_id, actor_user_id, actor_kind, action, resource_type, resource_id)
    values (v_id, v_user, 'user', 'workspace.create', 'workspace', v_id);
  return v_id;
end;
$$;
revoke all on function public.create_workspace(text) from public, anon;
grant execute on function public.create_workspace(text) to authenticated;
-- Note: platform_limits is created in M4; plpgsql bodies are resolved at
-- call time, so this function may be created in M3.

-- Ownership transfer: server-only (called by the API after authorization).
create or replace function public.sor_transfer_ownership(
  p_workspace_id uuid, p_current_owner uuid, p_new_owner uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.workspace_members
                 where workspace_id = p_workspace_id and user_id = p_current_owner and role = 'owner') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (select 1 from public.workspace_members
                 where workspace_id = p_workspace_id and user_id = p_new_owner) then
    raise exception 'NOT_FOUND: new owner is not a member' using errcode = '22023';
  end if;
  update public.workspace_members set role = 'admin'
    where workspace_id = p_workspace_id and user_id = p_current_owner;
  update public.workspace_members set role = 'owner'
    where workspace_id = p_workspace_id and user_id = p_new_owner;
  insert into public.audit_logs(workspace_id, actor_user_id, actor_kind, action, resource_type, resource_id, metadata)
    values (p_workspace_id, p_current_owner, 'user', 'workspace.transfer_ownership', 'workspace',
            p_workspace_id, jsonb_build_object('new_owner', p_new_owner));
end;
$$;
revoke all on function public.sor_transfer_ownership(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.sor_transfer_ownership(uuid, uuid, uuid) to service_role;

-- RLS and grants
do $$
declare t text;
begin
  foreach t in array array[
    'workspaces','workspace_members','workspace_settings','platform_operators',
    'collections','collection_items','saved_searches','workspace_product_states',
    'tags','tag_assignments','catalog_correction_reports','audit_logs','rate_limit_counters'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;
-- platform_operators, audit_logs, rate_limit_counters: server-only (no grants).

-- workspaces: read by members; rename by owner; creation only via create_workspace().
grant select on public.workspaces to authenticated;
grant update (name) on public.workspaces to authenticated;
create policy workspaces_select on public.workspaces for select to authenticated
  using (private.is_workspace_member(id));
create policy workspaces_update on public.workspaces for update to authenticated
  using (private.has_workspace_role(id, array['owner']::public.workspace_role[]))
  with check (private.has_workspace_role(id, array['owner']::public.workspace_role[]));

-- workspace_members: owner/admin manage non-owner members; nobody changes
-- their own role; owner rows change only through sor_transfer_ownership().
grant select, insert, delete on public.workspace_members to authenticated;
grant update (role) on public.workspace_members to authenticated;
create policy members_select on public.workspace_members for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy members_insert on public.workspace_members for insert to authenticated
  with check (private.can_admin(workspace_id) and role <> 'owner' and user_id <> auth.uid());
create policy members_update on public.workspace_members for update to authenticated
  using (private.can_admin(workspace_id) and role <> 'owner' and user_id <> auth.uid())
  with check (role <> 'owner');
create policy members_delete on public.workspace_members for delete to authenticated
  using (role <> 'owner'
         and (private.can_admin(workspace_id) or user_id = auth.uid()));

-- workspace_settings: members read; owner/admin update.
grant select on public.workspace_settings to authenticated;
grant update (research_preferences, ai_preferences, updated_by) on public.workspace_settings to authenticated;
create policy settings_select on public.workspace_settings for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy settings_update on public.workspace_settings for update to authenticated
  using (private.can_admin(workspace_id))
  with check (private.can_admin(workspace_id) and updated_by = auth.uid());

-- collections
grant select, insert, delete on public.collections to authenticated;
grant update (name, description) on public.collections to authenticated;
create policy collections_select on public.collections for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy collections_insert on public.collections for insert to authenticated
  with check (private.can_edit(workspace_id) and created_by = auth.uid());
create policy collections_update on public.collections for update to authenticated
  using (private.can_edit(workspace_id)) with check (private.can_edit(workspace_id));
create policy collections_delete on public.collections for delete to authenticated
  using (private.can_admin(workspace_id));

-- collection_items
grant select, insert, delete on public.collection_items to authenticated;
grant update (notes) on public.collection_items to authenticated;
create policy collection_items_select on public.collection_items for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy collection_items_insert on public.collection_items for insert to authenticated
  with check (private.can_edit(workspace_id) and added_by = auth.uid()
              and private.is_visible_product(product_id));
create policy collection_items_update on public.collection_items for update to authenticated
  using (private.can_edit(workspace_id)) with check (private.can_edit(workspace_id));
create policy collection_items_delete on public.collection_items for delete to authenticated
  using (private.can_edit(workspace_id));

-- saved_searches (viewers can read only; fixes v1.0 FOR ALL delete hole)
grant select, insert, delete on public.saved_searches to authenticated;
grant update (name, search_text, filters, sort_key, is_pinned) on public.saved_searches to authenticated;
create policy saved_searches_select on public.saved_searches for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy saved_searches_insert on public.saved_searches for insert to authenticated
  with check (private.can_edit(workspace_id) and created_by = auth.uid());
create policy saved_searches_update on public.saved_searches for update to authenticated
  using ((private.can_edit(workspace_id) and created_by = auth.uid()) or private.can_admin(workspace_id))
  with check ((private.can_edit(workspace_id) and created_by = auth.uid()) or private.can_admin(workspace_id));
create policy saved_searches_delete on public.saved_searches for delete to authenticated
  using ((private.can_edit(workspace_id) and created_by = auth.uid()) or private.can_admin(workspace_id));

-- workspace_product_states
grant select, insert, delete on public.workspace_product_states to authenticated;
grant update (status, is_favorite, is_hidden, personal_notes, last_viewed_at, updated_by)
  on public.workspace_product_states to authenticated;
create policy product_states_select on public.workspace_product_states for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy product_states_insert on public.workspace_product_states for insert to authenticated
  with check (private.can_edit(workspace_id) and updated_by = auth.uid()
              and private.is_visible_product(product_id));
create policy product_states_update on public.workspace_product_states for update to authenticated
  using (private.can_edit(workspace_id))
  with check (private.can_edit(workspace_id) and updated_by = auth.uid());
create policy product_states_delete on public.workspace_product_states for delete to authenticated
  using (private.can_admin(workspace_id));

-- tags and tag_assignments
grant select, insert, delete on public.tags to authenticated;
grant update (name, color) on public.tags to authenticated;
create policy tags_select on public.tags for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy tags_insert on public.tags for insert to authenticated
  with check (private.can_edit(workspace_id) and created_by = auth.uid());
create policy tags_update on public.tags for update to authenticated
  using (private.can_edit(workspace_id)) with check (private.can_edit(workspace_id));
create policy tags_delete on public.tags for delete to authenticated
  using (private.can_edit(workspace_id));

grant select, insert, delete on public.tag_assignments to authenticated;
create policy tag_assignments_select on public.tag_assignments for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy tag_assignments_insert on public.tag_assignments for insert to authenticated
  with check (private.can_edit(workspace_id) and assigned_by = auth.uid()
              and (product_id is null or private.is_visible_product(product_id)));
create policy tag_assignments_delete on public.tag_assignments for delete to authenticated
  using (private.can_edit(workspace_id));

-- catalog_correction_reports: members create; only operators resolve (server).
grant select on public.catalog_correction_reports to authenticated;
grant insert (workspace_id, product_id, reported_by, report_type, field_key, message)
  on public.catalog_correction_reports to authenticated;
create policy correction_reports_select on public.catalog_correction_reports for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy correction_reports_insert on public.catalog_correction_reports for insert to authenticated
  with check (private.can_edit(workspace_id) and reported_by = auth.uid()
              and private.is_visible_product(product_id));
