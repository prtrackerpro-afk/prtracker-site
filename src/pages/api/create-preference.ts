import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { z } from "astro:content";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { applyPix } from "~/lib/format";
import { PIX_DISCOUNT, MAX_INSTALLMENTS } from "~/lib/catalog";
import { recomputeLine } from "~/lib/pricing";

export const prerender = false;

/** Input payload schema. */
const plateSelectionSchema = z.object({
  plateId: z.enum(["25", "20", "15", "10", "5", "2_5", "1_25"]),
  pairs: z.number().int().min(0).max(4),
});

const cartItemSchema = z.object({
  id: z.string().min(1).max(200),
  productSlug: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  image: z.string().min(1).max(500),
  unitPriceCents: z.number().int().min(0).max(10_000_00),
  quantity: z.number().int().min(1).max(20),
  plates: z.array(plateSelectionSchema).optional(),
  exercise: z.string().max(60).optional(),
  size: z.string().max(10).optional(),
});

const payloadSchema = z.object({
  customer: z.object({
    name: z.string().min(3).max(120),
    email: z.string().email().max(120),
    phone: z.string().regex(/^\d{10,11}$/),
    cpf: z.string().regex(/^\d{11}$/),
  }),
  shipping: z.object({
    cep: z.string().regex(/^\d{8}$/),
    street: z.string().min(1).max(200),
    number: z.string().min(1).max(20),
    complement: z.string().max(100).optional().default(""),
    neighborhood: z.string().min(1).max(120),
    city: z.string().min(1).max(120),
    state: z.string().length(2),
  }),
  paymentMethod: z.enum(["pix", "credit"]),
  items: z.array(cartItemSchema).min(1).max(20),
});

function jsonResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request }) => {
  // --- Parse & validate -------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "JSON inválido." });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(400, {
      error: "Dados do pedido inválidos.",
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }
  const data = parsed.data;

  // --- Recompute prices server-side (never trust client) ----------------
  const products = await getCollection("products");
  const bySlug = new Map(products.map((p) => [p.data.slug, p]));

  const mpItems: Array<{
    id: string;
    title: string;
    description?: string;
    picture_url?: string;
    quantity: number;
    currency_id: "BRL";
    unit_price: number; // reais, 2 decimals
  }> = [];

  let subtotalCents = 0;
  for (const input of data.items) {
    const product = bySlug.get(input.productSlug);
    if (!product) {
      return jsonResponse(400, { error: `Produto não encontrado: ${input.productSlug}` });
    }
    try {
      const priced = recomputeLine(input, product);
      subtotalCents += priced.lineTotalCents;
      mpItems.push({
        id: `${input.productSlug}-${input.id.slice(0, 40)}`,
        title: priced.title,
        picture_url: absoluteUrl(request, priced.picture_url),
        quantity: input.quantity,
        currency_id: "BRL",
        unit_price: Math.round(priced.unitPriceCents) / 100,
      });
    } catch (err) {
      return jsonResponse(400, {
        error: err instanceof Error ? err.message : "Item inválido.",
      });
    }
  }

  // Apply Pix discount as a negative item if applicable
  const isPix = data.paymentMethod === "pix";
  if (isPix) {
    const discountCents = subtotalCents - applyPix(subtotalCents);
    if (discountCents > 0) {
      mpItems.push({
        id: "pix-discount",
        title: `Desconto Pix (${Math.round(PIX_DISCOUNT * 100)}% OFF)`,
        quantity: 1,
        currency_id: "BRL",
        unit_price: -(Math.round(discountCents) / 100),
      });
    }
  }

  // --- Create MP preference ---------------------------------------------
  const accessToken = import.meta.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return jsonResponse(500, {
      error:
        "Mercado Pago não configurado. Defina MP_ACCESS_TOKEN nas variáveis de ambiente.",
    });
  }

  const origin = new URL(request.url).origin;

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
          excluded_payment_types: isPix
            ? [{ id: "credit_card" }, { id: "debit_card" }, { id: "ticket" }]
            : [{ id: "ticket" }],
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
        metadata: {
          customer_cpf: data.customer.cpf,
          customer_phone: data.customer.phone,
          payment_method_hint: data.paymentMethod,
          shipping_cep: data.shipping.cep,
        },
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

function absoluteUrl(request: Request, path: string): string {
  if (path.startsWith("http")) return path;
  const origin = new URL(request.url).origin;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
