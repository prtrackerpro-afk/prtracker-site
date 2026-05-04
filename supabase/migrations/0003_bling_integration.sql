-- PR Tracker — Bling integration (OAuth tokens + order sync ledger)
-- Generated 2026-05-04
--
-- Two tables:
--   bling_oauth_tokens — singleton row holding the OAuth2 access/refresh
--     tokens for the PR Tracker Bling app. Refresh runs server-side from
--     the API client when access_token is near expiry.
--   bling_orders       — idempotency ledger keyed by mp_payment_id. Each
--     row tracks one MP-approved payment's lifecycle into Bling: created,
--     synced (with bling_pedido_id), or failed (with error + raw payload
--     for manual retry from /admin).

-- =============================================================================
-- Bling OAuth tokens
-- =============================================================================

create table if not exists public.bling_oauth_tokens (
  id text primary key default 'singleton',
  access_token text not null,
  refresh_token text not null,
  token_type text not null default 'Bearer',
  scope text,
  expires_at timestamptz not null,
  obtained_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Enforce singleton: only one row allowed.
  constraint bling_oauth_tokens_singleton check (id = 'singleton')
);

-- =============================================================================
-- Bling orders (sync ledger)
-- =============================================================================

create table if not exists public.bling_orders (
  id uuid primary key default gen_random_uuid(),
  mp_payment_id text not null unique,
  external_reference text,
  bling_pedido_id text,
  bling_pedido_numero text,
  bling_contato_id text,
  status text not null check (status in ('pending','synced','failed','skipped')) default 'pending',
  error text,
  attempt_count int not null default 0,
  request_payload jsonb,
  response_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  synced_at timestamptz
);
create index if not exists idx_bling_orders_status on public.bling_orders (status, created_at desc);
create index if not exists idx_bling_orders_external_ref on public.bling_orders (external_reference);

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.bling_oauth_tokens enable row level security;
alter table public.bling_orders enable row level security;

-- Reads: any authenticated admin (mirrors 0001_init policy pattern).
create policy "admins read bling_oauth_tokens" on public.bling_oauth_tokens for select using (public.is_admin());
create policy "admins read bling_orders" on public.bling_orders for select using (public.is_admin());

-- Writes: service_role only (bypasses RLS automatically). All writes go
-- through OAuth callback / webhook / admin retry endpoints.
