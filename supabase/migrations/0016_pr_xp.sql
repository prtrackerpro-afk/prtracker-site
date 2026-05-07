-- PR Tracker — XP system (V14)
-- Generated 2026-05-07
--
-- Cada atleta tem um XP total acumulado. XP só é ganho em eventos de
-- "novo PR" (recorde batido) — não em registros que não superem o melhor
-- atual. Ver src/lib/pr/gym/xp.ts pras fórmulas.
--
-- pr_xp_events guarda histórico imutável de cada concessão de XP, o que
-- permite:
--   1. Backfill retroativo idempotente (insere eventos faltantes, não duplica)
--   2. Auditar de onde vem o total (breakdown por tipo)
--   3. Reverter no futuro se a fórmula mudar
--
-- pr_athletes.xp_total é cache derivado de SUM(amount) agrupado por user.
-- Mantido em sync por trigger AFTER INSERT em pr_xp_events.

-- 1) Cache do total ----------------------------------------------------
alter table public.pr_athletes
  add column if not exists xp_total int not null default 0;

comment on column public.pr_athletes.xp_total is
  'XP acumulado do atleta. Cache derivado de SUM(pr_xp_events.amount).';

-- 2) Tabela de eventos ------------------------------------------------
create table if not exists public.pr_xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Tipo do evento — "lift_pr" | "skill_tier" | "run_pr" | "streak_day"
  source text not null check (source in ('lift_pr','skill_tier','run_pr','streak_day')),
  -- Chave única do evento — usada pra dedup no backfill.
  -- lift_pr:    "lift:<exercise_id>:<weight_kg>"  (1 evento por PR distinto)
  -- skill_tier: "skill:<skill_id>:<tier>"          (1 evento por tier)
  -- run_pr:     "run:<distance>:<time_sec>"        (1 evento por tempo distinto)
  -- streak_day: "streak:<YYYY-MM-DD>"              (1 evento por dia)
  source_key text not null,
  amount int not null check (amount >= 0),
  awarded_at timestamptz not null default now(),
  -- Payload arbitrário (kg, reps, tier, etc) pra auditoria/breakdown
  payload jsonb,
  unique (user_id, source, source_key)
);

create index if not exists pr_xp_events_user_source_idx
  on public.pr_xp_events (user_id, source);
create index if not exists pr_xp_events_user_awarded_idx
  on public.pr_xp_events (user_id, awarded_at desc);

alter table public.pr_xp_events enable row level security;

drop policy if exists "athletes read own xp events" on public.pr_xp_events;
create policy "athletes read own xp events" on public.pr_xp_events
  for select using (user_id = auth.uid());

-- Insert/update via service role (API endpoints) — não expomos write
-- direto pro client pra evitar inflar XP burlando a fórmula.

-- 3) Trigger pra manter xp_total em sync -------------------------------
create or replace function public.pr_xp_events_sync_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.pr_athletes
       set xp_total = xp_total + NEW.amount
     where user_id = NEW.user_id;
    return NEW;
  elsif (tg_op = 'DELETE') then
    update public.pr_athletes
       set xp_total = greatest(0, xp_total - OLD.amount)
     where user_id = OLD.user_id;
    return OLD;
  end if;
  return null;
end;
$$;

drop trigger if exists pr_xp_events_sync_total_trg on public.pr_xp_events;
create trigger pr_xp_events_sync_total_trg
  after insert or delete on public.pr_xp_events
  for each row execute function public.pr_xp_events_sync_total();
