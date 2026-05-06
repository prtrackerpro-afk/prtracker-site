-- PR Tracker — Amazon SP-API LWA tokens
-- Generated 2026-05-06
--
-- Stores Login with Amazon (LWA) tokens pro Selling Partner API.
-- Diferença vs outros marketplaces:
--   - Refresh token LWA NÃO EXPIRA (até seller revogar autorização)
--   - Access token: 1 hora (renovado via refresh_token)
--   - Pra chamar SP-API ainda precisa de AWS SigV4 com IAM credentials
--     (não armazenadas aqui — vão em env vars Vercel)
--
-- Marketplace BR: A2Q3Y263D00KWC
-- Endpoint: https://sellingpartnerapi-na.amazon.com (NA region pra Brazil)
--
-- Service-role only — never read from browser.

create table if not exists public.amazon_oauth_tokens (
  selling_partner_id text primary key,
  marketplace_id text not null default 'A2Q3Y263D00KWC',
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  obtained_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.amazon_oauth_tokens enable row level security;

comment on table public.amazon_oauth_tokens is
  'LWA OAuth tokens for Amazon SP-API. One row per authorized Selling Partner. Service-role only.';
comment on column public.amazon_oauth_tokens.selling_partner_id is
  'Amazon Selling Partner ID (retornado no LWA authorization). Equivalente ao seller_id de outros canais.';
comment on column public.amazon_oauth_tokens.marketplace_id is
  'Amazon marketplace ID. BR = A2Q3Y263D00KWC. Pode ter múltiplos por seller (BR + MX + US).';
comment on column public.amazon_oauth_tokens.refresh_token is
  'LWA refresh token — NÃO expira até seller revogar. Persistido aqui pra renovar access_token de 1h em 1h.';
