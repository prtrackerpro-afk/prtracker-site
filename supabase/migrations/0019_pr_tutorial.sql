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
