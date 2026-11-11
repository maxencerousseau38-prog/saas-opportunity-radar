-- Ask AI's no-API external handoff. These are workspace-owned research notes,
-- not catalogue evidence and not results produced by the internal AI gateway.
create table public.external_research_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  subject_type text not null check (subject_type in ('product','product_set')),
  subject_snapshot jsonb not null check (jsonb_typeof(subject_snapshot) = 'object'),
  destination text not null check (destination in ('claude','chatgpt','gemini','perplexity')),
  strategy text not null check (strategy in (
    'better_alternative','cross_competitor_pain_intelligence','independent_saas_discovery',
    'france_europe_adaptation','red_team','compare_competitors'
  )),
  included_sections text[] not null default '{}'
    check (included_sections <@ array['features','pricing','feedback','competitors']::text[]),
  context_version text not null,
  context_json jsonb not null check (jsonb_typeof(context_json) = 'object'),
  prompt_version text not null,
  prompt_text text not null check (length(prompt_text) between 1 and 75000),
  answer_text text check (answer_text is null or length(answer_text) <= 50000),
  notes text check (notes is null or length(notes) <= 5000),
  status text not null default 'prompt_ready'
    check (status in ('prompt_ready','response_imported')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'prompt_ready' and answer_text is null)
      or (status = 'response_imported' and answer_text is not null))
);

create index external_research_sessions_workspace_idx
  on public.external_research_sessions(workspace_id, created_at desc, id desc);

alter table public.external_research_sessions enable row level security;
revoke all on table public.external_research_sessions from anon, authenticated;
grant select on table public.external_research_sessions to authenticated;
grant all on table public.external_research_sessions to service_role;

create policy external_research_sessions_select
  on public.external_research_sessions for select to authenticated
  using (private.is_workspace_member(workspace_id));

create trigger external_research_sessions_updated_at
  before update on public.external_research_sessions
  for each row execute function private.set_updated_at();
