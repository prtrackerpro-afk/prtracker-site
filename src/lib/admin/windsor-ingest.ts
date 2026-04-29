import { getAdminSupabase } from "../supabase/server";
import { fetchGA4Daily, isWindsorConfigured } from "./windsor-api";

interface WindsorIngestResult {
  ga4Rows: number;
  durationMs: number;
  skipped?: boolean;
  reason?: string;
}

const GA4_PROPERTY_ID = import.meta.env.GA4_PROPERTY_ID || process.env.GA4_PROPERTY_ID || "525987283";

export async function ingestWindsor(opts: { daysBack?: number } = {}): Promise<WindsorIngestResult> {
  const t0 = Date.now();
  if (!isWindsorConfigured()) {
    return {
      ga4Rows: 0,
      durationMs: Date.now() - t0,
      skipped: true,
      reason: "WINDSOR_API_KEY not configured",
    };
  }

  const sb = getAdminSupabase();
  const daysBack = opts.daysBack ?? 90;

  const runRes = await sb
    .from("ingestion_runs")
    .insert({ source: "windsor", status: "running" })
    .select("id")
    .single();
  const runId = runRes.data?.id as string | undefined;

  let ga4Rows = 0;

  try {
    const ga4 = await fetchGA4Daily({ daysBack, propertyId: GA4_PROPERTY_ID });

    if (ga4.length > 0) {
      const rows = ga4.map((r) => ({
        date: String(r.date ?? "").slice(0, 10),
        source: String(r.source ?? "(direct)"),
        medium: String(r.medium ?? "(none)"),
        campaign: String(r.campaign ?? "(not set)"),
        sessions: Number(r.sessions ?? 0),
        users: Number(r.users ?? 0),
        new_users: Number(r.new_users ?? 0),
        page_views: Number(r.page_views ?? 0),
        engaged_sessions: Number(r.engaged_sessions ?? 0),
        conversions: Number(r.conversions ?? 0),
        transactions: Number(r.transactions ?? 0),
        revenue: Number(r.purchase_revenue ?? 0),
        raw: r,
        updated_at: new Date().toISOString(),
      })).filter((r) => r.date);

      for (let i = 0; i < rows.length; i += 500) {
        await sb.from("ga4_daily").upsert(rows.slice(i, i + 500));
      }
      ga4Rows = rows.length;
    }

    if (runId) {
      await sb
        .from("ingestion_runs")
        .update({
          status: "success",
          rows_upserted: ga4Rows,
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

  return { ga4Rows, durationMs: Date.now() - t0 };
}
