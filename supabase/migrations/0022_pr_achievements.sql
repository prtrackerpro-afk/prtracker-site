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
