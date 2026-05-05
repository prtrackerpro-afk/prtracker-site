-- PR Tracker — "PR app" (athlete-facing PR log + box leaderboards)
-- Generated 2026-05-04
--
-- Convention: every table prefixed `pr_` so it never collides with
-- admin/ecommerce tables. Athletes are separate from admin users
-- (admin uses ADMIN_EMAILS allowlist; athletes use plain Supabase auth).
--
-- See docs/PR_TRACKER_MVP.md for the product spec.

-- =============================================================================
-- Boxes (CrossFit/strength gyms — public list, opt-in membership)
-- =============================================================================

create table if not exists public.pr_boxes (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  city text,
  state text,
  owner_user_id uuid references auth.users(id) on delete set null,
  coupon_code text,
  instagram_handle text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_pr_boxes_owner on public.pr_boxes (owner_user_id);

-- =============================================================================
-- Athletes (profile data, 1-1 with auth.users)
-- =============================================================================

create table if not exists public.pr_athletes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  instagram_handle text,
  primary_box_id uuid references public.pr_boxes(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_pr_athletes_box on public.pr_athletes (primary_box_id);

-- =============================================================================
-- Records (the actual PRs)
-- =============================================================================
-- exercise enum mirrors the My PR Set catalog (Brand Bible). Keep in sync
-- with src/lib/pr/exercises.ts EXERCISES array.

create table if not exists public.pr_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise text not null check (exercise in (
    'back_squat','bench_press','clean','clean_and_jerk','deadlift',
    'front_squat','hang_clean','hang_power_clean','overhead_squat',
    'power_clean','power_snatch','push_jerk','push_press',
    'shoulder_press','snatch','split_jerk','squat_clean','squat_snatch',
    'sumo_deadlift','thruster'
  )),
  weight_kg numeric(6,2) not null check (weight_kg > 0 and weight_kg < 1000),
  performed_at date not null default current_date,
  photo_url text,
  notes text,
  -- True when this record beat the athlete's previous best for this exercise.
  -- Set by the API (src/lib/pr/db.ts) at insert time, not by a trigger,
  -- because the celebration UX depends on knowing the *previous* record.
  is_personal_record boolean not null default false,
  -- If logged at a box, attaches it for leaderboard purposes.
  box_id uuid references public.pr_boxes(id) on delete set null,
  -- Free-text id of the corresponding /produto/... checkout (if the athlete
  -- converted this PR into a trophy). Filled by the trophy-purchase callback.
  trophy_purchase_id text,
  created_at timestamptz default now()
);
create index if not exists idx_pr_records_user_date on public.pr_records (user_id, performed_at desc);
create index if not exists idx_pr_records_user_exercise on public.pr_records (user_id, exercise, weight_kg desc);
create index if not exists idx_pr_records_box on public.pr_records (box_id, performed_at desc);

-- =============================================================================
-- Box memberships
-- =============================================================================

create table if not exists public.pr_box_members (
  box_id uuid not null references public.pr_boxes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (box_id, user_id)
);
create index if not exists idx_pr_box_members_user on public.pr_box_members (user_id);

-- =============================================================================
-- Row Level Security
-- =============================================================================
-- V1 model: athletes own their data. Box-level reads (leaderboards) go
-- through SECURITY DEFINER functions or service-role queries to avoid
-- RLS recursion (querying pr_box_members within its own policy).
--
-- pr_boxes is public-readable (the list of available boxes is not sensitive).

alter table public.pr_athletes enable row level security;
alter table public.pr_records enable row level security;
alter table public.pr_boxes enable row level security;
alter table public.pr_box_members enable row level security;

-- pr_athletes: read/write own profile only
create policy "athletes read own profile" on public.pr_athletes
  for select using (user_id = auth.uid());
create policy "athletes insert own profile" on public.pr_athletes
  for insert with check (user_id = auth.uid());
create policy "athletes update own profile" on public.pr_athletes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- pr_records: full CRUD on own records
create policy "athletes read own records" on public.pr_records
  for select using (user_id = auth.uid());
create policy "athletes write own records" on public.pr_records
  for insert with check (user_id = auth.uid());
create policy "athletes update own records" on public.pr_records
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "athletes delete own records" on public.pr_records
  for delete using (user_id = auth.uid());

-- pr_boxes: anyone can read; only owner can update; inserts via service role
create policy "anyone reads boxes" on public.pr_boxes
  for select using (true);
create policy "owner updates own box" on public.pr_boxes
  for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

-- pr_box_members: athlete manages own memberships
create policy "athletes read own memberships" on public.pr_box_members
  for select using (user_id = auth.uid());
create policy "athletes manage own membership" on public.pr_box_members
  for insert with check (user_id = auth.uid());
create policy "athletes leave own membership" on public.pr_box_members
  for delete using (user_id = auth.uid());

-- =============================================================================
-- Leaderboard helper (SECURITY DEFINER, bypasses RLS for box-scoped reads)
-- =============================================================================
-- Returns the top weight_kg per athlete per exercise within a box, so a
-- public box page can render a leaderboard without leaking other athletes'
-- non-PR records or cross-box data.

create or replace function public.pr_box_leaderboard(
  p_box_slug text,
  p_exercise text default null,
  p_limit int default 50
) returns table (
  user_id uuid,
  display_name text,
  instagram_handle text,
  exercise text,
  weight_kg numeric,
  performed_at date,
  record_id uuid
)
language sql
security definer
set search_path = public
as $$
  with box as (select id from public.pr_boxes where slug = p_box_slug),
       best as (
    select distinct on (r.user_id, r.exercise)
      r.user_id, r.exercise, r.weight_kg, r.performed_at, r.id as record_id
    from public.pr_records r
    join box on r.box_id = box.id
    where (p_exercise is null or r.exercise = p_exercise)
    order by r.user_id, r.exercise, r.weight_kg desc, r.performed_at asc
  )
  select b.user_id, a.display_name, a.instagram_handle,
         b.exercise, b.weight_kg, b.performed_at, b.record_id
  from best b
  left join public.pr_athletes a on a.user_id = b.user_id
  order by b.weight_kg desc
  limit p_limit;
$$;

grant execute on function public.pr_box_leaderboard(text, text, int) to anon, authenticated;
