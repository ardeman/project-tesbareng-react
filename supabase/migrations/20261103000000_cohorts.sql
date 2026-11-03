-- Cohorts (ADR-007, PRD §6.9–6.12) and milestone check-ins (PRD §6.10).
-- Tables, indexes, row level security. Writes go through the RPCs in
-- 20261103000100_cohort_rpc.sql; the obligation views come in a later migration.
-- Contract: docs/contract.md (Tables, Cohort milestones).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  tester_id uuid not null references public.testers (id) on delete cascade,
  kind text not null check (kind in ('used_app', 'updated_build', 'still_opted_in')),
  build_id uuid references public.builds (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- 'updated_build' names the build; the other kinds never do.
  check ((kind = 'updated_build') = (build_id is not null))
);

-- Each kind at most once per entry, 'updated_build' once per build (FR-39).
create unique index check_ins_once_key
  on public.check_ins (tester_id, kind, coalesce(build_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index check_ins_build_idx on public.check_ins (build_id) where build_id is not null;

create table public.cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name ~ '\S' and char_length(name) <= 50),
  status text not null default 'forming' check (status in ('forming', 'active', 'closed')),
  day0_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'forming') = (day0_at is null)),
  check ((status = 'closed') = (closed_at is not null))
);

create index cohorts_status_idx on public.cohorts (status);

create table public.cohort_members (
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  app_id uuid references public.apps (id), -- null = pure tester
  joined_at timestamptz not null default now(),
  assigned_at timestamptz, -- when this member's assignments were generated (FR-33b)
  ring_position int check (ring_position >= 0),
  standing text check (standing in ('good', 'owing', 'settled')), -- null until close
  settled_at timestamptz,
  -- One row per member per cohort, so one app per member per cohort (PRD §17 Q7).
  primary key (cohort_id, user_id),
  check (ring_position is null or app_id is not null),
  check ((standing is not distinct from 'settled') = (settled_at is not null))
);

create unique index cohort_members_app_key on public.cohort_members (cohort_id, app_id) where app_id is not null;
create unique index cohort_members_ring_key on public.cohort_members (cohort_id, ring_position) where ring_position is not null;
create index cohort_members_user_idx on public.cohort_members (user_id);
create index cohort_members_app_idx on public.cohort_members (app_id) where app_id is not null;

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  tester_user_id uuid not null,
  app_id uuid not null references public.apps (id),
  assigned_at timestamptz not null default now(), -- base time for this assignment's deadlines
  state text not null default 'open' check (state in ('open', 'reassigned')),
  reassigned_to uuid references public.assignments (id),
  created_at timestamptz not null default now(),
  unique (cohort_id, tester_user_id, app_id),
  -- The assigned member must belong to the cohort.
  foreign key (cohort_id, tester_user_id) references public.cohort_members (cohort_id, user_id) on delete cascade,
  check ((state = 'reassigned') = (reassigned_to is not null))
);

create index assignments_tester_idx on public.assignments (tester_user_id);
create index assignments_app_idx on public.assignments (app_id);

-- Readable only by members of the cohort and the admin (PRD §8.3, FR-50).
create table public.cohort_links (
  cohort_id uuid primary key references public.cohorts (id) on delete cascade,
  whatsapp_group_url text not null check (
    char_length(whatsapp_group_url) <= 500 and whatsapp_group_url ~ '^https://chat\.whatsapp\.com/\S+$'
  ),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Access: read via RLS, never write directly (ADR-004).
-- ---------------------------------------------------------------------------

alter table public.check_ins enable row level security;
alter table public.cohorts enable row level security;
alter table public.cohort_members enable row level security;
alter table public.assignments enable row level security;
alter table public.cohort_links enable row level security;

create policy "check-ins are public" on public.check_ins for select using (true);
create policy "cohorts are public" on public.cohorts for select using (true);
create policy "cohort members are public" on public.cohort_members for select using (true);
create policy "assignments are public" on public.assignments for select using (true);
create policy "cohort link for its members and admin" on public.cohort_links for select using (
  public.is_admin()
  or exists (
    select 1 from public.cohort_members m
    where m.cohort_id = cohort_links.cohort_id and m.user_id = auth.uid()
  )
);

revoke all on public.check_ins, public.cohorts, public.cohort_members, public.assignments, public.cohort_links
  from anon, authenticated;
grant select on public.check_ins, public.cohorts, public.cohort_members, public.assignments, public.cohort_links
  to anon, authenticated;
grant all on public.check_ins, public.cohorts, public.cohort_members, public.assignments, public.cohort_links
  to service_role;

-- Realtime on the app detail page includes check-ins (PRD §9.5).
alter publication supabase_realtime add table public.check_ins;
