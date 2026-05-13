-- Migration 0026 — TikTok Ads daily insights (account-level only — MVP).
--
-- Rodar no Supabase Studio → SQL Editor.

create table if not exists public.tiktok_ads_insights_daily (
  date date not null,
  account_id text not null,
  spend numeric default 0,
  impressions bigint default 0,
  clicks bigint default 0,
  ctr numeric default 0,
  cpm numeric default 0,
  cpc numeric default 0,
  reach bigint default 0,
  frequency numeric default 0,
  purchases int default 0,
  add_to_cart int default 0,
  initiate_checkout int default 0,
  view_content int default 0,
  landing_page_view int default 0,
  revenue numeric default 0,
  raw jsonb,
  updated_at timestamptz default now(),
  primary key (date, account_id)
);
create index if not exists idx_tiktok_ads_insights_date on public.tiktok_ads_insights_daily (date desc);
