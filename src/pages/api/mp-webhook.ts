import type { APIRoute } from "astro";
import { MercadoPagoConfig, Payment } from "mercadopago";

export const prerender = false;

/**
 * Mercado Pago webhook handler.
 *
 * MP sends POST requests with minimal payload like:
 *   { action: "payment.updated", data: { id: "123456789" } }
 *
 * We fetch the full payment via the API to avoid trusting the webhook body.
 * For now this just logs — when the business flow is ready, swap the stub
 * for an e-mail/Notion/CRM integration.
 */
export const POST: APIRoute = async ({ request }) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  // Basic shape guard (MP may send non-payment events too; ignore those)
  const body = payload as Record<string, unknown>;
  const paymentId =
    (body?.data as Record<string, unknown> | undefined)?.id ??
    (body?.resource as string | undefined) ??
    null;

  if (!paymentId) {
    console.log("[mp-webhook] non-payment event ignored", body);
    return new Response("ok", { status: 200 });
  }

  const accessToken = import.meta.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    console.warn("[mp-webhook] MP_ACCESS_TOKEN missing — cannot verify payment");
    // Return 200 so MP doesn't retry — observability is broken but the order
    // is still visible in the Mercado Pago dashboard.
    return new Response("ok", { status: 200 });
  }

  try {
    const client = new MercadoPagoConfig({ accessToken });
    const paymentApi = new Payment(client);
    const payment = await paymentApi.get({ id: String(paymentId) });

    console.log("[mp-webhook] payment verified:", {
      id: payment.id,
      status: payment.status,
      status_detail: payment.status_detail,
      amount: payment.transaction_amount,
      external_reference: payment.external_reference,
      payer_email: payment.payer?.email,
    });

    // TODO: enviar e-mail de confirmação, registrar pedido em planilha/DB, etc.
  } catch (err) {
    console.error("[mp-webhook] failed to fetch payment:", err);
  }

  // Always 200 so MP doesn't keep retrying (we logged the error already)
  return new Response("ok", { status: 200 });
};
