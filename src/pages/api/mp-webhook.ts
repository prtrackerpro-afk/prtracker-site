import type { APIRoute } from "astro";
import { MercadoPagoConfig, Payment } from "mercadopago";
import crypto from "node:crypto";
import {
  sendOwnerOrderAlert,
  sendCustomerConfirmation,
  type OrderEmailData,
} from "~/lib/email";

export const prerender = false;

/**
 * Verify the x-signature header Mercado Pago sends with every webhook.
 *
 * MP docs: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 *   x-signature: "ts=1704000000,v1=<hex hmac sha256>"
 *   The signed payload template is:
 *     id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 *
 * When MP_WEBHOOK_SECRET is not set we skip verification — useful for
 * the first deploy before the secret is copied over; real requests still
 * get re-validated server-side when we fetch the payment by id.
 */
function verifySignature(
  request: Request,
  paymentId: string,
): { ok: boolean; reason?: string } {
  const secret = import.meta.env.MP_WEBHOOK_SECRET;
  if (!secret) return { ok: true };

  const header = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id") ?? "";
  if (!header) return { ok: false, reason: "missing x-signature header" };

  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, v] = p.trim().split("=");
      return [k, v];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return { ok: false, reason: "malformed x-signature" };

  const template = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(template)
    .digest("hex");

  // Constant-time comparison avoids leaking info via timing.
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  if (a.length !== b.length) return { ok: false, reason: "signature length mismatch" };
  return crypto.timingSafeEqual(a, b)
    ? { ok: true }
    : { ok: false, reason: "signature mismatch" };
}

/**
 * Mercado Pago webhook handler.
 *
 * MP sends POST requests with minimal payload like:
 *   { action: "payment.updated", data: { id: "123456789" } }
 *
 * Flow when payment is approved:
 *   1. Re-fetch payment from MP (never trust the webhook body)
 *   2. POST /me/shipment/cart to add the shipment to the Melhor Envio cart
 *   3. POST /me/shipment/checkout to buy the label with the ME wallet balance
 *   4. POST /me/shipment/generate to render the PDF
 *   5. Log the tracking URL + label PDF URL for later email/follow-up
 *
 * MP always receives 200 so it stops retrying. Failures are logged and
 * we recover manually from the dashboard — the order is never lost.
 */
export const POST: APIRoute = async ({ request }) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  const paymentId =
    (body?.data as Record<string, unknown> | undefined)?.id ??
    (body?.resource as string | undefined) ??
    null;

  if (!paymentId) {
    console.log("[mp-webhook] non-payment event ignored", body);
    return new Response("ok", { status: 200 });
  }

  const sig = verifySignature(request, String(paymentId));
  if (!sig.ok) {
    console.warn(`[mp-webhook] signature rejected: ${sig.reason}`);
    return new Response("ok", { status: 200 });
  }

  const mpAccessToken = import.meta.env.MP_ACCESS_TOKEN;
  if (!mpAccessToken) {
    console.warn("[mp-webhook] MP_ACCESS_TOKEN missing — cannot verify payment");
    return new Response("ok", { status: 200 });
  }

  let payment: Awaited<ReturnType<Payment["get"]>>;
  try {
    const client = new MercadoPagoConfig({ accessToken: mpAccessToken });
    payment = await new Payment(client).get({ id: String(paymentId) });
  } catch (err) {
    console.error("[mp-webhook] failed to fetch payment:", err);
    return new Response("ok", { status: 200 });
  }

  console.log("[mp-webhook] payment:", {
    id: payment.id,
    status: payment.status,
    status_detail: payment.status_detail,
    amount: payment.transaction_amount,
    external_reference: payment.external_reference,
    payer_email: payment.payer?.email,
  });

  // Only approved payments trigger label generation. Pending Pix payments
  // will fire another webhook when confirmed, so we'll handle them then.
  if (payment.status !== "approved") {
    return new Response("ok", { status: 200 });
  }

  let labelError: string | null = null;
  try {
    await generateShippingLabel(payment);
  } catch (err) {
    labelError = err instanceof Error ? err.message : String(err);
    console.error("[mp-webhook] shipping label generation failed:", err);
  }

  // Order notifications — fire-and-forget so a broken SMTP never blocks
  // MP's 200 or keeps the customer waiting on the thank-you page.
  try {
    const emailData = buildOrderEmailData(payment, labelError);
    await Promise.allSettled([
      sendOwnerOrderAlert(emailData),
      sendCustomerConfirmation(emailData),
    ]);
  } catch (err) {
    console.error("[mp-webhook] email notification failed:", err);
  }

  return new Response("ok", { status: 200 });
};

function buildOrderEmailData(
  payment: MpPayment,
  labelError: string | null,
): OrderEmailData {
  const meta = (payment.metadata ?? {}) as Record<string, unknown>;
  const payer = payment.payer ?? {};
  const address = payer.address ?? {};
  const payerName =
    [payer.first_name, payer.last_name].filter(Boolean).join(" ") ||
    "Cliente PR Tracker";
  const phone =
    String(meta.customer_phone ?? "") ||
    String(payer.phone?.area_code ?? "") + String(payer.phone?.number ?? "");

  const additionalItems = (payment.additional_info?.items ?? []) as Array<{
    title?: string;
    quantity?: number;
    unit_price?: number;
  }>;
  const items = additionalItems
    .filter((i) => Number(i.unit_price) >= 0) // hide the Pix/coupon negative lines in customer email
    .map((i) => ({
      title: String(i.title ?? "Item"),
      quantity: Number(i.quantity ?? 1),
      totalBrl: Number(i.unit_price ?? 0) * Number(i.quantity ?? 1),
    }));

  const paymentMethod = (() => {
    const hint = String(meta.payment_method_hint ?? "");
    if (hint === "pix") return "Pix";
    if (hint === "credit") return "Cartão de crédito";
    return payment.payment_method_id ?? "—";
  })();

  return {
    paymentId: payment.id ?? 0,
    externalRef: payment.external_reference ?? `mp-${payment.id ?? "?"}`,
    totalBrl: Number(payment.transaction_amount ?? 0),
    status: labelError ? "Aprovado (etiqueta pendente)" : "Aprovado",
    paymentMethod,
    customer: {
      name: payerName,
      email: payer.email ?? "",
      phone,
      cpf: String(payer.identification?.number ?? meta.customer_cpf ?? ""),
    },
    shipping: {
      cep: String(meta.shipping_cep ?? ""),
      street: String(address.street_name ?? ""),
      number: String(address.street_number ?? ""),
      complement: String(meta.shipping_complement ?? ""),
      neighborhood: String(meta.shipping_neighborhood ?? ""),
      city: String(meta.shipping_city ?? ""),
      state: String(meta.shipping_state ?? ""),
      service: String(meta.shipping_service_name ?? ""),
    },
    items,
    couponCode: meta.coupon_code ? String(meta.coupon_code) : undefined,
    couponCreditedTo: meta.coupon_credited_to
      ? String(meta.coupon_credited_to)
      : undefined,
  };
}

// ---------------------------------------------------------------------------

type MpPayment = Awaited<ReturnType<Payment["get"]>>;

async function generateShippingLabel(payment: MpPayment): Promise<void> {
  const meToken = import.meta.env.ME_ACCESS_TOKEN;
  if (!meToken) {
    console.warn("[mp-webhook] ME_ACCESS_TOKEN missing — skipping label");
    return;
  }
  const useSandbox = import.meta.env.ME_SANDBOX === "true";
  const meHost = useSandbox
    ? "https://sandbox.melhorenvio.com.br"
    : "https://melhorenvio.com.br";
  const cepOrigem = import.meta.env.ME_CEP_ORIGEM;

  const meta = (payment.metadata ?? {}) as Record<string, unknown>;
  const serviceId = Number(meta.shipping_service_id ?? 0);
  const destCep = String(meta.shipping_cep ?? "").replace(/\D/g, "");
  if (!serviceId || !destCep || !cepOrigem) {
    console.warn("[mp-webhook] missing shipping metadata, cannot buy label", meta);
    return;
  }

  const payer = payment.payer ?? {};
  const address = payer.address ?? {};
  const payerName =
    [payer.first_name, payer.last_name].filter(Boolean).join(" ") ||
    "Cliente PR Tracker";

  // Best-effort: ME requires address fields the MP payer object doesn't
  // always include. We pull what we can from metadata + payer.
  const shipmentPayload = {
    service: serviceId,
    from: {
      name: "PR Tracker Ltda",
      phone: "51982061914",
      email: "contato@prtracker.com.br",
      document: "59947215000167", // CNPJ PR Tracker Ltda
      company_document: "59947215000167",
      state_register: "isento",
      address: "Av. Bagé",
      complement: "Apto 501",
      number: "232",
      district: "Petrópolis",
      city: "Porto Alegre",
      state_abbr: "RS",
      country_id: "BR",
      postal_code: cepOrigem,
    },
    to: {
      name: payerName,
      phone: String(payer.phone?.area_code ?? "") + String(payer.phone?.number ?? ""),
      email: payer.email ?? "",
      document: String(payer.identification?.number ?? meta.customer_cpf ?? ""),
      address: String(address.street_name ?? ""),
      complement: String(meta.shipping_complement ?? ""),
      number: String(address.street_number ?? ""),
      district: String(meta.shipping_neighborhood ?? ""),
      city: String(meta.shipping_city ?? ""),
      state_abbr: String(meta.shipping_state ?? ""),
      country_id: "BR",
      postal_code: destCep,
    },
    products: [
      {
        name: `PR Tracker — Pedido ${payment.external_reference ?? payment.id}`,
        quantity: 1,
        unitary_value: Number(payment.transaction_amount ?? 0),
      },
    ],
    options: {
      insurance_value: Number(payment.transaction_amount ?? 0),
      receipt: false,
      own_hand: false,
      reverse: false,
      non_commercial: true,
    },
  };

  // Step 1: add to ME cart
  const cartRes = await meFetch(`${meHost}/api/v2/me/cart`, meToken, shipmentPayload);
  if (!cartRes.ok) {
    throw new Error(`ME /cart failed: ${cartRes.status} ${await cartRes.text()}`);
  }
  const cartItem = (await cartRes.json()) as { id: string };
  console.log("[mp-webhook] ME cart item:", cartItem.id);

  // Step 2: checkout (uses ME wallet balance)
  const checkoutRes = await meFetch(
    `${meHost}/api/v2/me/shipment/checkout`,
    meToken,
    { orders: [cartItem.id] },
  );
  if (!checkoutRes.ok) {
    throw new Error(
      `ME /checkout failed: ${checkoutRes.status} ${await checkoutRes.text()}`,
    );
  }

  // Step 3: generate PDF label
  const genRes = await meFetch(
    `${meHost}/api/v2/me/shipment/generate`,
    meToken,
    { orders: [cartItem.id] },
  );
  if (!genRes.ok) {
    throw new Error(
      `ME /generate failed: ${genRes.status} ${await genRes.text()}`,
    );
  }

  console.log("[mp-webhook] ME label generated for order", cartItem.id, {
    payment_id: payment.id,
    external_reference: payment.external_reference,
  });
}

async function meFetch(
  url: string,
  token: string,
  body: unknown,
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "PR Tracker (contato@prtracker.com.br)",
    },
    body: JSON.stringify(body),
  });
}
