import type { APIRoute } from "astro";
import { ingestMeta } from "../../../lib/admin/meta-ingest";
import { ingestGa4 } from "../../../lib/admin/ga4-ingest";
import { ingestMercadoPago } from "../../../lib/admin/mp-ingest";
import { ingestTikTokShop } from "../../../lib/admin/tiktok-shop-ingest";
import { ingestTikTokAds } from "../../../lib/admin/tiktok-ads-ingest";
import { evaluateAlerts, evaluateBlingPriceDrift } from "../../../lib/admin/alerts-engine";
import { getAdminSupabase } from "../../../lib/supabase/server";
import { isEmailConfigured, sendAdminEmail } from "../../../lib/admin/email";
import { isConnected as isBlingConnected } from "../../../lib/bling/oauth";
import { syncInfiniteStock } from "../../../lib/bling/estoque";

export const prerender = false;

/**
 * Daily cron: pulls Meta + GA4 + MP + TikTok + evaluates alerts.
 *
 * Triggered by Vercel Cron (vercel.json).
 * Auth: CRON_SECRET in Authorization header (Vercel Cron sets this automatically when CRON_SECRET env is set).
 *
 * Manual invocation: GET /api/cron/ingest with header `Authorization: Bearer <CRON_SECRET>`.
 */
export const GET: APIRoute = async ({ request }) => {
  const auth = request.headers.get("authorization") || "";
  const expected = `Bearer ${import.meta.env.CRON_SECRET || process.env.CRON_SECRET || ""}`;
  if (!import.meta.env.CRON_SECRET && !process.env.CRON_SECRET) {
    return json(500, { error: "CRON_SECRET not configured" });
  }
  if (auth !== expected) {
    return json(401, { error: "unauthorized" });
  }

  const url = new URL(request.url);
  const daysBack = Number(url.searchParams.get("days") || 7);
  // First-run / backfill: pass ?days=90 manually

  const result: any = { startedAt: new Date().toISOString() };

  // 1) Meta
  try {
    result.meta = await ingestMeta({ daysBack });
  } catch (e) {
    result.meta = { error: (e as Error).message };
  }

  // 2) GA4 — direct via Data API (Service Account)
  try {
    result.ga4 = await ingestGa4({ daysBack });
  } catch (e) {
    result.ga4 = { error: (e as Error).message };
  }

  // 3) Mercado Pago — site sales backfill
  try {
    result.mercadopago = await ingestMercadoPago({ daysBack });
  } catch (e) {
    result.mercadopago = { error: (e as Error).message };
  }

  // 4) TikTok Shop — marketplace sales backfill (channel='tiktok')
  try {
    result.tiktok_shop = await ingestTikTokShop({ daysBack });
  } catch (e) {
    result.tiktok_shop = { error: (e as Error).message };
  }

  // 5) TikTok Ads — daily insights via Windsor
  try {
    result.tiktok_ads = await ingestTikTokAds({ daysBack });
  } catch (e) {
    result.tiktok_ads = { error: (e as Error).message };
  }

  // 6) Alerts
  try {
    result.alerts = await evaluateAlerts({ dateRangeDays: 1 });
  } catch (e) {
    result.alerts = { error: (e as Error).message };
  }

  // 7) Bling price drift — só dispara alerta se há divergência entre o
  //    preço-base canônico do site e o preço cadastrado no Bling.
  try {
    result.bling_price_drift = await evaluateBlingPriceDrift();
  } catch (e) {
    result.bling_price_drift = { error: (e as Error).message };
  }

  // 8) Bling estoque infinito — re-pina o saldo de todo produto físico no teto
  //    (produção sob demanda). Balanço é idempotente; isso só repõe o que o
  //    Bling deu baixa nos pedidos do dia. Pula silenciosamente se o Bling
  //    não está conectado.
  try {
    if (await isBlingConnected()) {
      const stock = await syncInfiniteStock();
      result.bling_stock = {
        applied: stock.applied.length,
        errors: stock.errors.length,
        target: stock.target,
      };
    } else {
      result.bling_stock = { skipped: "bling not connected" };
    }
  } catch (e) {
    result.bling_stock = { error: (e as Error).message };
  }

  // 4) Send email if critical alerts
  if (isEmailConfigured() && result.alerts?.created > 0) {
    try {
      const sb = getAdminSupabase();
      const { data: criticalAlerts } = await sb
        .from("alerts")
        .select("title, body, severity, created_at")
        .eq("status", "open")
        .eq("severity", "critical")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (criticalAlerts && criticalAlerts.length > 0) {
        const html = `
          <div style="font-family:system-ui,sans-serif;max-width:600px">
            <h2 style="color:#01002a">🚨 Alertas críticos PR Tracker</h2>
            <p>${criticalAlerts.length} alerta(s) crítico(s) detectado(s) na última hora:</p>
            <ul>
              ${criticalAlerts.map((a) => `<li><strong>${a.title}</strong><br/>${a.body ?? ""}</li>`).join("")}
            </ul>
            <p><a href="https://prtracker.com.br/admin/alerts">Abrir dashboard de alertas →</a></p>
          </div>
        `;
        await sendAdminEmail({
          subject: `[PR Tracker] ${criticalAlerts.length} alerta(s) crítico(s)`,
          html,
        });
        result.email = { sent: true, count: criticalAlerts.length };
      }
    } catch (e) {
      result.email = { error: (e as Error).message };
    }
  }

  result.finishedAt = new Date().toISOString();
  return json(200, result);
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
