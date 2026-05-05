-- PR Tracker — TikTok Shop Open Platform OAuth tokens
-- Generated 2026-05-05
--
-- Stores access/refresh tokens for the "PR Tracker Bling Sync" custom app
-- registered in TikTok Shop Partner Center. Each row keyed by shop_id since
-- a single app can be authorized into multiple shops (today PR Tracker has
-- one — BRLCXGLWNY — but ML/Shopee migration may add more).
--
-- Token lifetimes (TikTok-specific):
--   - access_token: 7 days (vs Bling's 6 hours)
--   - refresh_token: 365 days, rotates on every refresh call
--
-- Service-role only — never read from browser.

create table if not exists public.tiktok_oauth_tokens (
  shop_id text primary key,
  shop_cipher text not null,
  shop_name text,
  region text,
  open_id text not null,
  seller_name text,
  access_token text not null,
  refresh_token text not null,
  access_token_expires_at timestamptz not null,
  refresh_token_expires_at timestamptz not null,
  obtained_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: deny everything by default. Server-only access via service role.
alter table public.tiktok_oauth_tokens enable row level security;
-- Sem policies = deny all pra anon/authenticated. Apenas service_role lê/escreve.

comment on table public.tiktok_oauth_tokens is
  'OAuth tokens for TikTok Shop Open Platform. One row per authorized shop. Service-role only.';
comment on column public.tiktok_oauth_tokens.shop_cipher is
  'Encrypted shop ID required as query param on every API call. Different from shop_id.';
comment on column public.tiktok_oauth_tokens.refresh_token_expires_at is
  'TikTok rotates refresh_token on every use; this is updated on each refresh.';
