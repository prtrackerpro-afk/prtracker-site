/**
 * GET /api/admin/tiktok/debug-order
 *
 * Dumpa o JSON cru de pedidos TikTok pra inspecionar a shape real (campos
 * BR específicos como CPF, endereço estruturado, etc — que a doc oficial
 * é JS-rendered e não dá pra parsear de fora).
 *
 * Modos:
 *   - GET /api/admin/tiktok/debug-order
 *     → pega o pedido mais recente dos últimos 30 dias via /orders/search
 *   - GET /api/admin/tiktok/debug-order?id=<order_id>
 *     → busca aquele pedido específico no batch detail endpoint
 *   - GET /api/admin/tiktok/debug-order?days=90
 *     → janela maior pra search
 *
 * Read-only. Auth: admin middleware.
 */

import type { APIRoute } from "astro";
import { tiktokFetch } from "~/lib/tiktok/api";
import { isConnected } from "~/lib/tiktok/oauth";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  if (!(await isConnected())) {
    return json(503, { error: "tiktok not connected" });
  }

  const id = url.searchParams.get("id");
  const days = Number(url.searchParams.get("days") ?? 30);

  try {
    if (id) {
      const data = await tiktokFetch<unknown>("/order/202309/orders", {
        method: "GET",
        query: { ids: id },
      });
      return json(200, { source: "detail", id, data });
    }

    const createdAfter = Math.floor(
      (Date.now() - days * 24 * 60 * 60 * 1000) / 1000,
    );
    const createdBefore = Math.floor(Date.now() / 1000);
    const searchData = await tiktokFetch<{
      orders?: Array<{ id?: string }>;
    }>("/order/202309/orders/search", {
      method: "POST",
      query: { page_size: 5, sort_field: "create_time", sort_order: "DESC" },
      body: { create_time_ge: createdAfter, create_time_lt: createdBefore },
    });

    const orderIds = (searchData.orders ?? [])
      .map((o) => o?.id)
      .filter((x): x is string => typeof x === "string");

    if (orderIds.length === 0) {
      return json(200, {
        source: "search",
        message: `Nenhum pedido nos últimos ${days} dias.`,
        searchData,
      });
    }

    const detailData = await tiktokFetch<unknown>("/order/202309/orders", {
      method: "GET",
      query: { ids: orderIds.join(",") },
    });

    return json(200, {
      source: "search+detail",
      window_days: days,
      order_ids: orderIds,
      search_sample: searchData,
      detail: detailData,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const raw =
      err && typeof err === "object" && "raw" in err ? (err as any).raw : undefined;
    console.error("[tiktok/debug-order]", msg, raw);
    return json(502, { error: msg, raw });
  }
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
