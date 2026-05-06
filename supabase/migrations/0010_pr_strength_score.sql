-- PR Tracker — Strength Score support
-- Adds the body data needed to compute a per-athlete strength tier.
-- Generated 2026-05-06
--
-- Privacy: body_weight_kg and sex are optional but strongly encouraged at
-- onboarding. Without them the score falls back to absolute kg only (no
-- tier / percentile shown).

alter table public.pr_athletes
  add column if not exists body_weight_kg numeric(5,2),
  add column if not exists sex text check (sex in ('male','female') or sex is null),
  add column if not exists birth_year int check (birth_year is null or (birth_year between 1920 and extract(year from current_date)::int));

-- The strength score isn't stored — it's derived on read from each PR
-- against the athlete's current body_weight_kg. We DO denormalize the
-- best-ever weight per (user, exercise) for fast leaderboard / score
-- queries, via a materialized view-style table updated by the API.

create table if not exists public.pr_best_lifts (
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise text not null,
  weight_kg numeric(6,2) not null,
  performed_at date not null,
  record_id uuid references public.pr_records(id) on delete set null,
  primary key (user_id, exercise)
);

alter table public.pr_best_lifts enable row level security;

create policy "athletes read own bests" on public.pr_best_lifts
  for select using (user_id = auth.uid());
create policy "athletes write own bests" on public.pr_best_lifts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Backfill existing best lifts so the score works for athletes who already
-- have records before this migration ran.
insert into public.pr_best_lifts (user_id, exercise, weight_kg, performed_at, record_id)
select distinct on (user_id, exercise)
  user_id, exercise, weight_kg, performed_at, id
from public.pr_records
order by user_id, exercise, weight_kg desc, performed_at asc
on conflict (user_id, exercise) do nothing;
