import type { APIRoute } from "astro";
import { getAdminSupabase } from "~/lib/supabase/server";

export const prerender = false;

/**
 * Cron diário: marca como `expired` todo vale-presente com:
 *   - status atual = 'active'
 *   - expires_at < now()
 *
 * Saldo restante é descartado (não retorna pra ninguém). Schedule
 * registrado em vercel.json. Auth via CRON_SECRET (Vercel injeta o
 * header automaticamente quando o secret está configurado).
 *
 * Manual: GET /api/cron/expire-gift-cards
 *   Authorization: Bearer <CRON_SECRET>
 */
export const GET: APIRoute = async ({ request }) => {
  const auth = request.headers.get("authorization") || "";
  const secret =
    import.meta.env.CRON_SECRET || process.env.CRON_SECRET || "";
  if (!secret) {
    return json(500, { error: "CRON_SECRET not configured" });
  }
  if (auth !== `Bearer ${secret}`) {
    return json(401, { error: "unauthorized" });
  }

  const sb = getAdminSupabase();
  const { data, error } = await sb
    .from("gift_cards")
    .update({ status: "expired" })
    .eq("status", "active")
    .lt("expires_at", new Date().toISOString())
    .select("id, code, value_cents, balance_cents");

  if (error) {
    console.error("[cron expire-gift-cards] update error:", error);
    return json(500, { error: error.message });
  }

  const expired = data ?? [];
  console.log(`[cron expire-gift-cards] expired ${expired.length} cards`);
  return json(200, {
    ok: true,
    expiredCount: expired.length,
    expired: expired.map((c) => ({
      code: c.code,
      lostBalanceCents: c.balance_cents,
    })),
  });
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
