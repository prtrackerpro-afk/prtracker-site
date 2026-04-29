import { getAdminSupabase } from "../supabase/server";
import {
  action,
  actionValue,
  getInsights,
  listAds,
  listAdsets,
  listCampaigns,
  type MetaInsight,
} from "./meta-api";

const PURCHASE_TYPES = [
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "omni_purchase",
];
const ATC_TYPES = [
  "add_to_cart",
  "offsite_conversion.fb_pixel_add_to_cart",
];
const IC_TYPES = [
  "initiate_checkout",
  "offsite_conversion.fb_pixel_initiate_checkout",
];
const VC_TYPES = [
  "view_content",
  "offsite_conversion.fb_pixel_view_content",
];
const LPV_TYPES = ["landing_page_view"];
const LINK_CLICK_TYPES = ["link_click"];

function maxAction(insight: MetaInsight, types: string[]): number {
  return Math.max(...types.map((t) => action(insight, t)), 0);
}
function maxActionValue(insight: MetaInsight, types: string[]): number {
  return Math.max(...types.map((t) => actionValue(insight, t)), 0);
}

interface IngestResult {
  campaigns: number;
  adsets: number;
  ads: number;
  insights: number;
  durationMs: number;
}

export async function ingestMeta(opts: { daysBack?: number } = {}): Promise<IngestResult> {
  const daysBack = opts.daysBack ?? 90;
  const t0 = Date.now();
  const sb = getAdminSupabase();

  // 1) Run row
  const runRes = await sb
    .from("ingestion_runs")
    .insert({ source: "meta", status: "running" })
    .select("id")
    .single();
  const runId = runRes.data?.id as string | undefined;

  let campaigns = 0;
  let adsets = 0;
  let ads = 0;
  let insights = 0;

  try {
    // 2) Campaigns
    const camps = await listCampaigns();
    if (camps.length > 0) {
      await sb.from("meta_campaigns").upsert(
        camps.map((c) => ({
          id: c.id,
          name: c.name,
          objective: c.objective ?? null,
          status: c.status ?? null,
          effective_status: c.effective_status ?? null,
          daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
          lifetime_budget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
          bid_strategy: c.bid_strategy ?? null,
          buying_type: c.buying_type ?? null,
          created_time: c.created_time ?? null,
          updated_at: new Date().toISOString(),
        }))
      );
      campaigns = camps.length;
    }

    // 3) Adsets
    const sets = await listAdsets();
    if (sets.length > 0) {
      await sb.from("meta_adsets").upsert(
        sets.map((a) => ({
          id: a.id,
          campaign_id: a.campaign_id,
          name: a.name,
          status: a.status ?? null,
          effective_status: a.effective_status ?? null,
          daily_budget: a.daily_budget ? Number(a.daily_budget) / 100 : null,
          lifetime_budget: a.lifetime_budget ? Number(a.lifetime_budget) / 100 : null,
          optimization_goal: a.optimization_goal ?? null,
          billing_event: a.billing_event ?? null,
          targeting: a.targeting ?? null,
          promoted_object: a.promoted_object ?? null,
          attribution_spec: a.attribution_spec ?? null,
          start_time: a.start_time ?? null,
          end_time: a.end_time ?? null,
          updated_at: new Date().toISOString(),
        }))
      );
      adsets = sets.length;
    }

    // 4) Ads
    const adList = await listAds();
    if (adList.length > 0) {
      await sb.from("meta_ads").upsert(
        adList.map((a) => ({
          id: a.id,
          adset_id: a.adset_id,
          campaign_id: a.campaign_id,
          name: a.name,
          status: a.status ?? null,
          effective_status: a.effective_status ?? null,
          creative_id: a.creative?.id ?? null,
          creative_name: a.creative?.name ?? null,
          creative_thumbnail: a.creative?.thumbnail_url ?? null,
          updated_at: new Date().toISOString(),
        }))
      );
      ads = adList.length;
    }

    // 5) Insights — at each level (account/campaign/adset/ad), 1 row per day
    const levels: Array<"account" | "campaign" | "adset" | "ad"> = [
      "account",
      "campaign",
      "adset",
      "ad",
    ];
    for (const lvl of levels) {
      const ins = await getInsights(lvl, daysBack);
      if (ins.length === 0) continue;
      const rows = ins.map((i) => {
        const entityId =
          lvl === "account"
            ? (import.meta.env.META_AD_ACCOUNT_ID ?? process.env.META_AD_ACCOUNT_ID ?? "account")
            : lvl === "campaign"
              ? (i.campaign_id ?? "")
              : lvl === "adset"
                ? (i.adset_id ?? "")
                : (i.ad_id ?? "");
        return {
          date: i.date_start ?? new Date().toISOString().slice(0, 10),
          level: lvl,
          entity_id: entityId,
          spend: Number(i.spend ?? 0),
          impressions: Number(i.impressions ?? 0),
          clicks: Number(i.clicks ?? 0),
          ctr: Number(i.ctr ?? 0),
          cpm: Number(i.cpm ?? 0),
          cpc: Number(i.cpc ?? 0),
          reach: Number(i.reach ?? 0),
          frequency: Number(i.frequency ?? 0),
          purchases: maxAction(i, PURCHASE_TYPES),
          add_to_cart: maxAction(i, ATC_TYPES),
          initiate_checkout: maxAction(i, IC_TYPES),
          view_content: maxAction(i, VC_TYPES),
          landing_page_view: maxAction(i, LPV_TYPES),
          link_clicks: maxAction(i, LINK_CLICK_TYPES),
          revenue: maxActionValue(i, PURCHASE_TYPES),
          raw: { actions: i.actions, action_values: i.action_values },
          updated_at: new Date().toISOString(),
        };
      }).filter((r) => r.entity_id);
      if (rows.length > 0) {
        // Upsert in batches of 500
        for (let i = 0; i < rows.length; i += 500) {
          await sb.from("meta_insights_daily").upsert(rows.slice(i, i + 500));
        }
        insights += rows.length;
      }
    }

    if (runId) {
      await sb
        .from("ingestion_runs")
        .update({
          status: "success",
          rows_upserted: campaigns + adsets + ads + insights,
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

  return { campaigns, adsets, ads, insights, durationMs: Date.now() - t0 };
}
