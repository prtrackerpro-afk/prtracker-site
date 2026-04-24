import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { z } from "astro:content";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { applyPix } from "~/lib/format";
import { PIX_DISCOUNT, MAX_INSTALLMENTS } from "~/lib/catalog";
import { recomputeLine } from "~/lib/pricing";
import { validateCoupon } from "~/lib/coupons";

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

const shippingOptionSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(80),
  company: z.string().min(1).max(80),
  price_cents: z.number().int().min(0).max(1_000_00),
  delivery_days_max: z.number().int().min(0).max(90),
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
  shippingOption: shippingOptionSchema,
  paymentMethod: z.enum(["pix", "credit"]),
  items: z.array(cartItemSchema).min(1).max(20),
  couponCode: z.string().trim().max(60).optional(),
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

  // Per-package shipping dims — we pass these to Melhor Envio /cart via
  // metadata so the webhook can buy the label without re-reading the cart.
  const shippingVolumes: Array<{
    height: number;
    width: number;
    length: number;
    weight: number;
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

      const dims = product.data.shipping;
      const isStandaloneAnilhas = product.data.slug === "anilhas";
      const totalPairs = isStandaloneAnilhas
        ? (input.plates ?? []).reduce((n, p) => n + p.pairs, 0) || 1
        : 1;
      const weightKg = (dims.weight_g * totalPairs) / 1000;
      // ME accepts one volume row per *package*, not per line. We push one
      // per unit in the cart (quantity × volume) so a buyer ordering 3
      // sets ships 3 boxes.
      for (let q = 0; q < input.quantity; q++) {
        shippingVolumes.push({
          height: dims.height_cm,
          width: dims.width_cm,
          length: dims.length_cm,
          weight: Number(weightKg.toFixed(3)),
        });
      }
    } catch (err) {
      return jsonResponse(400, {
        error: err instanceof Error ? err.message : "Item inválido.",
      });
    }
  }

  // Apply coupon first (discounts the merch subtotal). Pix discount then
  // stacks on top of the already-discounted subtotal — matching how WC
  // handles coupon + Pix on the legacy site.
  let couponDiscountCents = 0;
  let couponCreditedTo: string | null = null;
  if (data.couponCode && data.couponCode.length > 0) {
    const result = validateCoupon(data.couponCode, subtotalCents);
    if (!result.ok) {
      return jsonResponse(400, {
        error: result.message,
        field: "couponCode",
      });
    }
    couponDiscountCents = result.discountCents;
    couponCreditedTo = result.creditedTo;
    if (couponDiscountCents > 0) {
      mpItems.push({
        id: `coupon-${result.coupon.code}`,
        title: `Cupom ${result.coupon.code.toUpperCase()}${
          couponCreditedTo !== result.coupon.code ? ` — ${couponCreditedTo}` : ""
        }`,
        quantity: 1,
        currency_id: "BRL",
        unit_price: -(Math.round(couponDiscountCents) / 100),
      });
    }
  }
  const subtotalAfterCouponCents = subtotalCents - couponDiscountCents;

  // Apply Pix discount as a negative item if applicable.
  // Pix discount applies only to (post-coupon) product subtotal, not freight.
  const isPix = data.paymentMethod === "pix";
  if (isPix) {
    const discountCents =
      subtotalAfterCouponCents - applyPix(subtotalAfterCouponCents);
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

  // Add freight as its own line so the customer sees it clearly on MP.
  const freightCents = data.shippingOption.price_cents;
  if (freightCents > 0) {
    mpItems.push({
      id: `frete-${data.shippingOption.id}`,
      title: `Frete — ${data.shippingOption.company} · ${data.shippingOption.name}`,
      quantity: 1,
      currency_id: "BRL",
      unit_price: Math.round(freightCents) / 100,
    });
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
          // Força o MP a mostrar só a modalidade escolhida na nossa tela.
          // Antes, com o PIX selecionado, o MP ainda exibia "cartão pré-pago";
          // com cartão, exibia Pix + débito virtual CAIXA. Agora excluímos
          // TUDO exceto a categoria escolhida.
          //  - Pix vive em "bank_transfer".
          //  - Cartão de crédito é "credit_card".
          excluded_payment_types: isPix
            ? [
                { id: "credit_card" },
                { id: "debit_card" },
                { id: "prepaid_card" },
                { id: "ticket" },
                { id: "atm" },
                { id: "digital_currency" },
              ]
            : [
                { id: "bank_transfer" },
                { id: "debit_card" },
                { id: "prepaid_card" },
                { id: "ticket" },
                { id: "atm" },
                { id: "digital_currency" },
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
        metadata: {
          // MP anonymizes payer.email / payer.name for Pix payments, so we
          // mirror the checkout data here to recover it in the webhook.
          customer_name: data.customer.name,
          customer_email: data.customer.email,
          customer_cpf: data.customer.cpf,
          customer_phone: data.customer.phone,
          payment_method_hint: data.paymentMethod,
          shipping_cep: data.shipping.cep,
          shipping_street: data.shipping.street,
          shipping_number: data.shipping.number,
          shipping_service_id: data.shippingOption.id,
          shipping_service_name: `${data.shippingOption.company} · ${data.shippingOption.name}`,
          shipping_neighborhood: data.shipping.neighborhood,
          shipping_city: data.shipping.city,
          shipping_state: data.shipping.state,
          shipping_complement: data.shipping.complement ?? "",
          coupon_code: data.couponCode?.toLowerCase() ?? "",
          coupon_discount_cents: couponDiscountCents,
          coupon_credited_to: couponCreditedTo ?? "",
          shipping_volumes: JSON.stringify(shippingVolumes),
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
