/**
 * TikTok Shop sales ingest.
 *
 * Pulls orders via the TikTok Shop Open Platform `/order/202309/orders/search`
 * endpoint and upserts them into the canonical `sales` table with
 * `channel = 'tiktok'`.
 *
 * Idempotent: upserts on (channel, external_order_id). Re-runs are safe.
 */

import { getAdminSupabase } from "../supabase/server";
import { isConnected } from "../tiktok/oauth";
import { searchOrders, type TikTokOrder } from "../tiktok/orders";

export interface TikTokShopIngestResult {
  orders: number;
  durationMs: number;
  skipped?: boolean;
  reason?: string;
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

  try {
    const createdAfter = new Date();
    createdAfter.setDate(createdAfter.getDate() - daysBack);

    const orders = await searchOrders({ createdAfter });
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

  return { orders: count, durationMs: Date.now() - t0 };
}
