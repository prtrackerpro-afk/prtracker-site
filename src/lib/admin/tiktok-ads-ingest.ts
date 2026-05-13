/**
 * TikTok Ads daily insights ingest (via Windsor.ai connector "tiktok").
 *
 * Mirror simplificado do meta-ingest — só account-level rollup, sem breakdown
 * de campaigns/adgroups/ads. Field IDs vêm do Windsor TikTok connector e foram
 * mapeados pra serem semanticamente equivalentes ao Meta:
 *
 *   Meta concept          → TikTok field ID
 *   ─────────────────────────────────────────────────────────
 *   spend                 → spend
 *   impressions           → impressions
 *   clicks (link_clicks)  → clicks  (TikTok não separa, `clicks` JÁ é dest. clicks)
 *   ctr / cpm / cpc       → ctr / cpm / cpc
 *   reach / frequency     → reach / frequency
 *   purchases             → complete_payment  (web pixel)
 *   revenue               → vta_complete_payment_value
 *   add_to_cart           → web_event_add_to_cart
 *   initiate_checkout     → initiate_checkout
 *   view_content          → page_content_view_events
 *   landing_page_view     → total_landing_page_view
 *
 * Quando quiser TikTok Shop sales atribuídas (vs web), trocar `complete_payment`
 * por `onsite_total_purchase` + `vta_complete_payment_value` por
 * `onsite_total_purchase_value`. Decisão do design atual: medir web pixel pra
 * paridade com Meta (que mede o mesmo pixel).
 */

import { getAdminSupabase } from "../supabase/server";
import { fetchWindsor, isWindsorConfigured } from "./windsor-api";

interface TikTokAdsIngestResult {
  rows: number;
  durationMs: number;
  skipped?: boolean;
  reason?: string;
}

const TIKTOK_ADS_ACCOUNT_ID =
  import.meta.env.TIKTOK_ADS_ACCOUNT_ID ||
  process.env.TIKTOK_ADS_ACCOUNT_ID ||
  "7634183589244010513"; // PR Tracker_adv

const FIELDS = [
  "date",
  "account_id",
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "cpm",
  "cpc",
  "reach",
  "frequency",
  "complete_payment",
  "vta_complete_payment_value",
  "web_event_add_to_cart",
  "initiate_checkout",
  "page_content_view_events",
  "total_landing_page_view",
];

export async function ingestTikTokAds(
  opts: { daysBack?: number } = {},
): Promise<TikTokAdsIngestResult> {
  const t0 = Date.now();
  if (!isWindsorConfigured()) {
    return {
      rows: 0,
      durationMs: Date.now() - t0,
      skipped: true,
      reason: "WINDSOR_API_KEY not configured",
    };
  }

  const sb = getAdminSupabase();
  const daysBack = opts.daysBack ?? 90;
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const runRes = await sb
    .from("ingestion_runs")
    .insert({ source: "tiktok_ads", status: "running" })
    .select("id")
    .single();
  const runId = runRes.data?.id as string | undefined;

  let count = 0;

  try {
    const data = await fetchWindsor({
      connector: "tiktok",
      fields: FIELDS,
      dateFrom: since.toISOString().slice(0, 10),
      dateTo: until.toISOString().slice(0, 10),
      accountId: TIKTOK_ADS_ACCOUNT_ID,
    });

    if (data.length > 0) {
      const rows = data
        .map((r) => ({
          date: String(r.date ?? "").slice(0, 10),
          account_id: String(r.account_id ?? TIKTOK_ADS_ACCOUNT_ID),
          spend: Number(r.spend ?? 0),
          impressions: Number(r.impressions ?? 0),
          clicks: Number(r.clicks ?? 0),
          ctr: Number(r.ctr ?? 0),
          cpm: Number(r.cpm ?? 0),
          cpc: Number(r.cpc ?? 0),
          reach: Number(r.reach ?? 0),
          frequency: Number(r.frequency ?? 0),
          purchases: Number(r.complete_payment ?? 0),
          revenue: Number(r.vta_complete_payment_value ?? 0),
          add_to_cart: Number(r.web_event_add_to_cart ?? 0),
          initiate_checkout: Number(r.initiate_checkout ?? 0),
          view_content: Number(r.page_content_view_events ?? 0),
          landing_page_view: Number(r.total_landing_page_view ?? 0),
          raw: r,
          updated_at: new Date().toISOString(),
        }))
        .filter((r) => r.date);

      for (let i = 0; i < rows.length; i += 500) {
        const slice = rows.slice(i, i + 500);
        const { error } = await sb
          .from("tiktok_ads_insights_daily")
          .upsert(slice, { onConflict: "date,account_id" });
        if (error) throw new Error(`tiktok_ads_insights_daily upsert failed: ${error.message}`);
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

  return { rows: count, durationMs: Date.now() - t0 };
}
