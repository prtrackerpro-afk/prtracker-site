import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { buildOrder, orderPayloadSchema } from "~/lib/order-build";
import { extractTrackingCookies } from "~/lib/tracking-cookies";

export const prerender = false;

/**
 * Creates a Pix payment directly via MP's Payment API (NOT Preference /
 * Checkout Pro). This lets us render the QR code on our own page with
 * real-time polling, instead of redirecting the customer to MP's
 * generic QR screen where there's no payment-received feedback.
 *
 * Flow:
 *   1. Validate + rebuild order server-side (same helper cartão uses)
 *   2. POST /v1/payments with payment_method_id=pix
 *   3. Return { payment_id, qr_code, qr_code_base64, ticket_url, expires_at }
 *   4. Client redirects to /pagamento/pix?p=<id>
 *
 * The MP webhook at /api/mp-webhook still handles email + label when the
 * customer pays. Page-side polling is just for UI — side effects come
 * from the webhook.
 */

function jsonResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function absoluteFrom(request: Request): (path: string) => string {
  const origin = new URL(request.url).origin;
  return (path: string) => {
    if (path.startsWith("http")) return path;
    return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
  };
}

// MP quer ISO 8601 com offset. 1h de validade pra o QR é suficiente
// (se o cliente não pagar em 1h, provavelmente abandonou).
function pixExpiresAt(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  // "2026-04-24T13:00:00.000-03:00"
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const offH = pad(Math.floor(Math.abs(offsetMin) / 60));
  const offM = pad(Math.abs(offsetMin) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}${sign}${offH}:${offM}`;
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? full.trim();
  const last = parts.slice(1).join(" ");
  return { first, last };
}

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "JSON inválido." });
  }

  const parsed = orderPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(400, {
      error: "Dados do pedido inválidos.",
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }
  const data = parsed.data;

  if (data.paymentMethod !== "pix") {
    return jsonResponse(400, {
      error: "Esse endpoint só aceita paymentMethod=pix.",
    });
  }

  const products = await getCollection("products");
  const built = buildOrder(data, products, absoluteFrom(request));
  if (!built.ok) {
    return jsonResponse(built.status, {
      error: built.error,
      ...(built.field ? { field: built.field } : {}),
    });
  }
  const order = built.order;

  // Tracking cookies — capturados aqui (último ponto onde temos contexto
  // do navegador antes de chamar a MP). Vão pra metadata pro webhook
  // recuperar e enriquecer o Purchase no CAPI/GA4 (sobe match rate ~10-15pp).
  const tracking = extractTrackingCookies(request.headers.get("cookie"));
  const metadata: Record<string, string | number> = {
    ...order.metadata,
    ...(tracking.fbp ? { fbp: tracking.fbp } : {}),
    ...(tracking.fbc ? { fbc: tracking.fbc } : {}),
    ...(tracking.gaClientId ? { ga_client_id: tracking.gaClientId } : {}),
  };

  const accessToken = import.meta.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return jsonResponse(500, {
      error:
        "Mercado Pago não configurado. Defina MP_ACCESS_TOKEN nas variáveis de ambiente.",
    });
  }

  const fwdHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const fwdProto = request.headers.get("x-forwarded-proto") ?? "https";
  const derivedOrigin =
    fwdHost && !fwdHost.startsWith("localhost") ? `${fwdProto}://${fwdHost}` : null;
  const origin =
    derivedOrigin ??
    import.meta.env.PUBLIC_SITE_URL ??
    "https://prtracker.com.br";

  const { first, last } = splitName(data.customer.name);
  const externalReference = `order_${Date.now()}`;
  const description = `PR Tracker · ${data.items.length} item(s)`;
  // MP quer o total em reais com 2 decimais. Usa Math.round nos centavos
  // primeiro pra evitar drift de float.
  const transaction_amount = Math.round(order.totalCents) / 100;

  // MP Payment API `additional_info.items` (ligeiramente diferente de
  // Preference.items — sem currency_id, aceita strings vazias). Só pra
  // aparecer no registro/email; não afeta transaction_amount.
  const additionalItems = order.items.map((it) => ({
    id: it.id,
    title: it.title,
    quantity: it.quantity,
    unit_price: it.unit_price,
    ...(it.picture_url ? { picture_url: it.picture_url } : {}),
  }));

  try {
    const client = new MercadoPagoConfig({ accessToken });
    const paymentApi = new Payment(client);
    // MP recomenda X-Idempotency-Key pra POST /v1/payments — evita dupla
    // cobrança se o cliente apertar submit duas vezes.
    const idempotencyKey = `${externalReference}-${data.customer.cpf}`;

    const result = await paymentApi.create({
      body: {
        transaction_amount,
        description,
        payment_method_id: "pix",
        external_reference: externalReference,
        notification_url: `${origin}/api/mp-webhook`,
        date_of_expiration: pixExpiresAt(1),
        payer: {
          email: data.customer.email,
          first_name: first,
          last_name: last,
          identification: { type: "CPF", number: data.customer.cpf },
        },
        additional_info: {
          items: additionalItems,
          payer: {
            first_name: first,
            last_name: last,
            phone: {
              area_code: data.customer.phone.slice(0, 2),
              number: data.customer.phone.slice(2),
            },
            address: {
              zip_code: data.shipping.cep,
              street_name: data.shipping.street,
              street_number: data.shipping.number,
            },
          },
          shipments: {
            receiver_address: {
              zip_code: data.shipping.cep,
              street_name: data.shipping.street,
              street_number: data.shipping.number,
              city_name: data.shipping.city,
              state_name: data.shipping.state,
              apartment: data.shipping.complement || undefined,
            },
          },
        },
        metadata,
      },
      requestOptions: {
        idempotencyKey,
      },
    });

    const id = result.id;
    const pix = result.point_of_interaction?.transaction_data;
    if (!id || !pix?.qr_code || !pix?.qr_code_base64) {
      console.error("[create-pix-payment] MP response missing QR data:", result);
      return jsonResponse(502, {
        error: "Mercado Pago não retornou o QR do Pix.",
      });
    }

    return jsonResponse(200, {
      payment_id: String(id),
      external_reference: externalReference,
      qr_code: pix.qr_code,
      qr_code_base64: pix.qr_code_base64,
      ticket_url: pix.ticket_url ?? null,
      expires_at: result.date_of_expiration ?? null,
      amount: transaction_amount,
    });
  } catch (err) {
    console.error("[create-pix-payment] MP error:", err);
    const message =
      err instanceof Error ? err.message : "Falha ao criar pagamento Pix.";
    return jsonResponse(502, { error: message });
  }
};
