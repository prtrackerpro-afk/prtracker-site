/**
 * POST /api/admin/tiktok/sync-order/<tiktok_order_id>
 *
 * Disparo manual do sync TikTok → Bling pra 1 pedido. Útil pra:
 *   - Reprocessar pedidos antigos que ficaram em status=failed/pending
 *   - Sincronizar venda nova antes do cron rodar
 *   - Testar mudanças no mapeamento sem esperar o cron
 *
 * Fluxo:
 *   1. Fetch order detail fresco do TikTok (precisa do detail endpoint
 *      pra trazer cpf + cpf_name + recipient_address.address_line*)
 *   2. Chama syncTikTokOrderToBling
 *   3. Retorna JSON com resultado
 *
 * Auth: middleware admin.
 */

import type { APIRoute } from "astro";
import { getOrderDetail } from "~/lib/tiktok/orders";
import { isConnected as tiktokConnected } from "~/lib/tiktok/oauth";
import { syncTikTokOrderToBling } from "~/lib/bling/sync-tiktok";
import { getAdminSupabase } from "~/lib/supabase/server";

export const prerender = false;

export const POST: APIRoute = async ({ params, locals }) => {
  const orderId = params.id;
  if (!orderId) return json(400, { error: "missing order id" });

  if (!(await tiktokConnected())) {
    return json(503, { error: "TikTok Shop não conectado" });
  }

  let order;
  try {
    const detail = await getOrderDetail(orderId);
    order = detail[0];
    if (!order) {
      return json(404, {
        error: `Pedido ${orderId} não encontrado no TikTok Shop`,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json(502, { error: `TikTok fetch failed: ${msg}` });
  }

  try {
    const sb = getAdminSupabase();
    await sb.from("audit_log").insert({
      actor_email: locals.admin?.email ?? null,
      action: "tiktok_bling.manual_sync",
      entity_type: "tiktok_bling_orders",
      entity_id: orderId,
    });
  } catch (e) {
    console.warn("[tiktok/sync-order] audit log failed (non-blocking):", e);
  }

  const result = await syncTikTokOrderToBling(order);
  const httpStatus =
    result.status === "synced" || result.status === "skipped"
      ? 200
      : result.status === "pending"
        ? 202
        : 502;
  return json(httpStatus, result);
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
