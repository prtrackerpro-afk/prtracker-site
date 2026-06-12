-- PR Tracker — add 'processing' status to the TikTok→Bling sync ledger.
--
-- Root cause of duplicated NF-e: the old guard in sync-tiktok.ts did a
-- non-atomic SELECT-then-INSERT, so two concurrent runs (cron + manual button,
-- or overlapping cron windows) both passed the "already synced?" check and each
-- created a pedido + NF-e. The fix claims each order atomically by transitioning
-- it into a transient 'processing' state; only one worker wins the claim.
--
-- 'processing' is a short-lived lock. A row left in 'processing' for longer than
-- the function timeout is treated as a stale/crashed claim and may be reclaimed
-- (see claimOrder() in sync-tiktok.ts).

alter table public.tiktok_bling_orders
  drop constraint if exists tiktok_bling_orders_status_check;

alter table public.tiktok_bling_orders
  add constraint tiktok_bling_orders_status_check
  check (status in ('pending', 'processing', 'synced', 'failed', 'skipped'));
