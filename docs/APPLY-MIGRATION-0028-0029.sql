-- =============================================================================
-- APPLY IN SUPABASE SQL EDITOR BEFORE DEPLOYING THE CODE.
--
-- Fix para NF-e duplicadas (TikTok Shop e site/Mercado Pago). O código novo usa
-- um estado transitório 'processing' como trava atômica; sem estas migrations o
-- INSERT com status='processing' é rejeitado pelo check constraint e TODA sync
-- falha. As duas alterações só ampliam o enum permitido — são retrocompatíveis,
-- então aplicar antes do deploy é seguro.
--
-- migrations/0028_tiktok_bling_processing_status.sql
-- migrations/0029_bling_orders_processing_status.sql
-- =============================================================================

-- 0028 — TikTok Shop ledger
alter table public.tiktok_bling_orders
  drop constraint if exists tiktok_bling_orders_status_check;
alter table public.tiktok_bling_orders
  add constraint tiktok_bling_orders_status_check
  check (status in ('pending', 'processing', 'synced', 'failed', 'skipped'));

-- 0029 — Mercado Pago / site ledger
alter table public.bling_orders
  drop constraint if exists bling_orders_status_check;
alter table public.bling_orders
  add constraint bling_orders_status_check
  check (status in ('pending', 'processing', 'synced', 'failed', 'skipped'));
