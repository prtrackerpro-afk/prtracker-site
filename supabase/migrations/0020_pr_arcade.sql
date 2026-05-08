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
