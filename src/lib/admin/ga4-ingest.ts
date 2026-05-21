/**
 * GA4 daily ingest — popula `public.ga4_daily` via Data API (Service Account).
 *
 * Substitui o caminho via Windsor.ai (`windsor-ingest.ts`), que era usado
 * enquanto a integração paga estava ativa. Mantém o mesmo schema de saída
 * pra preservar a página `/admin/ga4` sem mudanças de UI.
 */
import { getAdminSupabase } from "../supabase/server";
import { fetchGa4DailyDirect, isGa4DirectConfigured } from "./ga4-direct";

interface Ga4IngestResult {
  ga4Rows: number;
  durationMs: number;
  skipped?: boolean;
  reason?: string;
}

const GA4_PROPERTY_ID =
  import.meta.env.GA4_PROPERTY_ID ||
  process.env.GA4_PROPERTY_ID ||
  "525987283";

export async function ingestGa4(
  opts: { daysBack?: number } = {},
): Promise<Ga4IngestResult> {
  const t0 = Date.now();
  if (!isGa4DirectConfigured()) {
    return {
      ga4Rows: 0,
      durationMs: Date.now() - t0,
      skipped: true,
      reason: "GA4_SA_KEY_BASE64 not configured",
    };
  }

  const sb = getAdminSupabase();
  const daysBack = opts.daysBack ?? 90;

  const runRes = await sb
    .from("ingestion_runs")
    .insert({ source: "ga4_direct", status: "running" })
    .select("id")
    .single();
  const runId = runRes.data?.id as string | undefined;

  let ga4Rows = 0;

  try {
    const ga4 = await fetchGa4DailyDirect({
      daysBack,
      propertyId: GA4_PROPERTY_ID,
    });

    if (ga4.length > 0) {
      const rows = ga4
        .map((r) => ({
          date: r.date,
          source: r.source,
          medium: r.medium,
          campaign: r.campaign,
          sessions: r.sessions,
          users: r.users,
          new_users: r.new_users,
          page_views: r.page_views,
          engaged_sessions: r.engaged_sessions,
          conversions: r.conversions,
          transactions: r.transactions,
          revenue: r.purchase_revenue,
          raw: r as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        }))
        .filter((r) => r.date);

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
