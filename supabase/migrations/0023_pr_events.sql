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
