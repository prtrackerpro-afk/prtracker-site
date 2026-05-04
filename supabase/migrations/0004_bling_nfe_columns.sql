-- PR Tracker — Bling NF-e auto-emission tracking
-- Generated 2026-05-04
--
-- After syncOrderToBling creates the pedido in Bling, we explicitly call
-- POST /nfe to emit the NF-e (instead of relying on Bling automation rules
-- that may or may not be configured). This migration adds the columns to
-- track NF-e emission outcome separately from pedido sync outcome.
--
-- nfe_status values:
--   'pending'  — pedido synced but NF-e emission not yet attempted
--   'emitted'  — NF-e issued successfully (number + auth date populated)
--   'failed'   — emission failed; nfe_error has the reason
--   'skipped'  — explicitly skipped (e.g., manual emission)

alter table public.bling_orders
  add column if not exists bling_nfe_id text,
  add column if not exists bling_nfe_numero text,
  add column if not exists bling_nfe_serie text,
  add column if not exists bling_nfe_chave_acesso text,
  add column if not exists nfe_status text
    check (nfe_status in ('pending','emitted','failed','skipped')),
  add column if not exists nfe_error text,
  add column if not exists nfe_emitted_at timestamptz;

create index if not exists idx_bling_orders_nfe_status
  on public.bling_orders (nfe_status, created_at desc);
