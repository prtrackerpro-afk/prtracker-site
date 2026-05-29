-- PR Tracker — Gift Cards (Vale-Presente)
-- Generated 2026-05-28
--
-- Suporta uso parcial (saldo persistente). Atomicidade no débito é garantida
-- por UPDATE-condicional + UNIQUE constraint na tabela de redenções
-- (ver lib/gift-cards.ts → atomicDebit).

create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  -- Código humano: "PR-XXXX-XXXX" (sem 0/O/1/I/L pra evitar confusão).
  -- Normalizado em UPPERCASE pra lookup case-insensitive simples.
  code text unique not null,

  value_cents int not null,
  balance_cents int not null,

  -- active | depleted | expired | cancelled. Cron diário marca expired.
  status text not null default 'active',

  buyer_email text not null,
  buyer_name text,

  -- Quando o comprador escolhe presentear: email + nome do presenteado +
  -- mensagem pessoal. Quando nulo, o vale é enviado pro próprio comprador.
  recipient_email text,
  recipient_name text,
  personal_message text,

  -- Pagamento de origem (MP). NULL durante o gap entre emissão e
  -- gravação da venda, mas geralmente preenchido na criação.
  mp_purchase_payment_id text,
  mp_purchase_external_reference text,

  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,

  constraint gift_cards_balance_nonneg check (balance_cents >= 0),
  constraint gift_cards_balance_lte_value check (balance_cents <= value_cents),
  constraint gift_cards_value_positive check (value_cents > 0),
  constraint gift_cards_status_valid check (
    status in ('active', 'depleted', 'expired', 'cancelled')
  )
);

create index if not exists idx_gift_cards_status_expires
  on public.gift_cards (status, expires_at);
create index if not exists idx_gift_cards_buyer_email
  on public.gift_cards (lower(buyer_email));

-- Ledger de movimentações. UNIQUE (gift_card_id, mp_order_id, type) garante
-- idempotência: MP webhook pode disparar 2+ vezes pra mesma compra approved,
-- mas o INSERT quebra com violação e o débito não acontece de novo.
create table if not exists public.gift_card_redemptions (
  id uuid primary key default gen_random_uuid(),
  gift_card_id uuid not null references public.gift_cards(id) on delete cascade,
  mp_order_id text not null,
  -- redemption (débito) ou refund (crédito, raro)
  type text not null default 'redemption',
  amount_cents int not null,
  created_at timestamptz not null default now(),

  constraint gift_card_redemptions_type_valid check (type in ('redemption', 'refund')),
  constraint gift_card_redemptions_amount_positive check (amount_cents > 0),
  unique (gift_card_id, mp_order_id, type)
);

create index if not exists idx_gift_card_redemptions_mp_order
  on public.gift_card_redemptions (mp_order_id);

-- RLS: gift_cards e redemptions são acessados só pelo service-role
-- (webhook, validate-coupon). Sem políticas anônimas — anon não enxerga nada.
alter table public.gift_cards enable row level security;
alter table public.gift_card_redemptions enable row level security;

-- =============================================================================
-- RPC: debit_gift_card
-- =============================================================================
-- Débito atômico de saldo + escrita no ledger numa única transação. Chamada
-- pelo webhook quando o MP confirma um pagamento que usou vale-presente.
--
-- Garantias:
--   - INSERT na ledger primeiro: UNIQUE (gift_card_id, mp_order_id, type)
--     bloqueia retentativas do webhook (idempotente).
--   - UPDATE atômico do saldo: `WHERE balance_cents >= debit AND status='active'`
--     garante que duas requests concorrentes não levam o saldo abaixo de zero.
--   - SECURITY DEFINER pra rodar com privilégios de owner mesmo sob RLS.
--
-- Retorna json: { ok, error?, code, debited_cents, new_balance_cents, new_status }.

create or replace function public.debit_gift_card(
  p_card_id uuid,
  p_mp_order_id text,
  p_debit_cents int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_new_balance int;
  v_new_status text;
begin
  if p_debit_cents is null or p_debit_cents <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;

  -- 1) Ledger primeiro. UNIQUE constraint bloqueia retentativa idempotente.
  begin
    insert into public.gift_card_redemptions
      (gift_card_id, mp_order_id, type, amount_cents)
    values
      (p_card_id, p_mp_order_id, 'redemption', p_debit_cents);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'already_debited');
  end;

  -- 2) Débito atômico do saldo. Postgres trava a linha durante o UPDATE.
  -- Condições previnem saldo negativo e uso de vale inativo/expirado.
  update public.gift_cards
  set
    balance_cents = balance_cents - p_debit_cents,
    last_used_at = now(),
    status = case
      when balance_cents - p_debit_cents <= 0 then 'depleted'
      else status
    end
  where id = p_card_id
    and status = 'active'
    and expires_at > now()
    and balance_cents >= p_debit_cents
  returning code, balance_cents, status
  into v_code, v_new_balance, v_new_status;

  if not found then
    -- Rolla back ledger pra não deixar lixo órfão.
    delete from public.gift_card_redemptions
    where gift_card_id = p_card_id
      and mp_order_id = p_mp_order_id
      and type = 'redemption';
    return jsonb_build_object('ok', false, 'error', 'insufficient_or_inactive');
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', v_code,
    'debited_cents', p_debit_cents,
    'new_balance_cents', v_new_balance,
    'new_status', v_new_status
  );
end;
$$;

-- Concede execução pro service-role (Supabase já roda como `postgres`/
-- `service_role` no admin client, mas tornamos explícito).
revoke all on function public.debit_gift_card(uuid, text, int) from public;
grant execute on function public.debit_gift_card(uuid, text, int) to service_role;

-- =============================================================================
-- RPC: refund_gift_card
-- =============================================================================
-- Reverte um débito quando o pagamento MP é estornado (chargeback/refund).
-- Restaura o saldo até no máximo o `value_cents` original. UNIQUE
-- (gift_card_id, mp_order_id, type='refund') garante idempotência.
--
-- Não exige `status='active'` — vales `depleted` podem ser ressuscitados
-- pra `active` quando o refund recupera saldo. `cancelled` e `expired`
-- mantêm o status mas registram o ledger (auditoria).

create or replace function public.refund_gift_card(
  p_card_id uuid,
  p_mp_order_id text,
  p_refund_cents int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_new_balance int;
  v_new_status text;
  v_value int;
  v_current_balance int;
begin
  if p_refund_cents is null or p_refund_cents <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;

  -- Pega o estado atual pra calcular o cap em value_cents.
  select value_cents, balance_cents
  into v_value, v_current_balance
  from public.gift_cards
  where id = p_card_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Ledger primeiro (idempotência).
  begin
    insert into public.gift_card_redemptions
      (gift_card_id, mp_order_id, type, amount_cents)
    values
      (p_card_id, p_mp_order_id, 'refund', p_refund_cents);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'already_refunded');
  end;

  -- Restaura saldo, com cap em value_cents (não pode passar do original).
  v_new_balance := least(v_current_balance + p_refund_cents, v_value);
  v_new_status := case
    when v_new_balance > 0 then 'active'
    else 'depleted'
  end;

  update public.gift_cards
  set
    balance_cents = v_new_balance,
    status = v_new_status
  where id = p_card_id
  returning code into v_code;

  return jsonb_build_object(
    'ok', true,
    'code', v_code,
    'refunded_cents', p_refund_cents,
    'new_balance_cents', v_new_balance,
    'new_status', v_new_status
  );
end;
$$;

revoke all on function public.refund_gift_card(uuid, text, int) from public;
grant execute on function public.refund_gift_card(uuid, text, int) to service_role;
