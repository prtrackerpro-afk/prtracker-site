/**
 * Vale-Presente — emissão, lookup, débito atômico e refund.
 *
 * Atomicidade: o débito do saldo é feito em UM ÚNICO statement
 * (`UPDATE ... WHERE balance_cents >= $debit RETURNING ...`). Postgres
 * trava a linha durante o UPDATE; se duas requests concorrentes tentarem
 * debitar o mesmo vale, só a primeira passa — a segunda recebe rowcount=0
 * e é rejeitada como "saldo insuficiente". Sem race conditions, sem locks
 * distribuídos.
 *
 * Idempotência: a tabela `gift_card_redemptions` tem
 * `UNIQUE (gift_card_id, mp_order_id, type)`. Se o MP webhook retransmite
 * a mesma compra approved, o INSERT na ledger quebra com violação de
 * constraint e o débito não é reaplicado. Por isso o INSERT na ledger
 * acontece ANTES do UPDATE no saldo — se INSERT falha, abortamos cedo.
 */
import crypto from "node:crypto";
import { getAdminSupabase } from "./supabase/server";
import { GIFT_CARD_VALIDITY_MONTHS } from "./catalog";

export interface GiftCardRow {
  id: string;
  code: string;
  value_cents: number;
  balance_cents: number;
  status: "active" | "depleted" | "expired" | "cancelled";
  buyer_email: string;
  buyer_name: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  personal_message: string | null;
  mp_purchase_payment_id: string | null;
  mp_purchase_external_reference: string | null;
  expires_at: string; // ISO
  created_at: string;
  last_used_at: string | null;
}

export type GiftCardPreviewResult =
  | {
      ok: true;
      card: GiftCardRow;
      /** Quanto será efetivamente descontado: min(balance, subtotal). */
      discountCents: number;
    }
  | { ok: false; error: GiftCardPreviewError; message: string };

export type GiftCardPreviewError =
  | "not_found"
  | "expired"
  | "depleted"
  | "cancelled"
  | "subtotal_zero";

const CODE_PREFIX = "PR";
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sem 0/O/1/I/L

/**
 * Gera código no formato `PR-XXXX-XXXX` (sem 0/O/1/I/L pra reduzir erro
 * de transcrição). Entropia ≈ 8 chars * log2(31) ≈ 39.6 bits → 1 colisão
 * a cada ~10⁶ códigos com 10k emitidos. Suficiente; o lookup é por código
 * único na tabela e UNIQUE constraint cobre o caso raro de colisão.
 */
export function generateGiftCardCode(): string {
  const bytes = crypto.randomBytes(8);
  const chars: string[] = [];
  for (let i = 0; i < 8; i++) {
    chars.push(CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]!);
  }
  return `${CODE_PREFIX}-${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}`;
}

function normalizeCode(input: string): string {
  return input.trim().toUpperCase();
}

/**
 * Busca um vale pelo código (case-insensitive). Retorna null se não existir.
 * Não revela diferença entre "código inexistente" e "código expirado" no
 * caller — preview e debit fazem isso.
 */
export async function lookupGiftCard(code: string): Promise<GiftCardRow | null> {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  const sb = getAdminSupabase();
  const { data, error } = await sb
    .from("gift_cards")
    .select("*")
    .eq("code", normalized)
    .maybeSingle();
  if (error) {
    console.warn("[gift-cards] lookup error:", error.message);
    return null;
  }
  return (data as GiftCardRow | null) ?? null;
}

/**
 * Validação read-only pro UI mostrar o desconto antes do checkout. Não
 * mexe no saldo. O débito de verdade acontece no `mp-webhook` quando a
 * compra é aprovada.
 */
export async function previewGiftCardDiscount(
  code: string,
  subtotalCents: number,
): Promise<GiftCardPreviewResult> {
  const card = await lookupGiftCard(code);
  if (!card) {
    return {
      ok: false,
      error: "not_found",
      message: "Vale-presente não encontrado.",
    };
  }
  if (card.status === "cancelled") {
    return {
      ok: false,
      error: "cancelled",
      message: "Esse vale-presente foi cancelado.",
    };
  }
  if (card.status === "expired" || new Date(card.expires_at).getTime() < Date.now()) {
    return {
      ok: false,
      error: "expired",
      message: "Vale-presente expirado.",
    };
  }
  if (card.status === "depleted" || card.balance_cents <= 0) {
    return {
      ok: false,
      error: "depleted",
      message: "Esse vale-presente já foi usado integralmente.",
    };
  }
  if (subtotalCents <= 0) {
    return {
      ok: false,
      error: "subtotal_zero",
      message: "Adicione produtos ao carrinho antes de aplicar o vale.",
    };
  }
  const discountCents = Math.min(card.balance_cents, subtotalCents);
  return { ok: true, card, discountCents };
}

export type GiftCardDebitResult =
  | {
      ok: true;
      cardId: string;
      code: string;
      debitedCents: number;
      newBalanceCents: number;
      newStatus: GiftCardRow["status"];
    }
  | {
      ok: false;
      error: "already_debited" | "insufficient_or_inactive" | "db_error";
      message: string;
    };

/**
 * DÉBITO ATÔMICO. Único caminho legítimo pra reduzir o saldo de um vale.
 *
 * Chama a RPC `debit_gift_card` no Postgres (definida na migration 0028)
 * que faz INSERT no ledger + UPDATE condicional do saldo numa transação
 * única. Garantias:
 *
 *   - Idempotência via UNIQUE(card, mp_order, type) na ledger — webhook do
 *     MP pode retransmitir e o débito não acontece de novo.
 *   - Atomicidade no decremento via `UPDATE ... WHERE balance >= debit`:
 *     Postgres trava a linha; concorrência impossível ficar negativa.
 *   - Status auto-promove pra `depleted` quando saldo chega a 0.
 */
export async function atomicDebitGiftCard(args: {
  cardId: string;
  mpOrderId: string;
  debitCents: number;
}): Promise<GiftCardDebitResult> {
  if (args.debitCents <= 0) {
    return {
      ok: false,
      error: "insufficient_or_inactive",
      message: "Valor de débito inválido.",
    };
  }
  const sb = getAdminSupabase();
  const { data, error } = await sb.rpc("debit_gift_card", {
    p_card_id: args.cardId,
    p_mp_order_id: args.mpOrderId,
    p_debit_cents: args.debitCents,
  });
  if (error) {
    console.error("[gift-cards] debit_gift_card RPC error:", error);
    return {
      ok: false,
      error: "db_error",
      message: error.message,
    };
  }
  const result = data as {
    ok: boolean;
    error?: string;
    code?: string;
    debited_cents?: number;
    new_balance_cents?: number;
    new_status?: GiftCardRow["status"];
  };
  if (!result.ok) {
    if (result.error === "already_debited") {
      return {
        ok: false,
        error: "already_debited",
        message: "Vale já foi debitado pra esse pedido (idempotente).",
      };
    }
    return {
      ok: false,
      error: "insufficient_or_inactive",
      message: "Saldo insuficiente ou vale inativo.",
    };
  }
  return {
    ok: true,
    cardId: args.cardId,
    code: result.code ?? "",
    debitedCents: result.debited_cents ?? args.debitCents,
    newBalanceCents: result.new_balance_cents ?? 0,
    newStatus: result.new_status ?? "active",
  };
}

export type GiftCardRefundResult =
  | {
      ok: true;
      cardId: string;
      code: string;
      refundedCents: number;
      newBalanceCents: number;
      newStatus: GiftCardRow["status"];
    }
  | {
      ok: false;
      error: "already_refunded" | "not_found" | "db_error";
      message: string;
    };

/**
 * Reverte um débito quando o MP estornar o pagamento. Chama a RPC
 * `refund_gift_card`. Idempotente via UNIQUE(card, mp_order, 'refund').
 */
export async function refundGiftCard(args: {
  cardId: string;
  mpOrderId: string;
  refundCents: number;
}): Promise<GiftCardRefundResult> {
  if (args.refundCents <= 0) {
    return {
      ok: false,
      error: "db_error",
      message: "Valor de refund inválido.",
    };
  }
  const sb = getAdminSupabase();
  const { data, error } = await sb.rpc("refund_gift_card", {
    p_card_id: args.cardId,
    p_mp_order_id: args.mpOrderId,
    p_refund_cents: args.refundCents,
  });
  if (error) {
    console.error("[gift-cards] refund_gift_card RPC error:", error);
    return { ok: false, error: "db_error", message: error.message };
  }
  const result = data as {
    ok: boolean;
    error?: string;
    code?: string;
    refunded_cents?: number;
    new_balance_cents?: number;
    new_status?: GiftCardRow["status"];
  };
  if (!result.ok) {
    if (result.error === "already_refunded") {
      return {
        ok: false,
        error: "already_refunded",
        message: "Refund já aplicado (idempotente).",
      };
    }
    if (result.error === "not_found") {
      return {
        ok: false,
        error: "not_found",
        message: "Vale não encontrado.",
      };
    }
    return {
      ok: false,
      error: "db_error",
      message: result.error ?? "Falha desconhecida no refund.",
    };
  }
  return {
    ok: true,
    cardId: args.cardId,
    code: result.code ?? "",
    refundedCents: result.refunded_cents ?? args.refundCents,
    newBalanceCents: result.new_balance_cents ?? 0,
    newStatus: result.new_status ?? "active",
  };
}

/**
 * Lookup do `gift_card_id` que foi debitado por um pagamento MP. Usado pelo
 * webhook quando recebemos um refund — precisamos saber qual vale restaurar.
 */
export async function findGiftCardByMpOrder(
  mpOrderId: string,
): Promise<{ cardId: string; debitedCents: number } | null> {
  const sb = getAdminSupabase();
  const { data, error } = await sb
    .from("gift_card_redemptions")
    .select("gift_card_id, amount_cents")
    .eq("mp_order_id", mpOrderId)
    .eq("type", "redemption")
    .maybeSingle();
  if (error || !data) return null;
  return {
    cardId: (data as { gift_card_id: string }).gift_card_id,
    debitedCents: (data as { amount_cents: number }).amount_cents,
  };
}

/**
 * Emite um novo vale-presente. Chamado pelo `mp-webhook` quando o pagamento
 * de uma compra contendo SKU `vale-presente` é confirmado. Tenta até 5 vezes
 * pra resolver colisões raras de código (UNIQUE constraint).
 */
export async function issueGiftCard(args: {
  valueCents: number;
  buyerEmail: string;
  buyerName?: string | null;
  recipientEmail?: string | null;
  recipientName?: string | null;
  personalMessage?: string | null;
  mpPurchasePaymentId?: string | null;
  mpPurchaseExternalReference?: string | null;
}): Promise<{ ok: true; card: GiftCardRow } | { ok: false; error: string }> {
  const sb = getAdminSupabase();
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + GIFT_CARD_VALIDITY_MONTHS);

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateGiftCardCode();
    const { data, error } = await sb
      .from("gift_cards")
      .insert({
        code,
        value_cents: args.valueCents,
        balance_cents: args.valueCents,
        status: "active",
        buyer_email: args.buyerEmail,
        buyer_name: args.buyerName ?? null,
        recipient_email: args.recipientEmail ?? null,
        recipient_name: args.recipientName ?? null,
        personal_message: args.personalMessage ?? null,
        mp_purchase_payment_id: args.mpPurchasePaymentId ?? null,
        mp_purchase_external_reference: args.mpPurchaseExternalReference ?? null,
        expires_at: expiresAt.toISOString(),
      })
      .select("*")
      .single();
    if (!error && data) {
      return { ok: true, card: data as GiftCardRow };
    }
    if (
      error &&
      (error.code === "23505" || error.message.toLowerCase().includes("duplicate"))
    ) {
      // colisão de código, tenta de novo
      continue;
    }
    if (error) {
      console.error("[gift-cards] issue error:", error);
      return { ok: false, error: error.message };
    }
  }
  return { ok: false, error: "Falha ao gerar código único após 5 tentativas." };
}
