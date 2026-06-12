/**
 * Bling v3 — Pedidos de venda.
 *
 * Endpoint: POST /pedidos/vendas
 *
 * Once the pedido is created with the right naturezaOperacao + contato (with
 * CPF) + itens (with NCM via the produto), the NF-e emits automatically per
 * the Bling config validated on NF Thawant 000019 (Apr 27, 2026).
 */

import { blingFetch } from "./api";

export interface SalesOrderItemInput {
  produtoId: number;
  /** Optional override of the product's default name (shows on NF-e). */
  descricao?: string;
  quantidade: number;
  /** Unit price in BRL (decimal, e.g., 119.90). */
  valor: number;
}

export interface CreateSalesOrderInput {
  /** Existing Bling contato (cliente). */
  contatoId: number;
  /** Order date. Defaults to today. */
  data?: string; // YYYY-MM-DD
  itens: SalesOrderItemInput[];
  /** Shipping cost in BRL (added separately, not as a line item). */
  frete?: number;
  /** Discount in BRL (Pix 5% + coupon, etc). */
  descontoValor?: number;
  /** External order id we surface in Bling search. */
  numeroLoja?: string;
  /** Loja (canal de venda) id — distinguishes Site from TikTok in reports. */
  lojaId?: number;
  /** Depósito id (estoque). Optional — Bling uses default if absent. */
  depositoId?: number;
  /** Natureza de operação id — defaults to empresa default if absent. */
  naturezaOperacaoId?: number;
  /** Public observation (visible on the order PDF). */
  observacoes?: string;
  /** Internal observation (audit only). */
  observacoesInternas?: string;
  /** Override delivery address (defaults to contato address if absent). */
  enderecoEntrega?: {
    endereco: string;
    numero: string;
    complemento?: string;
    bairro: string;
    cep: string;
    municipio: string;
    uf: string;
    pais?: string;
  };
  /** Transportador name (e.g., "Melhor Envio - SEDEX"). */
  transportadorNome?: string;
}

export interface CreateSalesOrderResponse {
  /** Bling internal id of the created pedido. */
  id: number;
  /** Sequential pedido number (e.g., "39"). */
  numero?: string;
}

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function createSalesOrder(
  input: CreateSalesOrderInput,
  accessToken?: string,
): Promise<CreateSalesOrderResponse> {
  const body: Record<string, unknown> = {
    data: input.data ?? todayISO(),
    contato: { id: input.contatoId },
    itens: input.itens.map((it) => ({
      produto: { id: it.produtoId },
      quantidade: it.quantidade,
      valor: it.valor,
      ...(it.descricao ? { descricao: it.descricao } : {}),
    })),
  };

  if (input.numeroLoja) body.numeroLoja = input.numeroLoja;
  if (input.lojaId) body.loja = { id: input.lojaId };
  if (input.depositoId) body.deposito = { id: input.depositoId };
  if (input.naturezaOperacaoId)
    body.naturezaOperacao = { id: input.naturezaOperacaoId };

  const transporte: Record<string, unknown> = {};
  if (input.frete != null && input.frete > 0) transporte.frete = input.frete;
  if (input.transportadorNome)
    transporte.transportador = { nome: input.transportadorNome };
  if (Object.keys(transporte).length > 0) body.transporte = transporte;

  if (input.descontoValor != null && input.descontoValor > 0) {
    body.desconto = { valor: input.descontoValor, unidade: "REAL" };
  }

  if (input.observacoes) body.observacoes = input.observacoes;
  if (input.observacoesInternas)
    body.observacoesInternas = input.observacoesInternas;

  if (input.enderecoEntrega) {
    body.enderecoEntrega = {
      ...input.enderecoEntrega,
      pais: input.enderecoEntrega.pais ?? "Brasil",
    };
  }

  const created = await blingFetch<CreateSalesOrderResponse>(
    "/pedidos/vendas",
    {
      method: "POST",
      body,
      accessToken,
    },
  );
  return created;
}

/**
 * Look up an existing pedido de venda by its `numeroLoja` (the external order
 * tag we set when creating it, e.g. `tt-<tiktok_order_id>`).
 *
 * Used for Bling-side idempotency: createSalesOrder is a POST, which blingFetch
 * never retries — so a lost response (timeout after Bling already persisted the
 * pedido) can leave us thinking it failed. Before creating a new pedido we check
 * here; if one already carries this numeroLoja, we reuse it instead of minting a
 * duplicate (which would produce a duplicate NF-e).
 *
 * Returns the first pedido whose numeroLoja matches EXACTLY, or null. The exact
 * match guards against Bling ignoring the filter and returning unrelated rows.
 */
export async function findSalesOrderByNumeroLoja(
  numeroLoja: string,
  accessToken?: string,
): Promise<CreateSalesOrderResponse | null> {
  if (!numeroLoja) return null;
  const list = await blingFetch<
    Array<{ id: number; numero?: string; numeroLoja?: string }>
  >("/pedidos/vendas", {
    method: "GET",
    query: { numeroLoja },
    accessToken,
  });
  const rows = Array.isArray(list) ? list : [];
  const match = rows.find((p) => String(p.numeroLoja ?? "") === numeroLoja);
  return match ? { id: match.id, numero: match.numero } : null;
}
