/**
 * Sync a TikTok Shop order into Bling como pedido de venda + NF-e.
 *
 * Espelho de `sync.ts` (que sincroniza MP), mas mapeando do payload TikTok:
 *
 *   nome             ← order.cpf_name  (nome legal Receita Federal)
 *   CPF              ← order.cpf
 *   email/telefone   ← order.buyer_email / order.recipient_address.phone_number
 *                       (frequentemente mascarados — informativos só)
 *   endereço         ← recipient_address.{address_line2, _3, _4, _1} + postal_code
 *                       + district_info[L2].address_name (cidade)
 *                       + district_info[L1].iso_code (UF)
 *   itens            ← line_items agrupados por seller_sku (cada line_item é 1 unidade)
 *   frete            ← payment.shipping_fee
 *   total            ← payment.total_amount
 *
 * Idempotência: INSERT em `tiktok_bling_orders` com `tiktok_order_id` UNIQUE.
 * Retry seguro: status=failed/pending → roda de novo; status=synced → skip.
 *
 * Diferença chave vs MP: TikTok já cobrou do cliente e cuida do fulfillment via
 * Jadlog 4PL. Bling só registra a venda + emite NF-e. Não criamos label nem
 * processamos pagamento.
 */

import { getAdminSupabase } from "~/lib/supabase/server";
import {
  getValidAccessToken,
  isConnected,
  BlingNotConnectedError,
} from "./oauth";
import { getOrCreateContact } from "./contacts";
import { getOrCreateProduct } from "./products";
import { createSalesOrder, type SalesOrderItemInput } from "./orders";
import { BlingApiError } from "./api";
import {
  createAndEmitNfe,
  type NfeContatoSnapshot,
  type NfeOutcomeStatus,
} from "./nfe";
import type { TikTokOrder } from "~/lib/tiktok/orders";

export interface TikTokSyncResult {
  ok: boolean;
  status: "synced" | "skipped" | "failed" | "pending";
  blingPedidoId?: string;
  blingPedidoNumero?: string;
  blingContatoId?: string;
  nfeStatus?: NfeOutcomeStatus;
  error?: string;
  message?: string;
}

const NCM_DEFAULT = "39264000"; // estatuetas de plástico (kits + anilhas PR Tracker)
const NCM_TEE = "61091000"; // camisetas de algodão

function digits(s: unknown): string {
  return String(s ?? "").replace(/\D/g, "");
}

function getEnvInt(name: string): number | undefined {
  const raw = (import.meta.env as any)[name] || (process.env as any)[name];
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Heurística: TT-TEE-* / TEE-* viram camiseta (NCM 61091000). Resto é kit/anilha
 * (NCM 39264000). Bling não rejeita NCM se vier consistente com a venda.
 */
function ncmForSku(sellerSku: string | undefined): string {
  if (!sellerSku) return NCM_DEFAULT;
  if (/(TEE-|CAMISETA)/i.test(sellerSku)) return NCM_TEE;
  return NCM_DEFAULT;
}

/**
 * Cada line_item TikTok = 1 unidade. Agrupa por seller_sku pra economizar
 * linhas no pedido Bling (1 produto com qty=N em vez de N linhas com qty=1).
 */
interface GroupedLine {
  codigo: string;
  nome: string;
  qty: number;
  unitPrice: number;
  ncm: string;
}

function groupLineItems(order: TikTokOrder): GroupedLine[] {
  const items = order.line_items ?? [];
  const map = new Map<string, GroupedLine>();
  for (const it of items) {
    const codigo =
      (it.seller_sku && it.seller_sku.trim()) ||
      (it.product_id ? `TT-PROD-${it.product_id}` : "TT-UNKNOWN");
    const unit = Number(it.sale_price ?? 0);
    const existing = map.get(codigo);
    if (existing) {
      existing.qty += 1;
    } else {
      map.set(codigo, {
        codigo: codigo.slice(0, 60),
        nome: (it.product_name ?? codigo).slice(0, 120),
        qty: 1,
        unitPrice: Number.isFinite(unit) && unit > 0 ? unit : 0.01,
        ncm: ncmForSku(it.seller_sku),
      });
    }
  }
  return Array.from(map.values());
}

function ufFromDistrictInfo(order: TikTokOrder): string {
  const di = order.recipient_address?.district_info ?? [];
  const state = di.find((d) => d.address_level === "L1");
  return (state?.iso_code ?? state?.address_name ?? "").toUpperCase().slice(0, 2);
}

function cityFromDistrictInfo(order: TikTokOrder): string {
  const di = order.recipient_address?.district_info ?? [];
  const muni = di.find((d) => d.address_level === "L2");
  return muni?.address_name ?? "";
}

function buildContatoSnapshot(order: TikTokOrder): NfeContatoSnapshot {
  const r = order.recipient_address ?? {};
  const nome =
    (order.cpf_name && order.cpf_name.trim()) ||
    r.name ||
    [r.first_name, r.last_name].filter(Boolean).join(" ") ||
    "Cliente TikTok Shop";
  const cep = digits(r.postal_code ?? r.post_code);
  return {
    nome,
    tipoPessoa: "F",
    numeroDocumento: digits(order.cpf),
    contribuinte: 9, // não contribuinte ICMS (PF padrão)
    email: order.buyer_email || undefined,
    telefone: digits(r.phone_number) || undefined,
    endereco: {
      endereco: (r.address_line2 ?? r.address_detail ?? "").trim(),
      numero: (r.address_line3 ?? "").trim() || "S/N",
      complemento: (r.address_line4 ?? "").trim() || undefined,
      bairro: (r.address_line1 ?? "").trim(),
      cep,
      municipio: cityFromDistrictInfo(order),
      uf: ufFromDistrictInfo(order),
    },
  };
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

interface PersistInitial {
  alreadyExists: boolean;
  row: {
    tiktok_order_id: string;
    status: string;
    bling_pedido_id: string | null;
    bling_pedido_numero: string | null;
    attempt_count: number;
  } | null;
}

async function persistInitial(orderId: string): Promise<PersistInitial> {
  const sb = getAdminSupabase();
  const { data: existing } = await sb
    .from("tiktok_bling_orders")
    .select(
      "tiktok_order_id, status, bling_pedido_id, bling_pedido_numero, attempt_count",
    )
    .eq("tiktok_order_id", orderId)
    .maybeSingle();
  if (existing) return { alreadyExists: true, row: existing as any };

  const { data: inserted } = await sb
    .from("tiktok_bling_orders")
    .insert({ tiktok_order_id: orderId, status: "pending", attempt_count: 0 })
    .select(
      "tiktok_order_id, status, bling_pedido_id, bling_pedido_numero, attempt_count",
    )
    .single();
  return { alreadyExists: false, row: (inserted as any) ?? null };
}

export async function syncTikTokOrderToBling(
  order: TikTokOrder,
): Promise<TikTokSyncResult> {
  const orderId = String(order.id ?? "");
  if (!orderId) {
    return { ok: false, status: "failed", error: "missing order.id" };
  }

  if (!(await isConnected())) {
    // Não bloqueia — registra pending pra retry depois.
    await persistInitial(orderId);
    return {
      ok: false,
      status: "pending",
      message: "Bling não conectado — pedido aguardando autorização OAuth",
    };
  }

  const sb = getAdminSupabase();
  const initial = await persistInitial(orderId);
  if (initial.alreadyExists && initial.row?.status === "synced") {
    return {
      ok: true,
      status: "skipped",
      blingPedidoId: initial.row.bling_pedido_id ?? undefined,
      blingPedidoNumero: initial.row.bling_pedido_numero ?? undefined,
      message: "already synced — skipping",
    };
  }

  try {
    const accessToken = await getValidAccessToken();

    // ---- Customer ----
    const cpf = digits(order.cpf);
    if (!cpf || cpf.length !== 11) {
      throw new Error(
        `CPF inválido ou ausente no pedido TikTok ${orderId} (encontrado: "${cpf}")`,
      );
    }
    const snapshot = buildContatoSnapshot(order);
    const customerName = snapshot.nome ?? "Cliente TikTok Shop";

    const contato = await getOrCreateContact(
      {
        nome: customerName,
        numeroDocumento: cpf,
        tipo: "F",
        email: snapshot.email,
        telefone: snapshot.telefone,
        endereco: snapshot.endereco,
      },
      accessToken,
    );

    // ---- Items ----
    const grouped = groupLineItems(order);
    if (grouped.length === 0) {
      throw new Error(`Nenhum line_item no pedido TikTok ${orderId}`);
    }

    const lines: SalesOrderItemInput[] = [];
    for (const g of grouped) {
      const produto = await getOrCreateProduct(
        {
          nome: g.nome,
          codigo: g.codigo,
          preco: g.unitPrice,
          ncm: g.ncm,
        },
        accessToken,
      );
      lines.push({
        produtoId: produto.id,
        quantidade: g.qty,
        valor: g.unitPrice,
      });
    }

    // ---- Freight & totals ----
    // TikTok cobre o frete (Jadlog 4PL) — pra Bling reportamos como informativo
    // se vier > 0 em shipping_fee. Geralmente é 0 pro seller.
    const freightReais = Number(order.payment?.shipping_fee ?? 0);
    const observacoesInternas = [
      `TikTok order_id: ${orderId}`,
      `payment_method: ${order.payment?.payment_method_name ?? "—"}`,
      `total_amount: ${order.payment?.total_amount ?? "—"}`,
      `need_upload_invoice: ${order.need_upload_invoice ?? "—"}`,
    ].join("\n");

    const created = await createSalesOrder(
      {
        contatoId: contato.id,
        itens: lines,
        frete: freightReais > 0 ? freightReais : undefined,
        numeroLoja: `tt-${orderId}`,
        lojaId: getEnvInt("BLING_LOJA_TIKTOK_ID") ?? getEnvInt("BLING_LOJA_ID"),
        depositoId: getEnvInt("BLING_DEPOSITO_ID"),
        naturezaOperacaoId: getEnvInt("BLING_NATUREZA_OPERACAO_ID"),
        transportadorNome: "Jadlog 4PL (TikTok Shop)",
        observacoes: `Pedido TikTok Shop — ${orderId}`,
        observacoesInternas,
      },
      accessToken,
    );

    await sb
      .from("tiktok_bling_orders")
      .update({
        status: "synced",
        bling_pedido_id: String(created.id),
        bling_pedido_numero: created.numero ?? null,
        bling_contato_id: String(contato.id),
        request_payload: { lines, contato_id: contato.id, freightReais },
        response_payload: { id: created.id, numero: created.numero },
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        attempt_count: (initial.row?.attempt_count ?? 0) + 1,
        error: null,
      })
      .eq("tiktok_order_id", orderId);

    // ---- NF-e ----
    const nfeStatus = await emitAndPersistNfe({
      orderId,
      contatoId: contato.id,
      contatoSnapshot: snapshot,
      grouped,
      freightReais,
      accessToken,
    });

    return {
      ok: true,
      status: "synced",
      blingPedidoId: String(created.id),
      blingPedidoNumero: created.numero,
      blingContatoId: String(contato.id),
      nfeStatus,
    };
  } catch (err) {
    const message = formatError(err);
    console.error(`[tiktok-bling-sync] failed for order ${orderId}:`, err);
    await sb
      .from("tiktok_bling_orders")
      .update({
        status: "failed",
        error: message,
        response_payload:
          err instanceof BlingApiError
            ? { status: err.status, type: err.type, fields: err.fields, raw: err.raw }
            : null,
        attempt_count: (initial.row?.attempt_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("tiktok_order_id", orderId);
    return { ok: false, status: "failed", error: message };
  }
}

interface EmitNfeArgs {
  orderId: string;
  contatoId: number;
  contatoSnapshot: NfeContatoSnapshot;
  grouped: GroupedLine[];
  freightReais: number;
  accessToken: string;
}

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
    nfeError = "BLING_NATUREZA_OPERACAO_ID não configurado";
  } else {
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const itensSum = round2(
      args.grouped.reduce((s, g) => s + g.unitPrice * g.qty, 0),
    );
    const totalValor = round2(itensSum + args.freightReais);

    const itens = args.grouped.map((g) => ({
      codigo: g.codigo,
      descricao: g.nome,
      quantidade: g.qty,
      valor: round2(g.unitPrice),
      ncm: g.ncm,
    }));

    const nfeRes = await createAndEmitNfe(
      {
        contatoId: args.contatoId,
        contato: args.contatoSnapshot,
        naturezaOperacaoId,
        lojaId: getEnvInt("BLING_LOJA_TIKTOK_ID") ?? getEnvInt("BLING_LOJA_ID"),
        itens,
        totalValor: Math.max(0.01, totalValor),
        frete: args.freightReais > 0 ? args.freightReais : undefined,
        numeroPedido: `tt-${args.orderId}`,
        observacoes: `Pedido TikTok Shop — ${args.orderId}`,
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
    .from("tiktok_bling_orders")
    .update({
      ...nfeFields,
      nfe_status: nfeOutcome,
      nfe_error: nfeError ?? null,
      nfe_emitted_at: nfeOutcome === "emitted" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("tiktok_order_id", args.orderId);

  return nfeOutcome;
}
