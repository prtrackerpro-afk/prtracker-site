-- Migration 0018 — Macros / dieta diaria (Fase 6 do roadmap 1350 ciclos)
-- Athlete tracker standalone (sem nutri obrigatorio)

-- =================================================================
-- Banco de alimentos (publico, read-only pra todos)
-- =================================================================
create table if not exists public.pr_food_db (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  -- Por 100g
  kcal numeric(8, 2) not null,
  protein_g numeric(6, 2) not null default 0,
  carbs_g numeric(6, 2) not null default 0,
  fat_g numeric(6, 2) not null default 0,
  fiber_g numeric(6, 2) default 0,
  -- Tags pra filtros (vegano, vegetariano, sem-lactose, sem-gluten, etc)
  tags text[] default '{}',
  -- Categoria (carne, fruta, suplemento, etc)
  category text,
  -- Status: pending = sugerido por user, approved = revisado por admin
  status text not null default 'approved',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_food_db_name on public.pr_food_db using gin (to_tsvector('portuguese', name));
create index if not exists idx_food_db_category on public.pr_food_db (category);

-- RLS — read public, write owner-pending only
alter table public.pr_food_db enable row level security;

create policy "food_db read public" on public.pr_food_db
  for select using (status = 'approved');
create policy "food_db read own pending" on public.pr_food_db
  for select using (auth.uid() = created_by);
create policy "food_db insert pending" on public.pr_food_db
  for insert with check (auth.uid() = created_by and status = 'pending');

-- =================================================================
-- Meal log (refeicoes do athlete)
-- =================================================================
create type pr_meal_type as enum (
  'breakfast', 'morning_snack', 'lunch', 'afternoon_snack',
  'dinner', 'evening_snack', 'pre_workout', 'post_workout'
);

create table if not exists public.pr_meal_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_type pr_meal_type not null,
  consumed_at timestamptz not null default now(),
  food_id uuid references public.pr_food_db(id),
  -- Custom food (sem ID na food_db)
  custom_name text,
  custom_kcal numeric(8, 2),
  custom_protein_g numeric(6, 2),
  custom_carbs_g numeric(6, 2),
  custom_fat_g numeric(6, 2),
  -- Quantidade em gramas (ou ml pra liquidos)
  qty_g numeric(8, 2) not null,
  notes text,
  -- Foto opcional (Supabase Storage URL)
  photo_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_meal_log_user_consumed on public.pr_meal_log (user_id, consumed_at desc);

alter table public.pr_meal_log enable row level security;

create policy "meal_log owner all" on public.pr_meal_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =================================================================
-- Diet targets (target diario de macros do athlete)
-- =================================================================
create table if not exists public.pr_diet_targets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  kcal_target int not null default 2200,
  protein_g_target int not null default 150,
  carbs_g_target int not null default 250,
  fat_g_target int not null default 70,
  water_ml_target int not null default 2500,
  goal text default 'maintain', -- bulk | cut | maintain
  updated_at timestamptz not null default now()
);

alter table public.pr_diet_targets enable row level security;

create policy "diet_targets owner all" on public.pr_diet_targets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =================================================================
-- Hidratacao log (log de copos d'agua)
-- =================================================================
create table if not exists public.pr_water_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consumed_at timestamptz not null default now(),
  qty_ml int not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_water_log_user_consumed on public.pr_water_log (user_id, consumed_at desc);

alter table public.pr_water_log enable row level security;

create policy "water_log owner all" on public.pr_water_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =================================================================
-- Body weight log (log peso semanal)
-- =================================================================
create table if not exists public.pr_body_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_at date not null,
  weight_kg numeric(5, 2),
  body_fat_pct numeric(4, 2),
  lean_mass_kg numeric(5, 2),
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, measured_at)
);

alter table public.pr_body_log enable row level security;

create policy "body_log owner all" on public.pr_body_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =================================================================
-- Seed inicial: 30 alimentos brasileiros mais comuns
-- =================================================================
insert into public.pr_food_db (name, kcal, protein_g, carbs_g, fat_g, fiber_g, category) values
  ('Arroz branco cozido', 130, 2.7, 28, 0.3, 0.4, 'cereal'),
  ('Arroz integral cozido', 124, 2.6, 25.8, 1.0, 2.7, 'cereal'),
  ('Feijao preto cozido', 132, 8.7, 23.7, 0.5, 8.4, 'leguminosa'),
  ('Feijao carioca cozido', 76, 4.8, 13.6, 0.5, 8.5, 'leguminosa'),
  ('Frango grelhado peito', 165, 31, 0, 3.6, 0, 'carne'),
  ('Patinho bovino grelhado', 192, 32, 0, 6.2, 0, 'carne'),
  ('Tilapia grelhada', 128, 26, 0, 2.7, 0, 'peixe'),
  ('Salmao grelhado', 208, 25, 0, 12, 0, 'peixe'),
  ('Ovo de galinha cozido', 155, 13, 1.1, 11, 0, 'ovo'),
  ('Whey protein (1 scoop 30g)', 120, 24, 3, 1.5, 0, 'suplemento'),
  ('Creatina (5g)', 0, 0, 0, 0, 0, 'suplemento'),
  ('Banana prata', 89, 1.3, 22.8, 0.3, 2.6, 'fruta'),
  ('Maca fuji', 52, 0.3, 13.8, 0.2, 2.4, 'fruta'),
  ('Batata doce cozida', 86, 1.6, 20.1, 0.1, 3, 'raiz'),
  ('Batata inglesa cozida', 87, 1.9, 20, 0.1, 1.8, 'raiz'),
  ('Aveia em flocos', 389, 17, 66, 7, 11, 'cereal'),
  ('Pao frances', 300, 8, 58, 3, 2.3, 'paes'),
  ('Pao integral', 247, 13, 41, 4, 7, 'paes'),
  ('Leite integral', 61, 3.2, 4.8, 3.3, 0, 'laticinio'),
  ('Leite desnatado', 35, 3.4, 5, 0.1, 0, 'laticinio'),
  ('Iogurte natural integral', 51, 4.1, 4.7, 1.5, 0, 'laticinio'),
  ('Queijo minas frescal', 264, 17.4, 3.2, 20.1, 0, 'laticinio'),
  ('Queijo mussarela', 280, 22, 2.5, 21, 0, 'laticinio'),
  ('Castanha do Para', 656, 14.3, 12.3, 66, 7.5, 'oleaginosa'),
  ('Amendoim cru', 567, 26, 16, 49, 8.5, 'oleaginosa'),
  ('Pasta de amendoim', 588, 25, 20, 50, 6, 'oleaginosa'),
  ('Azeite extra virgem', 884, 0, 0, 100, 0, 'gordura'),
  ('Acai polpa', 60, 0.8, 6.2, 3.9, 2.6, 'fruta'),
  ('Brocolis cozido', 35, 2.4, 7.2, 0.4, 3.3, 'verdura'),
  ('Alface', 15, 1.4, 2.9, 0.2, 1.3, 'verdura')
on conflict do nothing;
-- Migration 0019 — Tutorial onboarding (Fase 7)

create table if not exists public.pr_tutorial_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Steps completados (array de IDs)
  steps_completed text[] not null default '{}',
  -- Tutorial finalizado totalmente?
  completed_at timestamptz,
  -- Skipped totalmente?
  skipped_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.pr_tutorial_progress enable row level security;

create policy "tutorial_progress owner all" on public.pr_tutorial_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Migration 0020 — Fliperama (Fase 8)

create table if not exists public.pr_arcade_games (
  id text primary key, -- 'barbell_bounce' | 'shaker_mixer' | 'wod_sprint'
  name text not null,
  description text,
  active boolean default true,
  created_at timestamptz not null default now()
);

insert into public.pr_arcade_games (id, name, description) values
  ('barbell_bounce', 'Barbell Bounce', 'Endless runner com tema lifting'),
  ('shaker_mixer', 'Protein Shaker', 'Match-3 / puzzle de ingredientes'),
  ('wod_sprint', 'WOD Sprint', 'Battle royale fitness 8 jogadores')
on conflict do nothing;

create table if not exists public.pr_arcade_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null references public.pr_arcade_games(id),
  score int not null check (score >= 0),
  duration_sec int,
  payload jsonb default '{}',
  played_at timestamptz not null default now()
);

create index if not exists idx_arcade_scores_game_score on public.pr_arcade_scores (game_id, score desc);
create index if not exists idx_arcade_scores_user on public.pr_arcade_scores (user_id, played_at desc);

alter table public.pr_arcade_scores enable row level security;

create policy "arcade_scores read public" on public.pr_arcade_scores
  for select using (true);
create policy "arcade_scores insert own" on public.pr_arcade_scores
  for insert with check (auth.uid() = user_id);
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
-- Migration 0022 — Achievements + Quests (Fase 12)

create table if not exists public.pr_achievements (
  id text primary key, -- 'first_pr', 'streak_7d', 'deadlift_2bw', etc
  name text not null,
  description text,
  icon text,
  xp_reward int not null default 50
);

insert into public.pr_achievements (id, name, description, icon, xp_reward) values
  ('first_pr', 'Primeiro PR', 'Bateu seu primeiro PR', '🥇', 100),
  ('streak_7d', 'Streak 7 dias', '7 dias consecutivos com PR', '🔥', 200),
  ('streak_30d', 'Streak 30 dias', '30 dias consecutivos com PR', '👑', 1000),
  ('deadlift_2bw', 'Deadlift 2× BW', 'Deadlift acima de 2× peso corporal', '💪', 500),
  ('squat_2bw', 'Squat 2× BW', 'Squat acima de 2× peso corporal', '🦵', 500),
  ('bench_1.5bw', 'Bench 1.5× BW', 'Bench Press acima de 1.5× peso corporal', '🏋️', 400),
  ('total_pr_10', '10 PRs', 'Bateu 10 PRs no total', '⭐', 100),
  ('total_pr_50', '50 PRs', 'Bateu 50 PRs no total', '⭐⭐', 500),
  ('total_pr_100', '100 PRs', '100 PRs!', '⭐⭐⭐', 2000),
  ('mentor', 'Mentor', 'Vinculou 3 atletas como PT', '🎓', 300),
  ('arcade_master', 'Arcade Master', 'Top 10 no fliperama', '🎮', 200),
  ('macro_disciplined', 'Disciplinado', '7 dias seguidos com 6 refeições logadas', '🥗', 200)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  xp_reward = excluded.xp_reward;

create table if not exists public.pr_athlete_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null references public.pr_achievements(id),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

alter table public.pr_athlete_achievements enable row level security;

create policy "achievements read public" on public.pr_athlete_achievements
  for select using (true);
create policy "achievements insert own" on public.pr_athlete_achievements
  for insert with check (auth.uid() = user_id);

-- Quests diárias/semanais (Fase 12)
create table if not exists public.pr_quests (
  id text primary key,
  scope text not null, -- 'daily' | 'weekly' | 'monthly'
  name text not null,
  description text,
  xp_reward int not null default 50
);

insert into public.pr_quests (id, scope, name, description, xp_reward) values
  ('daily_pr', 'daily', 'PR do dia', 'Registre 1 PR hoje', 50),
  ('daily_workout', 'daily', 'Treino do dia', 'Faça check-in num exercício do plano', 30),
  ('daily_meal', 'daily', 'Refeições do dia', 'Logue 4+ refeições', 30),
  ('weekly_4_workouts', 'weekly', '4 treinos na semana', 'Faça check-in em 4 dias diferentes', 200),
  ('weekly_3_pr', 'weekly', '3 PRs na semana', 'Bata PR em 3 movimentos diferentes', 300),
  ('monthly_pr_diversity', 'monthly', 'Variedade do mês', 'PR em 5 movimentos diferentes', 500)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  xp_reward = excluded.xp_reward;

create table if not exists public.pr_quest_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_id text not null references public.pr_quests(id),
  period_key text not null, -- 'YYYY-MM-DD' (daily) | 'YYYY-Www' (weekly) | 'YYYY-MM' (monthly)
  progress int not null default 0,
  completed_at timestamptz,
  primary key (user_id, quest_id, period_key)
);

alter table public.pr_quest_progress enable row level security;

create policy "qp read own" on public.pr_quest_progress
  for select using (auth.uid() = user_id);
create policy "qp upsert own" on public.pr_quest_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Migration 0023 — Eventos / competições (Fase 21)

create type pr_event_status as enum ('draft', 'open', 'closed', 'finished', 'cancelled');

create table if not exists public.pr_events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text unique not null,
  description text,
  modality text, -- 'crossfit' | 'powerlifting' | 'lpo' | 'strongman'
  starts_at timestamptz not null,
  ends_at timestamptz,
  city text,
  state text,
  cover_url text,
  fee_cents int default 0,
  max_athletes int,
  status pr_event_status not null default 'draft',
  created_at timestamptz not null default now()
);

create index if not exists idx_events_starts on public.pr_events (starts_at desc);
create index if not exists idx_events_status on public.pr_events (status);

alter table public.pr_events enable row level security;

create policy "events read public open" on public.pr_events
  for select using (status in ('open', 'closed', 'finished'));
create policy "events read own" on public.pr_events
  for select using (auth.uid() = organizer_id);
create policy "events insert by organizer" on public.pr_events
  for insert with check (auth.uid() = organizer_id);
create policy "events update by organizer" on public.pr_events
  for update using (auth.uid() = organizer_id) with check (auth.uid() = organizer_id);

create table if not exists public.pr_event_workouts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.pr_events(id) on delete cascade,
  order_idx int not null default 0,
  name text not null,
  description text,
  scoring text default 'time' -- 'time' | 'reps' | 'load'
);

alter table public.pr_event_workouts enable row level security;
create policy "ew read public" on public.pr_event_workouts for select using (true);
create policy "ew insert by event organizer" on public.pr_event_workouts
  for insert with check (
    exists (select 1 from public.pr_events e where e.id = event_id and e.organizer_id = auth.uid())
  );

create table if not exists public.pr_event_athletes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.pr_events(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  category text default 'open',
  bib_number int,
  paid boolean default false,
  registered_at timestamptz not null default now(),
  unique (event_id, athlete_id)
);

alter table public.pr_event_athletes enable row level security;
create policy "ea read public for events open" on public.pr_event_athletes
  for select using (true);
create policy "ea insert own" on public.pr_event_athletes
  for insert with check (auth.uid() = athlete_id);

create table if not exists public.pr_event_scores (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.pr_events(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid not null references public.pr_event_workouts(id) on delete cascade,
  score numeric(10, 2),
  rank_position int,
  recorded_at timestamptz not null default now(),
  unique (event_id, athlete_id, workout_id)
);

create index if not exists idx_event_scores_workout_score on public.pr_event_scores (workout_id, score desc);

alter table public.pr_event_scores enable row level security;
create policy "es read public" on public.pr_event_scores for select using (true);
create policy "es insert/update by event organizer" on public.pr_event_scores
  for all using (
    exists (select 1 from public.pr_events e where e.id = event_id and e.organizer_id = auth.uid())
  );
