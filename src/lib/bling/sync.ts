/**
 * Sync an MP-approved payment into Bling as a new sales order (pedido de venda).
 *
 * Called from /api/mp-webhook (and /api/admin/bling/retry/[id]) — both
 * pass an already-fetched MP payment object so Bling sync stays
 * de-duplicated on `mp_payment_id`.
 *
 * Flow per call:
 *   1. Acquire idempotency lock via INSERT ... ON CONFLICT DO NOTHING on
 *      bling_orders.mp_payment_id. If we lost the race, return early
 *      with the existing record (success or otherwise).
 *   2. Fetch a valid Bling access_token (auto-refresh inside the lib).
 *   3. getOrCreateContact(cpf) → contato Bling.
 *   4. For each item in metadata.items_skus → explode into SkuLines and
 *      getOrCreateProduct for each código.
 *   5. createSalesOrder with itens + frete + descontos + loja + observações.
 *   6. UPDATE bling_orders → status='synced', bling_pedido_id, response.
 *   7. On any thrown error: UPDATE → status='failed', error message,
 *      raw payloads. Returns gracefully (no throw to caller) so the
 *      webhook's Promise.allSettled doesn't reject.
 */

import type { Payment } from "mercadopago";
import { getAdminSupabase } from "~/lib/supabase/server";
import {
  getValidAccessToken,
  isConnected,
  BlingNotConnectedError,
} from "./oauth";
import { getOrCreateContact } from "./contacts";
import { getOrCreateProduct } from "./products";
import {
  createSalesOrder,
  findSalesOrderByNumeroLoja,
  type SalesOrderItemInput,
} from "./orders";
import { explodeLineToBling, type ItemSku, type SkuLine } from "./sku-map";
import { BlingApiError } from "./api";
import { createAndEmitNfe, type NfeContatoSnapshot, type NfeOutcomeStatus } from "./nfe";

type MpPayment = Awaited<ReturnType<Payment["get"]>>;

export interface SyncResult {
  ok: boolean;
  status: "synced" | "skipped" | "failed" | "pending";
  blingPedidoId?: string;
  blingPedidoNumero?: string;
  blingContatoId?: string;
  error?: string;
  message?: string;
}

function digits(s: unknown): string {
  return String(s ?? "").replace(/\D/g, "");
}

function getEnvInt(name: string): number | undefined {
  const raw = (import.meta.env as any)[name] || (process.env as any)[name];
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function syncOrderToBling(payment: MpPayment): Promise<SyncResult> {
  const paymentId = String(payment.id ?? "");
  if (!paymentId) {
    return { ok: false, status: "failed", error: "missing payment.id" };
  }

  // Skip cleanly if the operator hasn't run the OAuth dance yet — webhook
  // shouldn't fail just because Bling isn't configured. Log + persist a
  // 'pending' row so it shows up in /admin/bling for later retry.
  const externalRefEarly = payment.external_reference ?? `mp-${paymentId}`;

  if (!(await isConnected())) {
    await ensurePendingRow(paymentId, externalRefEarly);
    return {
      ok: false,
      status: "pending",
      message: "Bling não conectado — pedido aguardando autorização OAuth",
    };
  }

  // 1) Atomic claim — only one worker proceeds per payment. Closes the
  //    duplicated-NF race when MP retries a webhook (or webhook + manual retry
  //    overlap). See claimOrder().
  const sb = getAdminSupabase();
  const claim = await claimOrder(paymentId, externalRefEarly);
  if (!claim.claimed) {
    if (claim.reason === "synced") {
      return {
        ok: true,
        status: "skipped",
        blingPedidoId: claim.row?.bling_pedido_id ?? undefined,
        blingPedidoNumero: claim.row?.bling_pedido_numero ?? undefined,
        message: "already synced — skipping",
      };
    }
    return {
      ok: true,
      status: "skipped",
      message: "outro worker já está sincronizando este pagamento — skipping",
    };
  }
  const ledger = claim.row;

  try {
    const accessToken = await getValidAccessToken();
    const meta = (payment.metadata ?? {}) as Record<string, unknown>;
    const payer = payment.payer ?? {};
    const ident = payer.identification ?? {};

    // ---- Customer ----
    const cpf = digits(meta.customer_cpf ?? ident.number);
    if (!cpf || cpf.length !== 11) {
      throw new Error(
        `CPF inválido ou ausente no payment ${paymentId} (encontrado: "${cpf}")`,
      );
    }
    const customerName =
      String(meta.customer_name ?? "") ||
      [payer.first_name, payer.last_name].filter(Boolean).join(" ") ||
      "Cliente PR Tracker";
    const customerEmail =
      String(meta.customer_email ?? "") || String(payer.email ?? "");
    const customerPhone =
      String(meta.customer_phone ?? "") ||
      `${payer.phone?.area_code ?? ""}${payer.phone?.number ?? ""}`;

    const contato = await getOrCreateContact(
      {
        nome: customerName,
        numeroDocumento: cpf,
        tipo: "F",
        email: customerEmail,
        telefone: customerPhone,
        endereco: {
          endereco: String(meta.shipping_street ?? ""),
          numero: String(meta.shipping_number ?? ""),
          complemento: String(meta.shipping_complement ?? ""),
          bairro: String(meta.shipping_neighborhood ?? ""),
          cep: digits(meta.shipping_cep),
          municipio: String(meta.shipping_city ?? ""),
          uf: String(meta.shipping_state ?? ""),
        },
      },
      accessToken,
    );

    // ---- Items ----
    let itemsSkusRaw: ItemSku[] = [];
    try {
      const raw = String(meta.items_skus ?? "");
      itemsSkusRaw = raw ? JSON.parse(raw) : [];
    } catch {
      throw new Error(`metadata.items_skus inválido no payment ${paymentId}`);
    }
    if (itemsSkusRaw.length === 0) {
      throw new Error(`Nenhum item no payment ${paymentId} (items_skus vazio)`);
    }

    const lines: SalesOrderItemInput[] = [];
    // Keep the SkuLine[] alongside so we can pass codigo/descricao/ncm to
    // NF-e emission later without re-walking the cart.
    const skuLines: SkuLine[] = [];
    for (const item of itemsSkusRaw) {
      const exploded = explodeLineToBling(item);
      for (const line of exploded) {
        const produto = await getOrCreateProduct(
          {
            nome: line.nome,
            codigo: line.codigo,
            preco: line.unitPrice,
            ncm: line.ncm,
            ...(line.pesoKg ? { pesoBruto: line.pesoKg } : {}),
          },
          accessToken,
        );
        lines.push({
          produtoId: produto.id,
          quantidade: line.qty,
          valor: line.unitPrice,
        });
        skuLines.push(line);
      }
    }

    // ---- Discounts + freight ----
    // The MP `additional_info.items` already has discount/freight as
    // negative/positive lines, but Bling has dedicated fields. We use the
    // metadata totals (cents) for accuracy.
    const couponCents = Number(meta.coupon_discount_cents ?? 0);
    const pixCents = Number(meta.pix_discount_cents ?? 0);
    const totalDiscountCents = couponCents + pixCents;
    const freightCents = Number(meta.freight_cents ?? 0);

    // ---- Order ----
    const externalRef = payment.external_reference ?? `mp-${paymentId}`;
    const observacoesInternas = [
      `MP payment_id: ${paymentId}`,
      `external_reference: ${externalRef}`,
      meta.coupon_code ? `cupom: ${meta.coupon_code}` : null,
      meta.coupon_credited_to
        ? `cupom_creditado_a: ${meta.coupon_credited_to}`
        : null,
      `payment_method: ${meta.payment_method_hint ?? payment.payment_method_id ?? "—"}`,
    ]
      .filter(Boolean)
      .join("\n");

    // Bling-side idempotency: createSalesOrder is a POST (never retried). A lost
    // response would otherwise make the next run mint a twin pedido (duplicate
    // NF-e). Reuse an existing pedido carrying this numeroLoja if present.
    let created: { id: number | string; numero?: string } | null = null;
    try {
      created = await findSalesOrderByNumeroLoja(externalRef, accessToken);
    } catch (lookupErr) {
      console.warn(
        `[bling-sync] lookup pedido numeroLoja=${externalRef} falhou (seguindo p/ criar):`,
        lookupErr,
      );
    }
    if (!created) {
      created = await createSalesOrder(
        {
          contatoId: contato.id,
          itens: lines,
          frete: freightCents > 0 ? freightCents / 100 : undefined,
          descontoValor:
            totalDiscountCents > 0 ? totalDiscountCents / 100 : undefined,
          numeroLoja: externalRef,
          lojaId: getEnvInt("BLING_LOJA_ID"),
          depositoId: getEnvInt("BLING_DEPOSITO_ID"),
          naturezaOperacaoId: getEnvInt("BLING_NATUREZA_OPERACAO_ID"),
          transportadorNome:
            String(meta.shipping_service_name ?? "") || undefined,
          observacoes: `Pedido site PR Tracker — ${externalRef}`,
          observacoesInternas,
        },
        accessToken,
      );
    }

    // ---- Persist pedido success (nfe fields filled in step below) ----
    await sb
      .from("bling_orders")
      .update({
        status: "synced",
        bling_pedido_id: String(created.id),
        bling_pedido_numero: created.numero ?? null,
        bling_contato_id: String(contato.id),
        external_reference: externalRef,
        request_payload: { lines, contato_id: contato.id, freightCents, couponCents, pixCents },
        response_payload: { id: created.id, numero: created.numero },
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        attempt_count: (ledger.attempt_count ?? 0) + 1,
        error: null,
      })
      .eq("mp_payment_id", paymentId);

    // ---- NF-e emission (decoupled — pedido success is preserved if NF-e fails) ----
    // Status is 'synced' above (before NF), so any retry short-circuits at
    // claimOrder and never re-emits. Belt-and-suspenders: skip if this claimed
    // row already carried an NF.
    if (
      !ledger.bling_nfe_id ||
      (ledger.nfe_status !== "emitted" && ledger.nfe_status !== "pending")
    ) {
      await emitAndPersistNfe({
        paymentId,
        contatoId: contato.id,
        contatoSnapshot: buildContatoSnapshotFromMeta(meta, {
          cpf,
          nome: customerName,
          email: customerEmail,
          telefone: customerPhone,
        }),
        skuLines,
        freightCents,
        totalDiscountCents,
        externalRef,
        accessToken,
      });
    }

    return {
      ok: true,
      status: "synced",
      blingPedidoId: String(created.id),
      blingPedidoNumero: created.numero,
      blingContatoId: String(contato.id),
    };
  } catch (err) {
    const message = formatError(err);
    console.error(`[bling-sync] failed for payment ${paymentId}:`, err);
    await sb
      .from("bling_orders")
      .update({
        status: "failed",
        error: message,
        response_payload:
          err instanceof BlingApiError
            ? { status: err.status, type: err.type, fields: err.fields, raw: err.raw }
            : null,
        attempt_count: (ledger.attempt_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("mp_payment_id", paymentId);
    return { ok: false, status: "failed", error: message };
  }
}

interface LedgerRow {
  mp_payment_id: string;
  status: string;
  bling_pedido_id: string | null;
  bling_pedido_numero: string | null;
  bling_nfe_id: string | null;
  nfe_status: string | null;
  attempt_count: number;
}

const LEDGER_COLS =
  "mp_payment_id, status, bling_pedido_id, bling_pedido_numero, bling_nfe_id, nfe_status, attempt_count";

// A 'processing' row older than this is treated as a crashed/abandoned claim
// and may be reclaimed. Well above the Vercel function timeout.
const STALE_CLAIM_MS = 10 * 60 * 1000;

type ClaimResult =
  | { claimed: true; row: LedgerRow }
  | { claimed: false; reason: "synced" | "in_progress"; row: LedgerRow | null };

/**
 * Ensure a ledger row exists in 'pending' WITHOUT claiming it. Used only on the
 * Bling-not-connected path. INSERT ... ON CONFLICT DO NOTHING — never clobbers
 * an existing processing/synced/failed row.
 */
async function ensurePendingRow(
  paymentId: string,
  externalRef: string | null,
): Promise<void> {
  const sb = getAdminSupabase();
  await sb.from("bling_orders").upsert(
    {
      mp_payment_id: paymentId,
      external_reference: externalRef,
      status: "pending",
      attempt_count: 0,
    },
    { onConflict: "mp_payment_id", ignoreDuplicates: true },
  );
}

/**
 * Atomically claim a payment for syncing. Exactly one caller can hold the claim
 * at a time — the fix for duplicated NF-e. Mirrors claimOrder() in sync-tiktok.ts.
 */
async function claimOrder(
  paymentId: string,
  externalRef: string | null,
): Promise<ClaimResult> {
  const sb = getAdminSupabase();
  const now = new Date().toISOString();

  // 1) Insert the row already claimed. ON CONFLICT DO NOTHING → only the
  //    inserter gets a row back.
  const { data: inserted } = await sb
    .from("bling_orders")
    .upsert(
      {
        mp_payment_id: paymentId,
        external_reference: externalRef,
        status: "processing",
        attempt_count: 0,
      },
      { onConflict: "mp_payment_id", ignoreDuplicates: true },
    )
    .select(LEDGER_COLS);
  if (inserted && inserted.length > 0) {
    return { claimed: true, row: inserted[0] as LedgerRow };
  }

  // 2) Row already existed — read current state.
  const { data: existing } = await sb
    .from("bling_orders")
    .select(LEDGER_COLS)
    .eq("mp_payment_id", paymentId)
    .maybeSingle();
  const row = (existing as LedgerRow | null) ?? null;
  if (row?.status === "synced") {
    return { claimed: false, reason: "synced", row };
  }

  // 3) Atomically flip pending|failed → processing. Only one caller wins.
  const { data: claimed } = await sb
    .from("bling_orders")
    .update({ status: "processing", updated_at: now })
    .eq("mp_payment_id", paymentId)
    .in("status", ["pending", "failed"])
    .select(LEDGER_COLS);
  if (claimed && claimed.length > 0) {
    return { claimed: true, row: claimed[0] as LedgerRow };
  }

  // 4) Row is 'processing'. Reclaim only if stale (crashed prior run).
  const staleCutoff = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const { data: reclaimed } = await sb
    .from("bling_orders")
    .update({ status: "processing", updated_at: now })
    .eq("mp_payment_id", paymentId)
    .eq("status", "processing")
    .lt("updated_at", staleCutoff)
    .select(LEDGER_COLS);
  if (reclaimed && reclaimed.length > 0) {
    return { claimed: true, row: reclaimed[0] as LedgerRow };
  }

  return { claimed: false, reason: "in_progress", row };
}

interface EmitNfeArgs {
  paymentId: string;
  contatoId: number;
  contatoSnapshot: NfeContatoSnapshot;
  skuLines: SkuLine[];
  freightCents: number;
  totalDiscountCents: number;
  externalRef: string;
  accessToken: string;
}

/**
 * Build the contato snapshot for NF-e from MP payment metadata. The shipping
 * address comes from checkout (meta.shipping_*); falls back to empty strings
 * which Bling will reject — so any missing field surfaces as a clear SEFAZ
 * error rather than a silent NF emission with bad data.
 */
function buildContatoSnapshotFromMeta(
  meta: Record<string, unknown>,
  basics: { cpf: string; nome: string; email: string; telefone: string },
): NfeContatoSnapshot {
  return {
    nome: basics.nome,
    tipoPessoa: "F",
    numeroDocumento: basics.cpf,
    email: basics.email || undefined,
    telefone: basics.telefone || undefined,
    endereco: {
      endereco: String(meta.shipping_street ?? ""),
      numero: String(meta.shipping_number ?? "") || "S/N",
      complemento: String(meta.shipping_complement ?? "") || undefined,
      bairro: String(meta.shipping_neighborhood ?? ""),
      cep: digits(meta.shipping_cep),
      municipio: String(meta.shipping_city ?? ""),
      uf: String(meta.shipping_state ?? ""),
    },
  };
}

/**
 * Build NF-e payload from already-resolved order data, call createAndEmitNfe,
 * and persist outcome to bling_orders. Used by both the initial sync and the
 * /retry-nfe admin endpoint when the pedido is already in Bling but the NF-e
 * never emitted (or failed mid-way).
 */
async function emitAndPersistNfe(args: EmitNfeArgs): Promise<NfeOutcomeStatus> {
  const sb = getAdminSupabase();
  const naturezaOperacaoId = getEnvInt("BLING_NATUREZA_OPERACAO_ID");
  let nfeOutcome: NfeOutcomeStatus = "skipped";
  let nfeError: string | undefined;
  const nfeFields: Partial<{
    bling_nfe_id: string;
    bling_nfe_numero: string;
    bling_nfe_serie: string;
    bling_nfe_chave_acesso: string;
  }> = {};

  if (!naturezaOperacaoId) {
    console.warn("[bling-sync] BLING_NATUREZA_OPERACAO_ID not set — skipping NF-e auto-emission");
    nfeError = "BLING_NATUREZA_OPERACAO_ID não configurado";
  } else {
    // SEFAZ requires sum(parcelas) === total da nota. Bling computes total da
    // nota as sum(item.valor * qty) + frete (it does NOT subtract a top-level
    // `desconto` reliably). Instead of sending `desconto`, apply it pro-rata
    // on item unit prices so total da nota === parcelas by construction.
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const grossItemsCents = args.skuLines.reduce(
      (s, l) => s + Math.round(l.unitPrice * 100) * l.qty,
      0,
    );
    const discountCents = Math.max(0, args.totalDiscountCents);
    const freightReais = args.freightCents > 0 ? round2(args.freightCents / 100) : 0;
    // Pro-rata factor in [0, 1]. If discount >= gross, fall back to 0.01/item
    // (SEFAZ rejects zero-priced items on a venda).
    const netItemsCents = Math.max(args.skuLines.length, grossItemsCents - discountCents);
    const factor = grossItemsCents > 0 ? netItemsCents / grossItemsCents : 1;

    // Allocate the net items total across lines, distributing the rounding
    // remainder (in cents) to the first line so the sum is exact.
    let allocatedCents = 0;
    const itensWithNetUnit = args.skuLines.map((l, idx) => {
      const lineGrossCents = Math.round(l.unitPrice * 100) * l.qty;
      const lineNetCents =
        idx === args.skuLines.length - 1
          ? netItemsCents - allocatedCents
          : Math.round(lineGrossCents * factor);
      allocatedCents += lineNetCents;
      const unitNetCents = Math.round(lineNetCents / l.qty);
      return {
        codigo: l.codigo,
        descricao: l.nome,
        quantidade: l.qty,
        valor: round2(unitNetCents / 100),
        ncm: l.ncm,
      };
    });

    // Recompute the actual sum from the rounded unit prices (defensive — the
    // unit-rounding step can introduce tiny drift when qty > 1).
    const itensSumReais = round2(
      itensWithNetUnit.reduce((s, it) => s + it.valor * it.quantidade, 0),
    );
    const totalValor = round2(itensSumReais + freightReais);

    const nfeRes = await createAndEmitNfe(
      {
        contatoId: args.contatoId,
        contato: args.contatoSnapshot,
        naturezaOperacaoId,
        lojaId: getEnvInt("BLING_LOJA_ID"),
        itens: itensWithNetUnit,
        totalValor: Math.max(0.01, totalValor),
        // Discount is now baked into item prices — do NOT also send a
        // top-level `desconto` (would double-discount).
        frete: freightReais > 0 ? freightReais : undefined,
        numeroPedido: args.externalRef,
        observacoes:
          discountCents > 0
            ? `Ref pedido site: ${args.externalRef} | Desconto aplicado proporcionalmente nos itens (cupom/Pix R$ ${(discountCents / 100).toFixed(2)})`
            : `Ref pedido site: ${args.externalRef}`,
      },
      args.accessToken,
    );

    nfeOutcome = nfeRes.status;
    nfeError = nfeRes.error;
    if (nfeRes.nfeId) nfeFields.bling_nfe_id = String(nfeRes.nfeId);
    if (nfeRes.numero) nfeFields.bling_nfe_numero = nfeRes.numero;
    if (nfeRes.serie) nfeFields.bling_nfe_serie = nfeRes.serie;
    if (nfeRes.chaveAcesso) nfeFields.bling_nfe_chave_acesso = nfeRes.chaveAcesso;
  }

  await sb
    .from("bling_orders")
    .update({
      ...nfeFields,
      nfe_status: nfeOutcome,
      nfe_error: nfeError ?? null,
      nfe_emitted_at: nfeOutcome === "emitted" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("mp_payment_id", args.paymentId);

  return nfeOutcome;
}

/**
 * Emit NF-e for an MP payment whose pedido already exists in Bling.
 * Called from /api/admin/bling/retry-nfe when the row is status='synced'
 * but nfe_status is null/'skipped'/'failed' — re-derives skuLines from the
 * MP payment metadata and runs the NF-e step in isolation.
 */
export async function emitNfeForExistingOrder(
  payment: MpPayment,
): Promise<{ ok: boolean; status: NfeOutcomeStatus; error?: string }> {
  const paymentId = String(payment.id ?? "");
  const sb = getAdminSupabase();

  const { data: row } = await sb
    .from("bling_orders")
    .select("bling_contato_id, external_reference, status")
    .eq("mp_payment_id", paymentId)
    .maybeSingle();

  if (!row) {
    return { ok: false, status: "failed", error: "pedido não encontrado em bling_orders" };
  }
  if (!row.bling_contato_id) {
    return {
      ok: false,
      status: "failed",
      error: "bling_contato_id ausente — re-sincroniza o pedido primeiro",
    };
  }

  const meta = (payment.metadata ?? {}) as Record<string, unknown>;
  let itemsSkusRaw: ItemSku[] = [];
  try {
    const raw = String(meta.items_skus ?? "");
    itemsSkusRaw = raw ? JSON.parse(raw) : [];
  } catch {
    return { ok: false, status: "failed", error: "metadata.items_skus inválido" };
  }
  if (itemsSkusRaw.length === 0) {
    return { ok: false, status: "failed", error: "items_skus vazio em MP metadata" };
  }

  const skuLines: SkuLine[] = [];
  for (const item of itemsSkusRaw) {
    for (const line of explodeLineToBling(item)) skuLines.push(line);
  }

  const couponCents = Number(meta.coupon_discount_cents ?? 0);
  const pixCents = Number(meta.pix_discount_cents ?? 0);
  const freightCents = Number(meta.freight_cents ?? 0);
  const totalDiscountCents = couponCents + pixCents;
  const externalRef = payment.external_reference ?? row.external_reference ?? `mp-${paymentId}`;

  // Re-derive contato snapshot from the MP payment so the NF gets a complete
  // destinatário block (name + endereço) even if the original Bling contato
  // cadastro is missing fields.
  const payer = payment.payer ?? {};
  const ident = payer.identification ?? {};
  const cpf = digits(meta.customer_cpf ?? ident.number);
  const customerName =
    String(meta.customer_name ?? "") ||
    [payer.first_name, payer.last_name].filter(Boolean).join(" ") ||
    "Cliente PR Tracker";
  const customerEmail =
    String(meta.customer_email ?? "") || String(payer.email ?? "");
  const customerPhone =
    String(meta.customer_phone ?? "") ||
    `${payer.phone?.area_code ?? ""}${payer.phone?.number ?? ""}`;
  const contatoSnapshot = buildContatoSnapshotFromMeta(meta, {
    cpf,
    nome: customerName,
    email: customerEmail,
    telefone: customerPhone,
  });

  try {
    const accessToken = await getValidAccessToken();
    const outcome = await emitAndPersistNfe({
      paymentId,
      contatoId: Number(row.bling_contato_id),
      contatoSnapshot,
      skuLines,
      freightCents,
      totalDiscountCents,
      externalRef,
      accessToken,
    });
    return { ok: outcome === "emitted" || outcome === "pending", status: outcome };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await sb
      .from("bling_orders")
      .update({ nfe_status: "failed", nfe_error: msg, updated_at: new Date().toISOString() })
      .eq("mp_payment_id", paymentId);
    return { ok: false, status: "failed", error: msg };
  }
}

function formatError(err: unknown): string {
  if (err instanceof BlingApiError) {
    const lines = [err.message];
    if (err.description) lines.push(err.description);
    if (err.fields?.length) {
      for (const f of err.fields) {
        lines.push(`• ${f.element ? `${f.element}: ` : ""}${f.msg}`);
      }
    }
    return lines.join("\n");
  }
  if (err instanceof BlingNotConnectedError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
