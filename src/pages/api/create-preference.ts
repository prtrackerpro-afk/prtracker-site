import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { MAX_INSTALLMENTS } from "~/lib/catalog";
import { buildOrder, orderPayloadSchema } from "~/lib/order-build";

export const prerender = false;

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

  // This endpoint is for CARTÃO flow. Pix goes through /api/create-pix-payment
  // so the customer stays on our site with real-time confirmation. Reject
  // Pix here so legacy clients don't accidentally end up on MP's QR page.
  if (data.paymentMethod !== "credit") {
    return jsonResponse(400, {
      error: "Método de pagamento inválido para esse endpoint.",
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

  // Shape items for MP's Preference API (adds currency_id, drops empty
  // picture_url which MP rejects with "invalid URL").
  const mpItems = order.items.map((it) => ({
    id: it.id,
    title: it.title,
    quantity: it.quantity,
    currency_id: "BRL" as const,
    unit_price: it.unit_price,
    ...(it.picture_url ? { picture_url: it.picture_url } : {}),
  }));

  const accessToken = import.meta.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return jsonResponse(500, {
      error:
        "Mercado Pago não configurado. Defina MP_ACCESS_TOKEN nas variáveis de ambiente.",
    });
  }

  // Origin pro back_urls. `new URL(request.url).origin` às vezes volta
  // com host interno do runtime serverless em alguns edges da Vercel, o
  // que fez MP levar o botão "Voltar à loja" pra localhost. Preferimos
  // o host do header com fallback pro env var.
  const fwdHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const fwdProto = request.headers.get("x-forwarded-proto") ?? "https";
  const derivedOrigin =
    fwdHost && !fwdHost.startsWith("localhost") ? `${fwdProto}://${fwdHost}` : null;
  const origin =
    derivedOrigin ??
    import.meta.env.PUBLIC_SITE_URL ??
    "https://prtracker.com.br";

  try {
    const client = new MercadoPagoConfig({ accessToken });
    const preferenceApi = new Preference(client);
    const result = await preferenceApi.create({
      body: {
        items: mpItems,
        payer: {
          name: data.customer.name,
          email: data.customer.email,
          phone: {
            area_code: data.customer.phone.slice(0, 2),
            number: data.customer.phone.slice(2),
          },
          identification: { type: "CPF", number: data.customer.cpf },
          address: {
            zip_code: data.shipping.cep,
            street_name: data.shipping.street,
            street_number: Number(data.shipping.number.replace(/\D/g, "")) || undefined,
          },
        },
        shipments: {
          receiver_address: {
            zip_code: data.shipping.cep,
            street_name: data.shipping.street,
            street_number: Number(data.shipping.number.replace(/\D/g, "")) || undefined,
            city_name: data.shipping.city,
            state_name: data.shipping.state,
            country_name: "Brasil",
            apartment: data.shipping.complement || undefined,
          },
        },
        payment_methods: {
          // Cartão-only endpoint — excluir Pix + débito + boleto. Assim
          // quem cai aqui só vê cartão (até 6× sem juros).
          excluded_payment_types: [
            { id: "bank_transfer" },
            { id: "debit_card" },
            { id: "ticket" },
          ],
          installments: MAX_INSTALLMENTS,
        },
        back_urls: {
          success: `${origin}/obrigado`,
          failure: `${origin}/checkout?status=failure`,
          pending: `${origin}/obrigado?status=pending`,
        },
        auto_return: "approved",
        notification_url: `${origin}/api/mp-webhook`,
        statement_descriptor: "PRTRACKER",
        external_reference: `order_${Date.now()}`,
        metadata: order.metadata,
      },
    });

    const id = result.id;
    const init_point = result.init_point ?? result.sandbox_init_point;
    if (!id || !init_point) {
      throw new Error("Mercado Pago não retornou init_point.");
    }
    return jsonResponse(200, { id, init_point });
  } catch (err) {
    console.error("[create-preference] MP error:", err);
    const message =
      err instanceof Error ? err.message : "Falha ao criar preferência de pagamento.";
    return jsonResponse(502, { error: message });
  }
};
