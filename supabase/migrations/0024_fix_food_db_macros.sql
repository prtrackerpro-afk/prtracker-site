-- Migration 0024 — Fix macros incorretos do food_db + adicionar 30 alimentos extras

-- =================================================================
-- FIX 1: Whey protein estava com 24g prot/100g (errado, era valor de 1 scoop)
-- Whey isolado real: ~80g prot/100g, ~380kcal/100g, ~5g carb, ~5g fat
-- =================================================================

update public.pr_food_db
set name = 'Whey protein concentrado',
    kcal = 380,
    protein_g = 75,
    carbs_g = 8,
    fat_g = 6,
    fiber_g = 0
where name = 'Whey protein (1 scoop 30g)';

-- =================================================================
-- FIX 2: Creatina pura por 100g (em scoops de 5g eh imperceptivel
-- mas se user logar 100g, o calc precisa ser correto)
-- Creatina monohidratada: 0 kcal, 0 macros (nao conta)
-- =================================================================
update public.pr_food_db
set name = 'Creatina monohidratada'
where name = 'Creatina (5g)';

-- =================================================================
-- ADICIONAR 30 alimentos brasileiros comuns que faltavam
-- Todos em "por 100g" (leite/iogurte em ml = 100ml)
-- =================================================================
insert into public.pr_food_db (name, kcal, protein_g, carbs_g, fat_g, fiber_g, category) values
  -- Suplementos (todos por 100g)
  ('Whey protein isolado', 400, 90, 2, 1, 0, 'suplemento'),
  ('Albumina', 380, 80, 5, 1, 0, 'suplemento'),
  ('BCAA em po', 320, 80, 0, 0, 0, 'suplemento'),
  ('Hipercalorico mass gainer', 380, 25, 60, 5, 1, 'suplemento'),
  ('Barrinha de proteina (nutry/whey)', 380, 25, 38, 12, 4, 'suplemento'),
  ('Pasta de amendoim integral', 588, 25, 20, 50, 6, 'suplemento'),
  -- Carnes
  ('Carne moida 90/10', 170, 26, 0, 7, 0, 'carne'),
  ('File mignon', 175, 28, 0, 6, 0, 'carne'),
  ('Bife ancho', 280, 24, 0, 20, 0, 'carne'),
  ('Coxa de frango', 180, 24, 0, 9, 0, 'carne'),
  ('Sobrecoxa de frango', 200, 22, 0, 12, 0, 'carne'),
  -- Peixes
  ('Atum lata em agua', 116, 26, 0, 1, 0, 'peixe'),
  ('Atum lata em oleo', 198, 24, 0, 11, 0, 'peixe'),
  ('Sardinha lata', 208, 25, 0, 11, 0, 'peixe'),
  ('Camarao cozido', 99, 24, 0, 0.5, 0, 'peixe'),
  -- Carbos
  ('Macarrao espaguete cozido', 158, 5.8, 31, 0.9, 1.8, 'cereal'),
  ('Macarrao integral cozido', 124, 5, 25, 0.9, 4, 'cereal'),
  ('Tapioca seca', 350, 0.6, 88, 0.2, 0.9, 'cereal'),
  ('Pao de queijo', 300, 8, 32, 15, 1, 'paes'),
  ('Cuscuz cozido', 112, 3.8, 23, 0.2, 1.4, 'cereal'),
  ('Mandioca cozida', 125, 0.8, 30, 0.3, 1.6, 'raiz'),
  ('Inhame cozido', 97, 1.5, 23, 0.2, 4, 'raiz'),
  -- Legumes/verduras
  ('Tomate', 18, 0.9, 3.9, 0.2, 1.2, 'verdura'),
  ('Cenoura crua', 41, 0.9, 9.6, 0.2, 2.8, 'verdura'),
  ('Beterraba', 43, 1.6, 9.6, 0.2, 2.8, 'verdura'),
  ('Espinafre cozido', 23, 2.9, 3.6, 0.4, 2.2, 'verdura'),
  -- Frutas
  ('Laranja', 47, 0.9, 11.8, 0.1, 2.4, 'fruta'),
  ('Mamao', 43, 0.5, 11, 0.3, 1.7, 'fruta'),
  ('Abacate', 160, 2, 8.5, 14.7, 6.7, 'fruta'),
  ('Mirtilo', 57, 0.7, 14, 0.3, 2.4, 'fruta'),
  -- Laticinios
  ('Iogurte grego natural', 97, 9, 4, 5, 0, 'laticinio'),
  ('Cottage', 98, 11, 3.4, 4.3, 0, 'laticinio'),
  ('Requeijao light', 200, 11, 5, 16, 0, 'laticinio'),
  -- Outros
  ('Cafe sem acucar', 2, 0.1, 0, 0, 0, 'bebida'),
  ('Cerveja', 43, 0.5, 3.6, 0, 0, 'bebida')
on conflict do nothing;
