-- PR Tracker — Gym Layout persistence
-- Generated 2026-05-07
--
-- Editor 2D em /pr/gym/edit deixa o atleta arrumar a planta baixa
-- do ginásio virtual. Step 1-7 persistia em localStorage; este step
-- migra pra Supabase pra layout viajar entre devices e suportar a
-- feature futura "visitar gym do amigo".
--
-- Estrutura: coluna gym_layout JSONB em pr_athletes. Schema do JSON
-- segue o type GymLayout em src/lib/pr/gym/layout.ts:
--   {
--     "version": 1,
--     "objects": [
--       { "id": "...", "type": "trophy_hall", "x": 0, "z": -7, "rot": 0 },
--       ...
--     ]
--   }
--
-- NULL = atleta nunca customizou → app usa DEFAULT_LAYOUT.

alter table public.pr_athletes
  add column if not exists gym_layout jsonb;

comment on column public.pr_athletes.gym_layout is
  'Layout customizado do ginásio virtual (planta baixa). Schema GymLayout. NULL = usar DEFAULT_LAYOUT.';
