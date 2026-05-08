-- Migration 0021 — Coaches (PT) e Nutricionistas (Fase 9 + 10)

create type pr_coach_type as enum ('personal_trainer', 'nutritionist');
create type pr_coach_status as enum ('pending', 'approved', 'suspended');

create table if not exists public.pr_coaches (
  user_id uuid primary key references auth.users(id) on delete cascade,
  coach_type pr_coach_type not null,
  display_name text not null,
  bio text,
  city text,
  state text,
  cref text, -- registro CREF (PT) ou CRN (Nutri)
  specialties text[] default '{}',
  status pr_coach_status not null default 'pending',
  hourly_rate_cents int, -- preco hora aula em centavos
  monthly_subscription_cents int default 4990, -- R$49.90/mes
  max_athletes_free int default 3,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

alter table public.pr_coaches enable row level security;

create policy "coaches read public approved" on public.pr_coaches
  for select using (status = 'approved');
create policy "coaches read own" on public.pr_coaches
  for select using (auth.uid() = user_id);
create policy "coaches upsert own" on public.pr_coaches
  for insert with check (auth.uid() = user_id);
create policy "coaches update own" on public.pr_coaches
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Vinculo coach <-> athlete
create table if not exists public.pr_coach_athletes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  coach_type pr_coach_type not null,
  started_at date not null default current_date,
  ended_at date,
  notes text,
  created_at timestamptz not null default now(),
  unique (coach_id, athlete_id, coach_type)
);

create index if not exists idx_coach_athletes_coach on public.pr_coach_athletes (coach_id);
create index if not exists idx_coach_athletes_athlete on public.pr_coach_athletes (athlete_id);

alter table public.pr_coach_athletes enable row level security;

create policy "ca read own" on public.pr_coach_athletes
  for select using (auth.uid() = coach_id or auth.uid() = athlete_id);
create policy "ca insert by coach" on public.pr_coach_athletes
  for insert with check (auth.uid() = coach_id);
create policy "ca update by coach" on public.pr_coach_athletes
  for update using (auth.uid() = coach_id) with check (auth.uid() = coach_id);
create policy "ca delete by either" on public.pr_coach_athletes
  for delete using (auth.uid() = coach_id or auth.uid() = athlete_id);

-- Convites por token
create table if not exists public.pr_coach_invites (
  token text primary key default encode(gen_random_bytes(16), 'hex'),
  coach_id uuid not null references auth.users(id) on delete cascade,
  coach_type pr_coach_type not null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  redeemed_by uuid references auth.users(id),
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.pr_coach_invites enable row level security;

create policy "invites read by token (anon ok)" on public.pr_coach_invites
  for select using (true);
create policy "invites insert by coach" on public.pr_coach_invites
  for insert with check (auth.uid() = coach_id);
create policy "invites redeem any auth" on public.pr_coach_invites
  for update using (auth.uid() is not null) with check (auth.uid() is not null);

-- Workout plan (Fase 9)
create table if not exists public.pr_workout_plans (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  week_start_date date not null,
  status text not null default 'active', -- active | archived
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workout_plans_athlete on public.pr_workout_plans (athlete_id, week_start_date desc);
create index if not exists idx_workout_plans_coach on public.pr_workout_plans (coach_id);

alter table public.pr_workout_plans enable row level security;

create policy "wp read own" on public.pr_workout_plans
  for select using (auth.uid() = coach_id or auth.uid() = athlete_id);
create policy "wp insert by coach" on public.pr_workout_plans
  for insert with check (auth.uid() = coach_id);
create policy "wp update by coach" on public.pr_workout_plans
  for update using (auth.uid() = coach_id) with check (auth.uid() = coach_id);
create policy "wp delete by coach" on public.pr_workout_plans
  for delete using (auth.uid() = coach_id);

-- Exercicios do plano
create table if not exists public.pr_workout_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.pr_workout_plans(id) on delete cascade,
  day_index int not null check (day_index >= 0 and day_index < 7), -- 0=seg, 6=dom
  order_idx int not null default 0,
  exercise_name text not null,
  sets int,
  reps text, -- "5" ou "8-10" ou "AMRAP"
  weight_kg numeric(6, 2),
  rpe int,
  rest_sec int,
  notes text,
  done_at timestamptz, -- athlete marca check-in
  done_rpe int -- RPE percebido
);

create index if not exists idx_we_plan_day on public.pr_workout_exercises (plan_id, day_index, order_idx);

alter table public.pr_workout_exercises enable row level security;

create policy "we read by plan owner/athlete" on public.pr_workout_exercises
  for select using (
    exists (
      select 1 from public.pr_workout_plans p
      where p.id = pr_workout_exercises.plan_id
        and (auth.uid() = p.coach_id or auth.uid() = p.athlete_id)
    )
  );
create policy "we insert by coach" on public.pr_workout_exercises
  for insert with check (
    exists (
      select 1 from public.pr_workout_plans p
      where p.id = plan_id and auth.uid() = p.coach_id
    )
  );
create policy "we update by coach or check-in by athlete" on public.pr_workout_exercises
  for update using (
    exists (
      select 1 from public.pr_workout_plans p
      where p.id = pr_workout_exercises.plan_id
        and (auth.uid() = p.coach_id or auth.uid() = p.athlete_id)
    )
  );
create policy "we delete by coach" on public.pr_workout_exercises
  for delete using (
    exists (
      select 1 from public.pr_workout_plans p
      where p.id = plan_id and auth.uid() = p.coach_id
    )
  );

-- Meal plan (Fase 10 — nutri)
create table if not exists public.pr_meal_plans (
  id uuid primary key default gen_random_uuid(),
  nutri_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  start_date date not null,
  kcal_target int,
  protein_g_target int,
  carbs_g_target int,
  fat_g_target int,
  notes text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pr_meal_plans enable row level security;

create policy "mp read own" on public.pr_meal_plans
  for select using (auth.uid() = nutri_id or auth.uid() = athlete_id);
create policy "mp insert by nutri" on public.pr_meal_plans
  for insert with check (auth.uid() = nutri_id);
create policy "mp update by nutri" on public.pr_meal_plans
  for update using (auth.uid() = nutri_id) with check (auth.uid() = nutri_id);
create policy "mp delete by nutri" on public.pr_meal_plans
  for delete using (auth.uid() = nutri_id);
