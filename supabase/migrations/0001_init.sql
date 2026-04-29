-- PR Tracker — Admin Dashboard schema
-- Generated 2026-04-29

-- =============================================================================
-- Meta Ads
-- =============================================================================

create table if not exists public.meta_campaigns (
  id text primary key,
  name text not null,
  objective text,
  status text,
  effective_status text,
  daily_budget numeric,
  lifetime_budget numeric,
  bid_strategy text,
  buying_type text,
  created_time timestamptz,
  updated_at timestamptz default now()
);

create table if not exists public.meta_adsets (
  id text primary key,
  campaign_id text references public.meta_campaigns(id) on delete cascade,
  name text not null,
  status text,
  effective_status text,
  daily_budget numeric,
  lifetime_budget numeric,
  optimization_goal text,
  billing_event text,
  targeting jsonb,
  promoted_object jsonb,
  attribution_spec jsonb,
  start_time timestamptz,
  end_time timestamptz,
  updated_at timestamptz default now()
);
create index if not exists idx_meta_adsets_campaign on public.meta_adsets (campaign_id);

create table if not exists public.meta_ads (
  id text primary key,
  adset_id text references public.meta_adsets(id) on delete cascade,
  campaign_id text references public.meta_campaigns(id) on delete cascade,
  name text not null,
  status text,
  effective_status text,
  creative_id text,
  creative_name text,
  creative_thumbnail text,
  updated_at timestamptz default now()
);
create index if not exists idx_meta_ads_adset on public.meta_ads (adset_id);
create index if not exists idx_meta_ads_campaign on public.meta_ads (campaign_id);

create table if not exists public.meta_insights_daily (
  date date not null,
  level text not null check (level in ('account','campaign','adset','ad')),
  entity_id text not null,
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
  link_clicks int default 0,
  revenue numeric default 0,
  raw jsonb,
  updated_at timestamptz default now(),
  primary key (date, level, entity_id)
);
create index if not exists idx_meta_insights_date on public.meta_insights_daily (date desc);
create index if not exists idx_meta_insights_entity on public.meta_insights_daily (entity_id, date desc);

-- =============================================================================
-- GA4 (via Windsor AI)
-- =============================================================================

create table if not exists public.ga4_daily (
  date date not null,
  source text not null default '(direct)',
  medium text not null default '(none)',
  campaign text not null default '(not set)',
  sessions bigint default 0,
  users bigint default 0,
  new_users bigint default 0,
  page_views bigint default 0,
  engaged_sessions bigint default 0,
  conversions int default 0,
  revenue numeric default 0,
  transactions int default 0,
  raw jsonb,
  updated_at timestamptz default now(),
  primary key (date, source, medium, campaign)
);
create index if not exists idx_ga4_date on public.ga4_daily (date desc);

-- =============================================================================
-- Multi-channel sales (Site / Mercado Livre / Amazon / Shopee / TikTok)
-- =============================================================================

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('site','mercadolivre','amazon','shopee','tiktok','outros')),
  external_order_id text,
  product_slug text,
  product_name text,
  quantity int default 1,
  unit_price numeric,
  total numeric,
  currency text default 'BRL',
  customer_email text,
  customer_name text,
  status text,
  metadata jsonb,
  created_at timestamptz not null,
  ingested_at timestamptz default now(),
  unique (channel, external_order_id)
);
create index if not exists idx_sales_channel_date on public.sales (channel, created_at desc);
create index if not exists idx_sales_date on public.sales (created_at desc);

-- =============================================================================
-- Alerts
-- =============================================================================

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  severity text not null check (severity in ('info','warning','critical')),
  type text not null,
  title text not null,
  body text,
  entity_type text,
  entity_id text,
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  metadata jsonb,
  created_at timestamptz default now(),
  resolved_at timestamptz
);
create index if not exists idx_alerts_status on public.alerts (status, created_at desc);
create index if not exists idx_alerts_severity on public.alerts (severity, created_at desc);

-- =============================================================================
-- Audit log
-- =============================================================================

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_email text,
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz default now()
);
create index if not exists idx_audit_created on public.audit_log (created_at desc);

-- =============================================================================
-- Ingestion runs (track cron health)
-- =============================================================================

create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  status text not null check (status in ('running','success','failed')),
  rows_upserted int default 0,
  error text,
  started_at timestamptz default now(),
  finished_at timestamptz
);
create index if not exists idx_ingestion_runs_source on public.ingestion_runs (source, started_at desc);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- All admin tables: only service_role and authenticated users in admin whitelist
-- can read. Writes are service_role only (cron + admin actions go through API).

alter table public.meta_campaigns enable row level security;
alter table public.meta_adsets enable row level security;
alter table public.meta_ads enable row level security;
alter table public.meta_insights_daily enable row level security;
alter table public.ga4_daily enable row level security;
alter table public.sales enable row level security;
alter table public.alerts enable row level security;
alter table public.audit_log enable row level security;
alter table public.ingestion_runs enable row level security;

-- Defense in depth: any authenticated user can read.
-- Production-grade auth is enforced by the Astro middleware (ADMIN_EMAILS whitelist).
-- Writes always go through service_role, which bypasses RLS.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select auth.uid() is not null;
$$;

-- Read policies: any authenticated admin can SELECT
create policy "admins read meta_campaigns" on public.meta_campaigns for select using (public.is_admin());
create policy "admins read meta_adsets" on public.meta_adsets for select using (public.is_admin());
create policy "admins read meta_ads" on public.meta_ads for select using (public.is_admin());
create policy "admins read meta_insights_daily" on public.meta_insights_daily for select using (public.is_admin());
create policy "admins read ga4_daily" on public.ga4_daily for select using (public.is_admin());
create policy "admins read sales" on public.sales for select using (public.is_admin());
create policy "admins read alerts" on public.alerts for select using (public.is_admin());
create policy "admins read audit_log" on public.audit_log for select using (public.is_admin());
create policy "admins read ingestion_runs" on public.ingestion_runs for select using (public.is_admin());

-- Note: writes go through service_role key (server-side cron + API endpoints).
-- service_role bypasses RLS entirely, so no INSERT/UPDATE/DELETE policies needed.
