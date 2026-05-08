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
