-- PR Tracker — Skills (ginásticos) + Running benchmarks
-- Generated 2026-05-06
--
-- Skills: BMU, MU, HSPU, T2B, DU, Pistol — best consecutive reps por skill.
-- Tier ladder (rendered no SkillsBoard):
--   reps >= 1  → Unlocked
--   reps >= 3  → Bronze
--   reps >= 5  → Prata
--   reps >= 10 → Ouro
--   reps >= 20 → Diamante
--
-- Runs: 5K, 10K, 21K (meia maratona), 42K (maratona) — best time em segundos.

create table if not exists public.pr_skills (
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id text not null check (skill_id in ('bmu','mu','hspu','t2b','du','pistol')),
  best_reps int not null check (best_reps >= 0),
  achieved_at date not null default current_date,
  updated_at timestamptz not null default now(),
  primary key (user_id, skill_id)
);

alter table public.pr_skills enable row level security;

create policy "athletes read own skills" on public.pr_skills
  for select using (user_id = auth.uid());
create policy "athletes write own skills" on public.pr_skills
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.pr_runs (
  user_id uuid not null references auth.users(id) on delete cascade,
  distance text not null check (distance in ('5k','10k','21k','42k')),
  best_time_sec int not null check (best_time_sec > 0 and best_time_sec < 86400),
  achieved_at date not null default current_date,
  updated_at timestamptz not null default now(),
  primary key (user_id, distance)
);

alter table public.pr_runs enable row level security;

create policy "athletes read own runs" on public.pr_runs
  for select using (user_id = auth.uid());
create policy "athletes write own runs" on public.pr_runs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
