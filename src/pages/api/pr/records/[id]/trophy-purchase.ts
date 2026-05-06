import type { APIRoute } from "astro";
import { getAdminSupabase } from "../../../../../lib/supabase/server";

export const prerender = false;

// Stamps `trophy_purchase_id` on a pr_records row when the celebrate funnel
// converts to a checkout. Public POST — auth via the unguessable record id
// (uuid v4). Idempotent: only writes when the field is currently null, so
// retries / double-fires are safe.
//
// Called from /obrigado.astro after Mercado Pago confirms the payment, with
// the prId stashed in sessionStorage by the BarbellConfigurator deep-link.

export const POST: APIRoute = async ({ params, request }) => {
  const id = params.id;
  if (!id) return jsonError(400, "missing_id");

  let body: { purchase_id?: string; source?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_body");
  }

  const purchaseId = (body.purchase_id ?? "").toString().trim();
  if (!purchaseId || purchaseId.length > 80) {
    return jsonError(400, "invalid_purchase_id");
  }

  const sb = getAdminSupabase();

  // Only fill when null. If two attribution calls arrive (page refresh,
  // duplicated webhook), the second is a silent no-op.
  const { data: existing } = await sb
    .from("pr_records")
    .select("id, trophy_purchase_id")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return jsonError(404, "record_not_found");
  if (existing.trophy_purchase_id) {
    return new Response(
      JSON.stringify({ ok: true, already_attributed: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const { error } = await sb
    .from("pr_records")
    .update({ trophy_purchase_id: purchaseId })
    .eq("id", id)
    .is("trophy_purchase_id", null);

  if (error) return jsonError(500, "save_failed", error.message);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

function jsonError(status: number, code: string, message?: string) {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
