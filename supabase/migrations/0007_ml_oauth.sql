-- PR Tracker — Mercado Livre OAuth tokens
-- Generated 2026-05-05
--
-- Stores access/refresh tokens for the "PR Tracker Bling Sync" custom app
-- registered in https://developers.mercadolivre.com.br/devcenter.
--
-- Token lifetimes (Mercado Livre-specific):
--   - access_token: 6 hours
--   - refresh_token: 6 months, rotates on every refresh call
--
-- Service-role only — never read from browser.
--
-- ML retorna `user_id` numérico (seller_id) e `nickname` no token exchange.
-- Persistimos pelo seller_id pra suportar múltiplas contas no futuro
-- (hoje só tem uma — PR TRACKER LTDA quando Felipe criar).

create table if not exists public.ml_oauth_tokens (
  seller_id bigint primary key,
  nickname text,
  site_id text not null default 'MLB',
  access_token text not null,
  refresh_token text not null,
  access_token_expires_at timestamptz not null,
  refresh_token_expires_at timestamptz not null,
  obtained_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: deny everything by default. Server-only access via service role.
alter table public.ml_oauth_tokens enable row level security;
-- Sem policies = deny all pra anon/authenticated. Apenas service_role lê/escreve.

comment on table public.ml_oauth_tokens is
  'OAuth tokens for Mercado Livre. One row per authorized seller. Service-role only.';
comment on column public.ml_oauth_tokens.seller_id is
  'ML user_id (numérico, retornado no token exchange). Identifica a conta vendedora.';
comment on column public.ml_oauth_tokens.refresh_token_expires_at is
  'ML rotaciona refresh_token a cada uso; este é updated em cada refresh.';
