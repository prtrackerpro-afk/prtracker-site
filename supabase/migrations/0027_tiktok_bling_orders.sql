-- PR Tracker — TikTok Shop → Bling sync ledger
--
-- Mirrors the pattern of `bling_orders` (0003) but keyed on tiktok_order_id
-- instead of mp_payment_id. Tracks the lifecycle of each TikTok order
-- through Bling: pedido criado, NF-e emitida, ou falha (com payload pra retry).
--
-- Polymorphic merge (bling_orders + tiktok_bling_orders → marketplace_orders)
-- pode rolar depois. Por ora, manter separado evita migração disruptiva.

create table if not exists public.tiktok_bling_orders (
  id uuid primary key default gen_random_uuid(),
  tiktok_order_id text not null unique,
  bling_pedido_id text,
  bling_pedido_numero text,
  bling_contato_id text,
  bling_nfe_id text,
  bling_nfe_numero text,
  bling_nfe_serie text,
  bling_nfe_chave_acesso text,
  status text not null check (status in ('pending','synced','failed','skipped')) default 'pending',
  nfe_status text check (nfe_status in ('emitted','pending','failed','skipped')),
  error text,
  nfe_error text,
  attempt_count int not null default 0,
  request_payload jsonb,
  response_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  synced_at timestamptz,
  nfe_emitted_at timestamptz
);

create index if not exists idx_tiktok_bling_orders_status
  on public.tiktok_bling_orders (status, created_at desc);

alter table public.tiktok_bling_orders enable row level security;

create policy "admins read tiktok_bling_orders"
  on public.tiktok_bling_orders for select
  using (public.is_admin());
