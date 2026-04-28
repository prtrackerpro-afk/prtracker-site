import type { APIRoute } from "astro";
import { MercadoPagoConfig, Payment } from "mercadopago";
import crypto from "node:crypto";
import {
  sendOwnerOrderAlert,
  sendCustomerConfirmation,
  type OrderEmailData,
} from "~/lib/email";
import { sendCapiPurchase, sendGa4Purchase } from "~/lib/tracking-server";

export const prerender = false;

/**
 * In-memory idempotency guard. MP dispara múltiplos eventos `payment.updated`
 * pra mesma compra (Pix: pending→approved; cartão: authorized→approved;
 * retries). Cada evento com status=approved entraria no fluxo de email +
 * etiqueta, gerando duplicatas.
 *
 * Mantém um Map<paymentId, processedAt> no escopo do módulo — sobrevive a
 * múltiplas invocações do mesmo serverless instance (warm), que é onde a
 * duplicata acontece 99 % das vezes (MP retrta em segundos/minutos).
 *
 * Edge case: cold start após 10 min re-envia; múltiplas instâncias Vercel
 * que recebem o mesmo webhook também. Pra volume atual, aceitável.
 */
const processedPayments = new Map<string, number>();
const DEDUP_TTL_MS = 10 * 60 * 1000;

function markProcessed(id: string): boolean {
  const now = Date.now();
  for (const [k, ts] of processedPayments) {
    if (now - ts > DEDUP_TTL_MS) processedPayments.delete(k);
  }
  if (processedPayments.has(id)) return false;
  processedPayments.set(id, now);
  return true;
}

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

  console.log("[mp-webhook] incoming", {
    paymentId,
    action: body?.action,
    type: body?.type,
    live_mode: body?.live_mode,
    user_id: body?.user_id,
  });

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

  // Idempotência: MP dispara múltiplos eventos pra mesma payment approved.
  // Se já processamos essa payment recentemente, ignora pra não duplicar
  // email + tentativa de etiqueta.
  const dedupKey = String(payment.id);
  if (!markProcessed(dedupKey)) {
    console.log("[mp-webhook] duplicate approved event — skipping", dedupKey);
    return new Response("ok", { status: 200 });
  }

  let labelError: string | null = null;
  try {
    await generateShippingLabel(payment);
  } catch (err) {
    labelError = err instanceof Error ? err.message : String(err);
    console.error("[mp-webhook] shipping label generation failed:", err);
  }

  // Order notifications + server-side conversion tracking — all fire-and-forget.
  // A broken SMTP or ad platform API never blocks MP's 200 ack, and the
  // helpers swallow their own errors so one failing side doesn't abort the
  // others. Runs in parallel to shave ~1s off webhook latency.
  //
  // fbp/fbc/_ga foram capturados em /api/create-pix-payment ou
  // /api/create-preference e armazenados no metadata da MP — recuperamos
  // aqui pra enriquecer o Purchase no CAPI e GA4 MP. Sem eles o match rate
  // cai ~10-15pp e o GA4 atribui a "(direct)" em vez da sessão original.
  const meta = (payment.metadata ?? {}) as Record<string, unknown>;
  const trackingCtx = {
    fbp: meta.fbp ? String(meta.fbp) : undefined,
    fbc: meta.fbc ? String(meta.fbc) : undefined,
    gaClientId: meta.ga_client_id ? String(meta.ga_client_id) : undefined,
    clientUserAgent: request.headers.get("user-agent") ?? undefined,
  };

  try {
    const emailData = buildOrderEmailData(payment, labelError);
    await Promise.allSettled([
      sendOwnerOrderAlert(emailData),
      sendCustomerConfirmation(emailData),
      sendCapiPurchase(payment, trackingCtx),
      sendGa4Purchase(payment, trackingCtx),
    ]);
  } catch (err) {
    console.error("[mp-webhook] post-payment tasks failed:", err);
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
  // MP masks payer.email and payer.first_name/last_name for Pix. We
  // stored the raw values in metadata at preference creation time —
  // prefer those, fall back to payer fields for older orders.
  const payerName =
    String(meta.customer_name ?? "") ||
    [payer.first_name, payer.last_name].filter(Boolean).join(" ") ||
    "Cliente PR Tracker";
  const phone =
    String(meta.customer_phone ?? "") ||
    String(payer.phone?.area_code ?? "") + String(payer.phone?.number ?? "");
  const email =
    String(meta.customer_email ?? "") || String(payer.email ?? "");

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
      email,
      phone,
      cpf: String(payer.identification?.number ?? meta.customer_cpf ?? ""),
    },
    shipping: {
      cep: String(meta.shipping_cep ?? ""),
      street: String(meta.shipping_street ?? address.street_name ?? ""),
      number: String(meta.shipping_number ?? address.street_number ?? ""),
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
  // MP anonymizes payer fields for Pix — always prefer the raw metadata
  // we captured at preference time.
  const recipientName =
    String(meta.customer_name ?? "") ||
    [payer.first_name, payer.last_name].filter(Boolean).join(" ") ||
    "Cliente PR Tracker";
  const recipientEmail =
    String(meta.customer_email ?? "") || String(payer.email ?? "");
  const recipientPhone =
    String(meta.customer_phone ?? "") ||
    String(payer.phone?.area_code ?? "") + String(payer.phone?.number ?? "");
  const recipientCpf = String(
    meta.customer_cpf ?? payer.identification?.number ?? "",
  );
  const recipientStreet = String(meta.shipping_street ?? address.street_name ?? "");
  const recipientNumber = String(meta.shipping_number ?? address.street_number ?? "");

  // ME requires a CPF in `from.document` (the responsible person's CPF)
  // even when shipping as PJ — the CNPJ goes in `company_document`.
  const fromCpf = (import.meta.env.ME_FROM_CPF ?? "").replace(/\D/g, "");
  if (!fromCpf) {
    console.warn(
      "[mp-webhook] ME_FROM_CPF missing — cannot buy label (ME requires CPF in from.document)",
    );
    return;
  }

  // ME /cart requires volumes[] (packages). We pre-computed them at
  // preference-creation time and stored as JSON on metadata — cart info
  // isn't available anymore at webhook time.
  let volumes: Array<{
    height: number;
    width: number;
    length: number;
    weight: number;
  }> = [];
  try {
    const raw = String(meta.shipping_volumes ?? "");
    if (raw) volumes = JSON.parse(raw);
  } catch {
    console.warn("[mp-webhook] failed to parse shipping_volumes", meta.shipping_volumes);
  }
  if (volumes.length === 0) {
    // Defensive fallback: conservative box dims so the label still goes
    // through. Real weight is unknown — use 1kg to stay above ME minimum.
    volumes = [{ height: 10, width: 20, length: 20, weight: 1 }];
    console.warn("[mp-webhook] no shipping_volumes in metadata, using fallback box");
  }

  const shipmentPayload = {
    service: serviceId,
    volumes,
    from: {
      name: "PR Tracker Ltda",
      phone: "51982061914",
      email: "contato@prtracker.com.br",
      document: fromCpf,
      company_document: "59947215000167", // CNPJ PR Tracker Ltda
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
      name: recipientName,
      phone: recipientPhone,
      email: recipientEmail,
      document: recipientCpf,
      address: recipientStreet,
      complement: String(meta.shipping_complement ?? ""),
      number: recipientNumber,
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
