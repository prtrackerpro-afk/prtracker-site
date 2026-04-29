import { getAdminSupabase } from "../supabase/server";
import { isMpConfigured, searchApprovedPayments, type MpPaymentRecord } from "./mp-api";

interface MpIngestResult {
  payments: number;
  durationMs: number;
  skipped?: boolean;
  reason?: string;
}

/**
 * Convert an MP payment to a `sales` table row. The unique key is
 * (channel='site', external_order_id=payment.id) so re-runs upsert
 * cleanly.
 */
export function paymentToSaleRow(p: MpPaymentRecord) {
  const items = p.additional_info?.items ?? [];
  const firstItem = items[0];
  const productName = firstItem?.title ?? "PR Tracker";
  const productSlug = firstItem?.id ?? null;
  const quantity = items.reduce((sum, i) => sum + Number(i.quantity ?? 0), 0) || 1;

  const meta = (p.metadata ?? {}) as Record<string, unknown>;
  const customerName =
    String(meta.customer_name ?? "") ||
    [p.payer?.first_name, p.payer?.last_name].filter(Boolean).join(" ") ||
    null;
  const customerEmail = String(meta.customer_email ?? "") || p.payer?.email || null;

  // MP returns date_approved already in ISO format
  const createdAt = p.date_approved ?? p.date_created ?? new Date().toISOString();

  return {
    channel: "site" as const,
    external_order_id: String(p.id),
    product_slug: productSlug,
    product_name: productName,
    quantity,
    unit_price: items.length > 0 ? Number(firstItem?.unit_price ?? 0) : Number(p.transaction_amount),
    total: Number(p.transaction_amount),
    currency: "BRL" as const,
    customer_email: customerEmail,
    customer_name: customerName,
    status: p.status,
    metadata: {
      payment_method_id: p.payment_method_id,
      status_detail: p.status_detail,
      external_reference: p.external_reference,
      items,
      mp_metadata: meta,
    },
    created_at: createdAt,
  };
}

/**
 * Pull approved payments from MP in the given window and upsert them into
 * `sales`. Idempotent — re-running upserts on (channel, external_order_id).
 */
export async function ingestMercadoPago(opts: { daysBack?: number } = {}): Promise<MpIngestResult> {
  const t0 = Date.now();
  if (!isMpConfigured()) {
    return {
      payments: 0,
      durationMs: Date.now() - t0,
      skipped: true,
      reason: "MP_ACCESS_TOKEN not configured",
    };
  }

  const sb = getAdminSupabase();
  const daysBack = opts.daysBack ?? 90;

  const runRes = await sb
    .from("ingestion_runs")
    .insert({ source: "mercadopago", status: "running" })
    .select("id")
    .single();
  const runId = runRes.data?.id as string | undefined;

  let count = 0;

  try {
    const payments = await searchApprovedPayments({ daysBack });
    if (payments.length > 0) {
      const rows = payments.map(paymentToSaleRow);
      // Upsert in batches keyed by (channel, external_order_id)
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

  return { payments: count, durationMs: Date.now() - t0 };
}
