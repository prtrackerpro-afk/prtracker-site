/**
 * GET /api/admin/tiktok/orders-list
 *
 * Lista pedidos TikTok recentes + status de sync com Bling (join com
 * tiktok_bling_orders). Usado pela UI /admin/tiktok pra mostrar tabela
 * com botão "Sincronizar com Bling" por pedido.
 *
 * Query:
 *   ?days=30 (default) — janela de busca via /orders/search
 *
 * Read-only. Auth: middleware admin.
 */

import type { APIRoute } from "astro";
import { searchOrders } from "~/lib/tiktok/orders";
import { isConnected } from "~/lib/tiktok/oauth";
import { getAdminSupabase } from "~/lib/supabase/server";

export const prerender = false;

interface OrderRow {
  order_id: string;
  created_at: string | null;
  status: string | null;
  total: string | null;
  currency: string | null;
  items_count: number;
  bling_status: string | null;
  bling_pedido_numero: string | null;
  nfe_status: string | null;
  error: string | null;
}

export const GET: APIRoute = async ({ url }) => {
  if (!(await isConnected())) {
    return json(503, { error: "tiktok not connected" });
  }

  const days = Math.max(1, Math.min(180, Number(url.searchParams.get("days") ?? 30)));
  const createdAfter = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const orders = await searchOrders({ createdAfter, pageSize: 50 });
    const ids = orders.map((o) => o.id).filter(Boolean);

    const sb = getAdminSupabase();
    let ledgerMap = new Map<string, any>();
    if (ids.length > 0) {
      const { data: ledger } = await sb
        .from("tiktok_bling_orders")
        .select(
          "tiktok_order_id, status, bling_pedido_numero, nfe_status, error",
        )
        .in("tiktok_order_id", ids);
      for (const row of (ledger ?? []) as any[]) {
        ledgerMap.set(row.tiktok_order_id, row);
      }
    }

    const rows: OrderRow[] = orders.map((o) => {
      const led = ledgerMap.get(o.id);
      const createdMs =
        typeof o.create_time === "number" ? o.create_time * 1000 : 0;
      return {
        order_id: o.id,
        created_at: createdMs ? new Date(createdMs).toISOString() : null,
        status: o.status ?? null,
        total: o.payment?.total_amount ?? null,
        currency: o.payment?.currency ?? null,
        items_count: (o.line_items ?? []).length,
        bling_status: led?.status ?? null,
        bling_pedido_numero: led?.bling_pedido_numero ?? null,
        nfe_status: led?.nfe_status ?? null,
        error: led?.error ?? null,
      };
    });

    return json(200, { window_days: days, total: rows.length, orders: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[tiktok/orders-list]", msg);
    return json(502, { error: msg });
  }
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
