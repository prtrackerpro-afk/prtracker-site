/**
 * Manual retry — re-runs syncOrderToBling for one bling_orders row.
 *
 * Path: /api/admin/bling/retry/<mp_payment_id>
 * Method: POST (form submit from /admin/bling)
 *
 * Re-fetches the MP payment fresh (so any updated metadata is used),
 * then calls syncOrderToBling. Auth via middleware.
 */

import type { APIRoute } from "astro";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { syncOrderToBling } from "~/lib/bling/sync";
import { getAdminSupabase } from "~/lib/supabase/server";

export const prerender = false;

export const POST: APIRoute = async ({ params, redirect, locals }) => {
  const mpPaymentId = params.id;
  if (!mpPaymentId) {
    return new Response("missing id", { status: 400 });
  }

  const accessToken =
    import.meta.env.MP_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return redirect(
      `/admin/bling?bling=denied&msg=${encodeURIComponent("MP_ACCESS_TOKEN ausente")}`,
      302,
    );
  }

  // Fetch MP payment fresh (don't trust the cached row).
  let payment;
  try {
    const client = new MercadoPagoConfig({ accessToken });
    payment = await new Payment(client).get({ id: mpPaymentId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return redirect(
      `/admin/bling?bling=denied&msg=${encodeURIComponent("MP fetch failed: " + msg)}`,
      302,
    );
  }

  // Audit
  try {
    const sb = getAdminSupabase();
    await sb.from("audit_log").insert({
      actor_email: locals.admin?.email ?? null,
      action: "bling.manual_retry",
      entity_type: "bling_orders",
      entity_id: mpPaymentId,
    });
  } catch (e) {
    console.warn("[bling/retry] audit log failed (non-blocking):", e);
  }

  const result = await syncOrderToBling(payment);
  if (result.ok && result.status === "synced") {
    return redirect("/admin/bling?bling=connected", 302);
  }
  return redirect(
    `/admin/bling?bling=denied&msg=${encodeURIComponent(result.error ?? result.message ?? "unknown error")}`,
    302,
  );
};
