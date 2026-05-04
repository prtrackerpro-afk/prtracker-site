/**
 * Retry NF-e emission for a bling_orders row.
 *
 * Path: /api/admin/bling/retry-nfe/<mp_payment_id>
 * Method: POST (fetch + JSON from /admin/bling)
 *
 * Two paths:
 *   - bling_nfe_id already set → call retryEmitNfe (re-transmit existing NF-e)
 *   - bling_nfe_id null → re-fetch MP payment + re-run syncOrderToBling
 *     (which will both re-confirm the pedido and attempt NF-e fresh)
 *
 * Idempotency: re-running syncOrderToBling on a row with status='synced'
 * detects via persistInitial and skips, so the only side-effect of the
 * second path is the NF-e emission (the pedido isn't recreated).
 */

import type { APIRoute } from "astro";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { emitNfeForExistingOrder, syncOrderToBling } from "~/lib/bling/sync";
import { retryEmitNfe } from "~/lib/bling/nfe";
import { getValidAccessToken } from "~/lib/bling/oauth";
import { getAdminSupabase } from "~/lib/supabase/server";

export const prerender = false;

export const POST: APIRoute = async ({ params, redirect, locals }) => {
  const mpPaymentId = params.id;
  if (!mpPaymentId) return new Response("missing id", { status: 400 });

  const sb = getAdminSupabase();
  const { data: row } = await sb
    .from("bling_orders")
    .select("mp_payment_id, status, bling_pedido_id, bling_nfe_id, nfe_status")
    .eq("mp_payment_id", mpPaymentId)
    .maybeSingle();

  if (!row) {
    return redirect(
      `/admin/bling?bling=denied&msg=${encodeURIComponent("pedido não encontrado")}`,
      302,
    );
  }

  // Audit
  try {
    await sb.from("audit_log").insert({
      actor_email: locals.admin?.email ?? null,
      action: "bling.retry_nfe",
      entity_type: "bling_orders",
      entity_id: mpPaymentId,
    });
  } catch (e) {
    console.warn("[bling/retry-nfe] audit log failed:", e);
  }

  // Path 1: NF-e already created in Bling — just retry SEFAZ transmission.
  if (row.bling_nfe_id) {
    const accessToken = await getValidAccessToken();
    const res = await retryEmitNfe(Number(row.bling_nfe_id), accessToken);
    await sb
      .from("bling_orders")
      .update({
        nfe_status: res.status,
        nfe_error: res.error ?? null,
        bling_nfe_numero: res.numero ?? undefined,
        bling_nfe_serie: res.serie ?? undefined,
        bling_nfe_chave_acesso: res.chaveAcesso ?? undefined,
        nfe_emitted_at: res.status === "emitted" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("mp_payment_id", mpPaymentId);

    if (res.ok && res.status === "emitted") {
      return redirect("/admin/bling?bling=connected", 302);
    }
    return redirect(
      `/admin/bling?bling=denied&msg=${encodeURIComponent(res.error ?? res.status)}`,
      302,
    );
  }

  // Path 2: re-fetch MP payment, then either re-run full sync (if pedido
  // not yet created) or emit NF-e on the existing pedido (the common case
  // when sync succeeded but NF-e step was skipped — e.g., env var added
  // after the fact).
  const mpToken = import.meta.env.MP_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN;
  if (!mpToken) {
    return redirect(
      `/admin/bling?bling=denied&msg=${encodeURIComponent("MP_ACCESS_TOKEN ausente")}`,
      302,
    );
  }
  let payment;
  try {
    const client = new MercadoPagoConfig({ accessToken: mpToken });
    payment = await new Payment(client).get({ id: mpPaymentId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return redirect(
      `/admin/bling?bling=denied&msg=${encodeURIComponent("MP fetch failed: " + msg)}`,
      302,
    );
  }

  // Pedido already exists → emit NF-e directly (skip the sync skip-on-synced).
  if (row.status === "synced" && row.bling_pedido_id) {
    const nfeRes = await emitNfeForExistingOrder(payment);
    if (nfeRes.ok && nfeRes.status === "emitted") {
      return redirect("/admin/bling?bling=connected", 302);
    }
    if (nfeRes.ok && nfeRes.status === "pending") {
      return redirect(
        `/admin/bling?bling=denied&msg=${encodeURIComponent("NF-e em processamento na SEFAZ — recarregue em alguns segundos")}`,
        302,
      );
    }
    return redirect(
      `/admin/bling?bling=denied&msg=${encodeURIComponent(nfeRes.error ?? nfeRes.status)}`,
      302,
    );
  }

  // Pedido never synced → run full sync (also attempts NF-e).
  const result = await syncOrderToBling(payment);
  if (result.ok && result.status === "synced") {
    return redirect("/admin/bling?bling=connected", 302);
  }
  return redirect(
    `/admin/bling?bling=denied&msg=${encodeURIComponent(result.error ?? result.message ?? "unknown")}`,
    302,
  );
};
