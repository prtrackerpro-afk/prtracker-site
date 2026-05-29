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
import { validCpf } from "./cpf";
import { validateCoupon } from "./coupons";
import type { PickupLocation } from "./coupons";
import type { CartItem } from "./cart-types";
import { lookupGiftCard } from "./gift-cards";

// ---------------------------------------------------------------------------
// Zod schema — shared by every endpoint that creates an order.

const plateSelectionSchema = z.object({
  plateId: z.enum(["25", "20", "15", "10", "5", "2_5", "1_25"]),
  pairs: z.number().int().min(0).max(4),
});

const boardBarbellSchema = z.object({
  exercise: z.string().min(1).max(60),
  plates: z.array(plateSelectionSchema).default([]),
});

const runTimeSchema = z
  .string()
  .max(8)
  .regex(/^\d{1,2}:\d{2}:\d{2}$/, "Tempo deve ter formato hh:mm:ss");

const runningTimesSchema = z
  .object({
    "5km": runTimeSchema.optional(),
    "10km": runTimeSchema.optional(),
    "21km": runTimeSchema.optional(),
    "42km": runTimeSchema.optional(),
  })
  .strict();

export const cartItemSchema = z.object({
  id: z.string().min(1).max(200),
  productSlug: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  image: z.string().min(1).max(500),
  unitPriceCents: z.number().int().min(0).max(10_000_00),
  quantity: z.number().int().min(1).max(20),
  plates: z.array(plateSelectionSchema).optional(),
  exercise: z.string().max(60).optional(),
  size: z.string().max(10).optional(),
  runningTimes: runningTimesSchema.optional(),
  boardColor: z.enum(["cobre", "preto", "rosa"]).optional(),
  boardBarbells: z.array(boardBarbellSchema).min(2).max(3).optional(),
  /** Vale-presente: denominação em cents (R$ 100 / 150 / 200 / 300 / 500). */
  giftCardValueCents: z.number().int().positive().max(100_000_00).optional(),
  giftCardRecipientName: z.string().trim().max(80).optional(),
  giftCardRecipientEmail: z.string().trim().email().max(120).optional(),
  giftCardMessage: z.string().trim().max(280).optional(),
});

const shippingOptionSchema = z.object({
  // Sentinelas:
  //   id=0  → retirada presencial (pickup unlock via cupom)
  //   id=-1 → entrega digital (carrinho 100% digital, ex: vale-presente)
  // Qualquer id positivo é um service do Melhor Envio.
  id: z.number().int().min(-1),
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
    // Formato 11 dígitos + algoritmo dos DV. Rejeita "99999999999",
    // "11111111111", e qualquer string com checksum inválido. Mesmo
    // helper usado client-side em checkout.astro pra evitar drift.
    cpf: z
      .string()
      .regex(/^\d{11}$/, "CPF precisa ter 11 dígitos")
      .refine(validCpf, "CPF inválido — verifique os dígitos"),
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
  /** Vale-presente aplicado (resgate). */
  giftCardApplied: {
    cardId: string;
    code: string;
    discountCents: number;
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

export async function buildOrder(
  data: OrderInput,
  products: Array<CollectionEntry<"products">>,
  absoluteUrl: (path: string) => string,
): Promise<BuildOrderResult> {
  const bySlug = new Map(products.map((p) => [p.data.slug, p]));

  const items: BuiltOrderItem[] = [];
  const shippingVolumes: BuiltOrder["shippingVolumes"] = [];
  // Compact SKU bag for downstream integrations (Bling, etc) — keeps the
  // canonical slug + variant info so we don't have to re-parse MP's
  // `additional_info.items[].id` (which has the slug embedded but mangled).
  const itemsSkus: Array<{
    slug: string;
    qty: number;
    title: string;
    unit_price_cents: number;
    size?: string;
    exercise?: string;
    plates?: Array<{ plateId: string; pairs: number }>;
    runningTimes?: Record<string, string>;
    boardColor?: "cobre" | "preto" | "rosa";
    boardBarbells?: Array<{
      exercise: string;
      plates: Array<{ plateId: string; pairs: number }>;
    }>;
    giftCardValueCents?: number;
    giftCardRecipientName?: string;
    giftCardRecipientEmail?: string;
    giftCardMessage?: string;
  }> = [];
  let subtotalCents = 0;
  /** Subtotal excluindo gift cards — base pra aplicar resgate de vale. */
  let subtotalExGiftCardsCents = 0;
  let allDigital = true;
  let anyDigital = false;

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
      const isGiftCard = product.data.configurator.isGiftCard;
      const isDigital = product.data.digital === true;
      subtotalCents += priced.lineTotalCents;
      if (!isGiftCard) subtotalExGiftCardsCents += priced.lineTotalCents;
      if (isDigital) anyDigital = true;
      else allDigital = false;
      items.push({
        id: `${input.productSlug}-${input.id.slice(0, 40)}`,
        title: priced.title,
        picture_url: absoluteUrl(priced.picture_url),
        quantity: input.quantity,
        unit_price: Math.round(priced.unitPriceCents) / 100,
      });
      itemsSkus.push({
        slug: input.productSlug,
        qty: input.quantity,
        title: priced.title,
        unit_price_cents: Math.round(priced.unitPriceCents),
        ...(input.size ? { size: input.size } : {}),
        ...(input.exercise ? { exercise: input.exercise } : {}),
        ...(input.plates && input.plates.length > 0
          ? { plates: input.plates }
          : {}),
        ...(input.runningTimes && Object.keys(input.runningTimes).length > 0
          ? { runningTimes: input.runningTimes as Record<string, string> }
          : {}),
        ...(input.boardColor ? { boardColor: input.boardColor } : {}),
        ...(input.boardBarbells && input.boardBarbells.length > 0
          ? { boardBarbells: input.boardBarbells }
          : {}),
        ...(input.giftCardValueCents
          ? { giftCardValueCents: input.giftCardValueCents }
          : {}),
        ...(input.giftCardRecipientName
          ? { giftCardRecipientName: input.giftCardRecipientName }
          : {}),
        ...(input.giftCardRecipientEmail
          ? { giftCardRecipientEmail: input.giftCardRecipientEmail }
          : {}),
        ...(input.giftCardMessage
          ? { giftCardMessage: input.giftCardMessage }
          : {}),
      });

      // Itens digitais não geram volumes pro Melhor Envio.
      if (!isDigital) {
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
  //
  // O campo `couponCode` aceita 2 tipos: cupom tradicional (JSON) OU
  // vale-presente (Supabase). Mutuamente exclusivos. Tenta cupom primeiro;
  // se a validação for `not_found`, cai pro lookup de gift card. Vale-
  // presente NÃO desconta gift cards do carrinho (não dá pra usar vale pra
  // comprar vale).
  let couponDiscountCents = 0;
  let couponCreditedTo: string | null = null;
  let couponInfo: BuiltOrder["coupon"] = null;
  let pickupLocation: PickupLocation | null = null;
  let giftCardApplied: BuiltOrder["giftCardApplied"] = null;

  if (data.couponCode && data.couponCode.length > 0) {
    const couponResult = validateCoupon(data.couponCode, subtotalCents);
    if (couponResult.ok) {
      couponDiscountCents = couponResult.discountCents;
      couponCreditedTo = couponResult.creditedTo;
      pickupLocation = couponResult.pickupLocation;
      if (couponDiscountCents > 0) {
        items.push({
          id: `coupon-${couponResult.coupon.code}`,
          title: `Cupom ${couponResult.coupon.code.toUpperCase()}${
            couponCreditedTo !== couponResult.coupon.code ? ` — ${couponCreditedTo}` : ""
          }`,
          picture_url: "",
          quantity: 1,
          unit_price: -(Math.round(couponDiscountCents) / 100),
        });
      }
      couponInfo = {
        code: couponResult.coupon.code,
        discountCents: couponDiscountCents,
        creditedTo: couponCreditedTo,
      };
    } else if (couponResult.error === "not_found") {
      // Tentar como vale-presente. Bloqueia uso quando carrinho tem
      // só gift card (subtotalExGiftCardsCents == 0 mas subtotal > 0).
      if (subtotalExGiftCardsCents <= 0 && subtotalCents > 0) {
        return {
          ok: false,
          status: 400,
          error: "Vale-presente não pode ser usado pra comprar outro vale.",
          field: "couponCode",
        };
      }
      const gc = await lookupGiftCard(data.couponCode);
      if (!gc) {
        return { ok: false, status: 400, error: "Cupom não encontrado.", field: "couponCode" };
      }
      if (gc.status === "cancelled") {
        return { ok: false, status: 400, error: "Vale-presente cancelado.", field: "couponCode" };
      }
      if (gc.status === "expired" || new Date(gc.expires_at).getTime() < Date.now()) {
        return { ok: false, status: 400, error: "Vale-presente expirado.", field: "couponCode" };
      }
      if (gc.status === "depleted" || gc.balance_cents <= 0) {
        return {
          ok: false,
          status: 400,
          error: "Esse vale-presente já foi usado integralmente.",
          field: "couponCode",
        };
      }
      const giftDiscount = Math.min(gc.balance_cents, subtotalExGiftCardsCents);
      if (giftDiscount > 0) {
        items.push({
          id: `gift-card-${gc.code}`,
          title: `Vale-Presente ${gc.code}`,
          picture_url: "",
          quantity: 1,
          unit_price: -(Math.round(giftDiscount) / 100),
        });
      }
      giftCardApplied = {
        cardId: gc.id,
        code: gc.code,
        discountCents: giftDiscount,
      };
      // Pra o cálculo subsequente (Pix), o desconto do vale entra como
      // se fosse desconto de cupom — sem stack com cupom (mutuamente
      // exclusivos), o nome interno aqui não importa.
      couponDiscountCents = giftDiscount;
    } else {
      return { ok: false, status: 400, error: couponResult.message, field: "couponCode" };
    }
  }

  // Pickup option (id=0) só pode ser usada com cupom que libera retirada
  // numa unidade. Qualquer outro caso é payload manipulado.
  const isPickup = data.shippingOption.id === 0;
  if (isPickup && !pickupLocation) {
    return {
      ok: false,
      status: 400,
      error: "Retirada presencial requer um cupom válido para essa unidade.",
      field: "couponCode",
    };
  }
  if (isPickup && data.shippingOption.price_cents !== 0) {
    return {
      ok: false,
      status: 400,
      error: "Retirada presencial não cobra frete.",
      field: "shippingOption",
    };
  }

  // Sentinela digital (id=-1): só vale quando o carrinho é 100% digital.
  // Carrinhos mistos (digital + físico) precisam de uma opção real do ME.
  const isDigitalShipping = data.shippingOption.id === -1;
  if (isDigitalShipping && !allDigital) {
    return {
      ok: false,
      status: 400,
      error: "Carrinho contém produtos físicos — escolha uma opção de frete.",
      field: "shippingOption",
    };
  }
  if (isDigitalShipping && data.shippingOption.price_cents !== 0) {
    return {
      ok: false,
      status: 400,
      error: "Entrega digital não cobra frete.",
      field: "shippingOption",
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

  const shippingServiceName = isPickup && pickupLocation
    ? `Retirada — ${pickupLocation.name}`
    : isDigitalShipping
      ? "Entrega digital — por e-mail"
      : `${data.shippingOption.company} · ${data.shippingOption.name}`;

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
    shipping_service_name: shippingServiceName,
    shipping_neighborhood: data.shipping.neighborhood,
    shipping_city: data.shipping.city,
    shipping_state: data.shipping.state,
    shipping_complement: data.shipping.complement ?? "",
    coupon_code: giftCardApplied ? "" : (data.couponCode?.toLowerCase() ?? ""),
    coupon_discount_cents: giftCardApplied ? 0 : couponDiscountCents,
    coupon_credited_to: giftCardApplied ? "" : (couponCreditedTo ?? ""),
    pix_discount_cents: pixDiscountCents,
    subtotal_cents: subtotalCents,
    freight_cents: freightCents,
    total_cents: totalCents,
    items_skus: JSON.stringify(itemsSkus),
    shipping_volumes: JSON.stringify(shippingVolumes),
    is_pickup: isPickup ? 1 : 0,
    is_digital: anyDigital ? 1 : 0,
    is_all_digital: allDigital ? 1 : 0,
    pickup_name: isPickup && pickupLocation ? pickupLocation.name : "",
    pickup_address: isPickup && pickupLocation
      ? `${pickupLocation.address_line} · ${pickupLocation.district}, ${pickupLocation.city}/${pickupLocation.state} · CEP ${pickupLocation.cep}`
      : "",
    gift_card_applied_id: giftCardApplied?.cardId ?? "",
    gift_card_applied_code: giftCardApplied?.code ?? "",
    gift_card_applied_discount_cents: giftCardApplied?.discountCents ?? 0,
  };

  return {
    ok: true,
    order: {
      items,
      totalCents,
      subtotalCents,
      coupon: couponInfo,
      giftCardApplied,
      pixDiscountCents,
      shippingVolumes,
      metadata,
    },
  };
}
