/**
 * Shared order-building logic — used by both `/api/create-preference`
 * (cartão, via Checkout Pro) and `/api/create-pix-payment` (Pix nativo
 * via Payment API).
 *
 * Responsible for:
 *   - Recomputing prices server-side (never trusts the client)
 *   - Applying coupon + Pix discount rules
 *   - Computing per-package shipping volumes
 *   - Building the metadata bag the webhook relies on
 *
 * Does NOT create any MP resource — just prepares the data the callers
 * hand to MP's SDK.
 */

import type { CollectionEntry } from "astro:content";
import { z } from "astro:content";
import { applyPix } from "./format";
import { PIX_DISCOUNT } from "./catalog";
import { recomputeLine } from "./pricing";
import { validateCoupon } from "./coupons";
import type { CartItem } from "./cart-types";

// ---------------------------------------------------------------------------
// Zod schema — shared by every endpoint that creates an order.

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

export const orderPayloadSchema = z.object({
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

export interface OrderInput {
  customer: {
    name: string;
    email: string;
    phone: string;
    cpf: string;
  };
  shipping: {
    cep: string;
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
  };
  shippingOption: {
    id: number;
    name: string;
    company: string;
    price_cents: number;
    delivery_days_max: number;
  };
  paymentMethod: "pix" | "credit";
  items: CartItem[];
  couponCode?: string;
}

export interface BuiltOrderItem {
  id: string;
  title: string;
  picture_url: string;
  quantity: number;
  unit_price: number; // reais, 2 decimals
}

export interface BuiltOrder {
  /** Line items ready for MP (product + discount + freight rows). */
  items: BuiltOrderItem[];
  /** Total the customer pays, in cents. */
  totalCents: number;
  /** Merch subtotal before any discount, in cents. */
  subtotalCents: number;
  /** Coupon info (for metadata + display). */
  coupon: {
    code: string;
    discountCents: number;
    creditedTo: string;
  } | null;
  /** Pix discount applied, in cents. 0 if not Pix. */
  pixDiscountCents: number;
  /** Per-package shipping dims for Melhor Envio. */
  shippingVolumes: Array<{
    height: number;
    width: number;
    length: number;
    weight: number;
  }>;
  /** Metadata bag the webhook reads to reconstruct the order. */
  metadata: Record<string, string | number>;
}

export type BuildOrderResult =
  | { ok: true; order: BuiltOrder }
  | { ok: false; status: number; error: string; field?: string };

export function buildOrder(
  data: OrderInput,
  products: Array<CollectionEntry<"products">>,
  absoluteUrl: (path: string) => string,
): BuildOrderResult {
  const bySlug = new Map(products.map((p) => [p.data.slug, p]));

  const items: BuiltOrderItem[] = [];
  const shippingVolumes: BuiltOrder["shippingVolumes"] = [];
  let subtotalCents = 0;

  for (const input of data.items) {
    const product = bySlug.get(input.productSlug);
    if (!product) {
      return {
        ok: false,
        status: 400,
        error: `Produto não encontrado: ${input.productSlug}`,
      };
    }
    try {
      const priced = recomputeLine(input, product);
      subtotalCents += priced.lineTotalCents;
      items.push({
        id: `${input.productSlug}-${input.id.slice(0, 40)}`,
        title: priced.title,
        picture_url: absoluteUrl(priced.picture_url),
        quantity: input.quantity,
        unit_price: Math.round(priced.unitPriceCents) / 100,
      });

      const dims = product.data.shipping;
      const isStandaloneAnilhas = product.data.slug === "anilhas";
      const totalPairs = isStandaloneAnilhas
        ? (input.plates ?? []).reduce((n, p) => n + p.pairs, 0) || 1
        : 1;
      const weightKg = (dims.weight_g * totalPairs) / 1000;
      for (let q = 0; q < input.quantity; q++) {
        shippingVolumes.push({
          height: dims.height_cm,
          width: dims.width_cm,
          length: dims.length_cm,
          weight: Number(weightKg.toFixed(3)),
        });
      }
    } catch (err) {
      return {
        ok: false,
        status: 400,
        error: err instanceof Error ? err.message : "Item inválido.",
      };
    }
  }

  // Coupon first (discounts merch subtotal); Pix then stacks on the
  // post-coupon subtotal — matches the legacy WC site.
  let couponDiscountCents = 0;
  let couponCreditedTo: string | null = null;
  let couponInfo: BuiltOrder["coupon"] = null;

  if (data.couponCode && data.couponCode.length > 0) {
    const result = validateCoupon(data.couponCode, subtotalCents);
    if (!result.ok) {
      return { ok: false, status: 400, error: result.message, field: "couponCode" };
    }
    couponDiscountCents = result.discountCents;
    couponCreditedTo = result.creditedTo;
    if (couponDiscountCents > 0) {
      items.push({
        id: `coupon-${result.coupon.code}`,
        title: `Cupom ${result.coupon.code.toUpperCase()}${
          couponCreditedTo !== result.coupon.code ? ` — ${couponCreditedTo}` : ""
        }`,
        picture_url: "",
        quantity: 1,
        unit_price: -(Math.round(couponDiscountCents) / 100),
      });
    }
    couponInfo = {
      code: result.coupon.code,
      discountCents: couponDiscountCents,
      creditedTo: couponCreditedTo,
    };
  }

  const subtotalAfterCouponCents = subtotalCents - couponDiscountCents;

  // Pix discount (applies only to post-coupon merch subtotal, not freight).
  let pixDiscountCents = 0;
  if (data.paymentMethod === "pix") {
    pixDiscountCents = subtotalAfterCouponCents - applyPix(subtotalAfterCouponCents);
    if (pixDiscountCents > 0) {
      items.push({
        id: "pix-discount",
        title: `Desconto Pix (${Math.round(PIX_DISCOUNT * 100)}% OFF)`,
        picture_url: "",
        quantity: 1,
        unit_price: -(Math.round(pixDiscountCents) / 100),
      });
    }
  }

  const freightCents = data.shippingOption.price_cents;
  if (freightCents > 0) {
    items.push({
      id: `frete-${data.shippingOption.id}`,
      title: `Frete — ${data.shippingOption.company} · ${data.shippingOption.name}`,
      picture_url: "",
      quantity: 1,
      unit_price: Math.round(freightCents) / 100,
    });
  }

  const totalCents =
    subtotalCents - couponDiscountCents - pixDiscountCents + freightCents;

  const metadata: Record<string, string | number> = {
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
  };

  return {
    ok: true,
    order: {
      items,
      totalCents,
      subtotalCents,
      coupon: couponInfo,
      pixDiscountCents,
      shippingVolumes,
      metadata,
    },
  };
}
