/**
 * TikTok Shop sales ingest.
 *
 * Duas etapas em sequência:
 *   1. Pulls orders via /order/202309/orders/search e upserta na tabela
 *      `sales` (channel='tiktok') — fonte de verdade pro admin dashboard.
 *   2. Pra cada pedido pago e não-cancelado que ainda não foi sincronizado
 *      com Bling, busca detail (CPF + endereço) e chama
 *      syncTikTokOrderToBling. Idempotente via `tiktok_bling_orders`.
 *
 * Erro num pedido individual NÃO derruba o cron — captura, registra
 * em `tiktok_bling_orders.status='failed'` e continua. Operador retenta
 * via botão /admin/tiktok.
 *
 * Re-runs são safe em ambas as etapas (upsert + ledger UNIQUE).
 */

import { getAdminSupabase } from "../supabase/server";
import { isConnected } from "../tiktok/oauth";
import { searchOrders, getOrderDetail, type TikTokOrder } from "../tiktok/orders";
import { syncTikTokOrderToBling } from "../bling/sync-tiktok";
import { isConnected as blingConnected } from "../bling/oauth";

export interface TikTokShopIngestResult {
  orders: number;
  durationMs: number;
  skipped?: boolean;
  reason?: string;
  bling?: {
    candidates: number;
    synced: number;
    skipped: number;
    failed: number;
    errors?: Array<{ order_id: string; error: string }>;
  };
}

/**
 * Convert a TikTok Shop order to a `sales` row. Unique key in `sales` is
 * (channel='tiktok', external_order_id=order.id) so re-runs upsert cleanly.
 */
export function orderToSaleRow(order: TikTokOrder) {
  const items = order.line_items ?? [];
  const firstItem = items[0];
  // Cada line_item TikTok representa 1 unidade do SKU. Total de unidades =
  // length de line_items.
  const quantity = items.length || 1;
  const productName = firstItem?.product_name ?? "TikTok Shop order";
  const productSlug = firstItem?.seller_sku ?? firstItem?.sku_id ?? null;
  const unitPrice = Number(firstItem?.sale_price ?? 0);
  const total = Number(order.payment?.total_amount ?? 0);
  const currency = (order.payment?.currency ?? "BRL") as "BRL";

  const createdAtMs =
    typeof order.create_time === "number" ? order.create_time * 1000 : Date.now();
  const createdAt = new Date(createdAtMs).toISOString();

  const customerName = order.recipient_address?.name ?? null;
  const customerEmail = order.buyer_email ?? null;

  return {
    channel: "tiktok" as const,
    external_order_id: String(order.id),
    product_slug: productSlug,
    product_name: productName,
    quantity,
    unit_price: unitPrice || total,
    total,
    currency,
    customer_email: customerEmail,
    customer_name: customerName,
    status: order.status ?? null,
    metadata: {
      status: order.status,
      line_items: items,
      payment: order.payment,
      recipient_address: order.recipient_address,
      buyer_message: order.buyer_message,
    },
    created_at: createdAt,
  };
}

/**
 * Pull TikTok Shop orders in the given window and upsert into `sales`.
 * Idempotent — re-runs upsert on (channel, external_order_id).
 */
export async function ingestTikTokShop(
  opts: { daysBack?: number } = {},
): Promise<TikTokShopIngestResult> {
  const t0 = Date.now();
  if (!(await isConnected())) {
    return {
      orders: 0,
      durationMs: Date.now() - t0,
      skipped: true,
      reason: "TikTok Shop not connected (no OAuth token stored)",
    };
  }

  const sb = getAdminSupabase();
  const daysBack = opts.daysBack ?? 90;

  const runRes = await sb
    .from("ingestion_runs")
    .insert({ source: "tiktok_shop", status: "running" })
    .select("id")
    .single();
  const runId = runRes.data?.id as string | undefined;

  let count = 0;
  let orders: TikTokOrder[] = [];

  try {
    const createdAfter = new Date();
    createdAfter.setDate(createdAfter.getDate() - daysBack);

    orders = await searchOrders({ createdAfter });
    if (orders.length > 0) {
      const rows = orders.map(orderToSaleRow);
      for (let i = 0; i < rows.length; i += 200) {
        const slice = rows.slice(i, i + 200);
        const { error } = await sb
          .from("sales")
          .upsert(slice, { onConflict: "channel,external_order_id" });
        if (error) throw new Error(`sales upsert failed: ${error.message}`);
      }
      count = rows.length;
    }

    if (runId) {
      await sb
        .from("ingestion_runs")
        .update({
          status: "success",
          rows_upserted: count,
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }
  } catch (e) {
    if (runId) {
      await sb
        .from("ingestion_runs")
        .update({
          status: "failed",
          error: (e as Error).message,
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }
    throw e;
  }

  // ===== Etapa 2: sync com Bling =====
  // Reusa `orders` já carregado do search. Filtra cancelados (não viram NF-e)
  // e pedidos já com status='synced' em `tiktok_bling_orders`.
  const blingResult = await syncEligibleOrdersToBling(sb);

  return {
    orders: count,
    durationMs: Date.now() - t0,
    bling: blingResult,
  };

  async function syncEligibleOrdersToBling(sb: ReturnType<typeof getAdminSupabase>) {
    const result = {
      candidates: 0,
      synced: 0,
      skipped: 0,
      failed: 0,
      errors: [] as Array<{ order_id: string; error: string }>,
    };

    if (!(await blingConnected())) {
      console.warn("[tiktok-shop-ingest] Bling não conectado — pulando sync");
      return result;
    }

    // Reusa o array `orders` já carregado acima — não precisa repaginar.
    const eligible = orders.filter((o) => {
      if (!o.id) return false;
      const status = (o.status ?? "").toUpperCase();
      // Cancelados não viram pedido/NF. AWAITING_PAYMENT ainda não pagaram.
      // Tudo que tiver paid_time E não for CANCELLED entra.
      if (status === "CANCELLED") return false;
      if (status === "AWAITING_PAYMENT" || status === "UNPAID") return false;
      return Boolean(o.paid_time);
    });
    result.candidates = eligible.length;
    if (eligible.length === 0) return result;

    // Filtra os que já estão 'synced' no ledger pra evitar refetch caro de detail.
    const { data: alreadySynced } = await sb
      .from("tiktok_bling_orders")
      .select("tiktok_order_id, status")
      .in("tiktok_order_id", eligible.map((o) => o.id));
    const syncedSet = new Set(
      ((alreadySynced ?? []) as Array<{ tiktok_order_id: string; status: string }>)
        .filter((r) => r.status === "synced")
        .map((r) => r.tiktok_order_id),
    );
    const todo = eligible.filter((o) => !syncedSet.has(o.id));
    result.skipped = eligible.length - todo.length;
    if (todo.length === 0) return result;

    // Detail endpoint aceita batch (`ids` comma-separated, max ~50 por chamada).
    // Pedidos do cron raramente passam disso, mas paginamos por segurança.
    const BATCH = 50;
    for (let i = 0; i < todo.length; i += BATCH) {
      const ids = todo.slice(i, i + BATCH).map((o) => o.id);
      let detailed: TikTokOrder[] = [];
      try {
        detailed = await getOrderDetail(ids);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[tiktok-shop-ingest] getOrderDetail falhou:", msg);
        // Marca toda a batch como failed e segue — operador retenta via UI.
        for (const id of ids) {
          result.failed++;
          result.errors.push({ order_id: id, error: `detail fetch: ${msg}` });
        }
        continue;
      }
      for (const order of detailed) {
        try {
          const r = await syncTikTokOrderToBling(order);
          if (r.status === "synced") result.synced++;
          else if (r.status === "skipped") result.skipped++;
          else if (r.status === "failed") {
            result.failed++;
            result.errors.push({ order_id: order.id, error: r.error ?? "unknown" });
          } else if (r.status === "pending") {
            result.failed++;
            result.errors.push({ order_id: order.id, error: r.message ?? "pending" });
          }
        } catch (err) {
          // syncTikTokOrderToBling já swallowa erros e persiste em failed,
          // mas defensivo caso surja exceção fora do try interno.
          const msg = err instanceof Error ? err.message : String(err);
          result.failed++;
          result.errors.push({ order_id: order.id, error: msg });
          console.error(
            `[tiktok-shop-ingest] sync order ${order.id} threw:`,
            err,
          );
        }
      }
    }
    return result;
  }
}
