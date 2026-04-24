import type { APIRoute } from "astro";
import { MercadoPagoConfig, Payment } from "mercadopago";

export const prerender = false;

/**
 * Returns the current MP payment status for a given payment_id. Used by
 * the `/pagamento/pix` page (and `/obrigado`) to poll until the customer's
 * Pix transitions from pending → approved.
 *
 * Returns minimal data — we don't leak anything sensitive. MP payment
 * IDs are long enough (10+ digits, non-sequential window) that brute
 * forcing the space to peek at random orders isn't practical.
 */

function jsonResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Never cache — status changes in real time.
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export const GET: APIRoute = async ({ url }) => {
  const paymentId = url.searchParams.get("p") ?? url.searchParams.get("payment_id");
  if (!paymentId || !/^\d{6,20}$/.test(paymentId)) {
    return jsonResponse(400, { error: "payment_id inválido." });
  }

  const accessToken = import.meta.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return jsonResponse(500, { error: "MP_ACCESS_TOKEN ausente." });
  }

  try {
    const client = new MercadoPagoConfig({ accessToken });
    const payment = await new Payment(client).get({ id: paymentId });

    return jsonResponse(200, {
      payment_id: String(payment.id ?? paymentId),
      status: payment.status ?? "unknown",
      status_detail: payment.status_detail ?? null,
      external_reference: payment.external_reference ?? null,
      amount: payment.transaction_amount ?? null,
    });
  } catch (err) {
    console.error("[payment-status] MP error:", err);
    return jsonResponse(404, { error: "Pagamento não encontrado." });
  }
};
