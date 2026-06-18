/**
 * Bling v3 — Estoque (lançamentos / depósitos).
 *
 * Endpoints usados:
 *   GET  /depositos   → lista depósitos (auto-descobre o id quando
 *                       BLING_DEPOSITO_ID não está setado e só existe 1)
 *   POST /estoques    → cria um lançamento de estoque (movimento)
 *
 * `operacao`:
 *   "E" = entrada   → SOMA `quantidade` ao saldo
 *   "S" = saída     → SUBTRAI `quantidade` do saldo
 *   "B" = balanço   → DEFINE o saldo absoluto = `quantidade`
 *
 * Modelo PR Tracker = produção sob demanda (impressão 3D / make-to-order):
 * estoque virtualmente infinito. Usamos balanço pra FIXAR o saldo num teto
 * alto, só pra os marketplaces integrados via Bling nunca verem "esgotado".
 * Como balanço grava o valor absoluto, rodar de novo é idempotente — nunca
 * acumula (diferente de uma entrada, que somaria a cada chamada).
 *
 * Caveat: o Bling dá baixa no estoque quando um pedido de venda é criado.
 * Com teto de 9999 isso é irrelevante na prática (não vendemos 9 mil unidades
 * antes de um novo balanço), mas pra "set and forget" total dá pra agendar
 * um re-balanço no cron — ver /api/admin/bling/sync-stock.
 */

import { blingFetch } from "./api";
import { listAllProducts, type BlingProduct } from "./products";

export type EstoqueOperacao = "E" | "S" | "B";

export interface BlingDeposito {
  id: number;
  descricao?: string;
  /** 1 = ativo. */
  situacao?: number;
  /** Depósito padrão da empresa. */
  padrao?: boolean;
}

export async function listDepositos(
  accessToken?: string,
): Promise<BlingDeposito[]> {
  const list = await blingFetch<BlingDeposito[] | undefined>("/depositos", {
    method: "GET",
    accessToken,
  });
  return Array.isArray(list) ? list : [];
}

/**
 * Resolve o id do depósito a usar nos lançamentos.
 *   1. Se vier um id explícito (env BLING_DEPOSITO_ID) → usa ele.
 *   2. Senão lista os depósitos: 1 só → usa ele; vários → exige o `padrao`.
 * Lança se não der pra decidir (operador precisa setar BLING_DEPOSITO_ID).
 */
export async function resolveDepositoId(
  explicitId?: number,
  accessToken?: string,
): Promise<number> {
  if (explicitId && explicitId > 0) return explicitId;

  const depositos = await listDepositos(accessToken);
  const first = depositos[0];
  if (!first) {
    throw new Error("nenhum depósito encontrado no Bling");
  }

  const padrao = depositos.find((d) => d.padrao);
  if (padrao) return padrao.id;
  if (depositos.length === 1) return first.id;

  throw new Error(
    `${depositos.length} depósitos no Bling e nenhum marcado como padrão — ` +
      "defina BLING_DEPOSITO_ID nas env vars",
  );
}

export interface StockMovementInput {
  produtoId: number;
  depositoId: number;
  operacao: EstoqueOperacao;
  quantidade: number;
  observacoes?: string;
}

/**
 * POST /estoques — cria um lançamento de estoque (movimento).
 */
export async function postStockMovement(
  input: StockMovementInput,
  accessToken?: string,
): Promise<unknown> {
  const body: Record<string, unknown> = {
    produto: { id: input.produtoId },
    deposito: { id: input.depositoId },
    operacao: input.operacao,
    quantidade: input.quantidade,
  };
  if (input.observacoes) body.observacoes = input.observacoes;

  return await blingFetch("/estoques", {
    method: "POST",
    body,
    accessToken,
  });
}

const INFINITE_STOCK_NOTE =
  "Estoque infinito (produção sob demanda) — PR Tracker";

/**
 * Fixa o saldo absoluto de um produto via balanço (operacao "B").
 * Idempotente: o resultado é sempre saldo = `quantidade`.
 */
export async function setStockBalance(
  produtoId: number,
  depositoId: number,
  quantidade: number,
  observacoes: string = INFINITE_STOCK_NOTE,
  accessToken?: string,
): Promise<unknown> {
  return postStockMovement(
    { produtoId, depositoId, operacao: "B", quantidade, observacoes },
    accessToken,
  );
}

/** Saldo alvo padrão pro "estoque infinito" (teto alto que nunca zera). */
export const DEFAULT_STOCK_TARGET = 9999;

export interface SyncStockOptions {
  /** true → monta o plano mas NÃO chama o Bling (preview). */
  dryRun?: boolean;
  /** Saldo alvo. Default DEFAULT_STOCK_TARGET (9999). */
  target?: number;
  /** Restringe aos códigos (SKU) informados. Omitido = todos os físicos. */
  only?: string[] | null;
  /** Override do depósito (senão usa env / auto-descoberta). */
  depositoId?: number;
}

export interface SyncStockItemResult {
  blingId: number;
  codigo: string | null;
  nome: string;
  target: number;
  status: "ok" | "error" | "planned";
  error?: string;
}

export interface SyncStockReport {
  dryRun: boolean;
  depositoId: number;
  target: number;
  total: number;
  /** Serviços (tipo "S", ex: vale-presente) ignorados — não têm estoque. */
  skippedServices: number;
  applied: SyncStockItemResult[];
  planned: SyncStockItemResult[];
  errors: SyncStockItemResult[];
}

/**
 * Fixa estoque "infinito" (teto alto) em todos os produtos físicos do Bling
 * via balanço. Idempotente. Usada pelo endpoint admin e pelo cron diário.
 *
 * Coleta erros por-produto sem abortar o lote (um SKU que falha não derruba
 * os outros).
 */
export async function syncInfiniteStock(
  opts: SyncStockOptions = {},
): Promise<SyncStockReport> {
  const dryRun = opts.dryRun === true;
  const target =
    typeof opts.target === "number" && opts.target >= 0
      ? Math.floor(opts.target)
      : DEFAULT_STOCK_TARGET;
  const onlyFilter =
    opts.only && opts.only.length > 0 ? new Set(opts.only) : null;

  const depositoId = await resolveDepositoId(opts.depositoId);

  const all: BlingProduct[] = await listAllProducts();

  let skippedServices = 0;
  const targets = all.filter((p) => {
    if (p.tipo === "S") {
      skippedServices++;
      return false;
    }
    if (onlyFilter && !(p.codigo && onlyFilter.has(p.codigo))) return false;
    return true;
  });

  const results: SyncStockItemResult[] = [];
  for (const p of targets) {
    const base = {
      blingId: p.id,
      codigo: p.codigo ?? null,
      nome: p.nome,
      target,
    };
    if (dryRun) {
      results.push({ ...base, status: "planned" });
      continue;
    }
    try {
      await setStockBalance(p.id, depositoId, target);
      results.push({ ...base, status: "ok" });
    } catch (err) {
      results.push({
        ...base,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    dryRun,
    depositoId,
    target,
    total: results.length,
    skippedServices,
    applied: results.filter((r) => r.status === "ok"),
    planned: results.filter((r) => r.status === "planned"),
    errors: results.filter((r) => r.status === "error"),
  };
}
