-- PR Tracker — add 'processing' status to the MP→Bling sync ledger.
--
-- Same fix as 0028 (TikTok), applied to the site/Mercado Pago path. The old
-- guard in sync.ts did a non-atomic SELECT-then-INSERT, so a duplicated MP
-- webhook could let two runs both create a pedido + NF-e. The fix claims each
-- payment atomically via a transient 'processing' state.
--
-- Backward-compatible: only widens the allowed enum. Safe to apply before the
-- code deploy (old code never writes 'processing').

alter table public.bling_orders
  drop constraint if exists bling_orders_status_check;

alter table public.bling_orders
  add constraint bling_orders_status_check
  check (status in ('pending', 'processing', 'synced', 'failed', 'skipped'));
