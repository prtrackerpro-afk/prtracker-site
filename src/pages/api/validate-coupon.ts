/**
 * Real-time coupon validation for the checkout UI. The server-authoritative
 * check also runs inside `/api/create-preference`, so even if someone
 * calls this endpoint directly and gets a fake "ok", the actual order
 * creation re-validates.
 *
 * This endpoint exists purely so the customer sees "✓ R$ 15,00 OFF
 * aplicado" (or an error) the moment they paste a code, without having
 * to submit the whole checkout form.
 */
import type { APIRoute } from "astro";
import { z } from "astro:content";
import { recomputeLine } from "~/lib/pricing";
import { getCollection } from "astro:content";
import { validateCoupon } from "~/lib/coupons";
import { previewGiftCardDiscount } from "~/lib/gift-cards";
import { cartItemSchema } from "~/lib/order-build";

export const prerender = false;

const payloadSchema = z.object({
  code: z.string().trim().min(1).max(60),
  items: z.array(cartItemSchema).min(1).max(20),
});

function jsonResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "JSON inválido." });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(400, { error: "Payload inválido." });
  }

  // Recompute the subtotal the same way /api/create-preference does.
  // Vale-presente NÃO conta no subtotal pra fins de aplicar outro
  // vale-presente — não daria pra usar vale pra comprar vale.
  const products = await getCollection("products");
  const bySlug = new Map(products.map((p) => [p.data.slug, p]));

  let subtotalCents = 0;
  let subtotalExGiftCardsCents = 0;
  for (const input of parsed.data.items) {
    const product = bySlug.get(input.productSlug);
    if (!product) continue;
    try {
      const line = recomputeLine(input, product).lineTotalCents;
      subtotalCents += line;
      if (!product.data.configurator.isGiftCard) {
        subtotalExGiftCardsCents += line;
      }
    } catch {
      // Ignore invalid lines for this preview; /create-preference will
      // reject them at submit time with a clear error.
    }
  }

  // Tenta cupom primeiro. Se não acha, cai pro gift card (Supabase).
  const couponResult = validateCoupon(parsed.data.code, subtotalCents);
  if (couponResult.ok) {
    return jsonResponse(200, {
      ok: true,
      type: "coupon",
      code: couponResult.coupon.code,
      discountCents: couponResult.discountCents,
      discountType: couponResult.coupon.discount_type,
      amount: couponResult.coupon.amount,
      creditedTo: couponResult.creditedTo,
      freeShipping: couponResult.freeShipping,
      pickupLocation: couponResult.pickupLocation,
    });
  }

  // Se o erro do cupom NÃO foi "not_found" (ex: expirado, mínimo não
  // atingido), retorna ele direto — não cair pro gift card faz sentido
  // pra esses casos.
  if (couponResult.error !== "not_found") {
    return jsonResponse(200, { ok: false, error: couponResult.message });
  }

  // Lookup do gift card. Bloqueia uso de vale quando o carrinho tem
  // gift card sendo comprado (não daria pra usar vale pra comprar vale).
  if (subtotalExGiftCardsCents <= 0 && subtotalCents > 0) {
    return jsonResponse(200, {
      ok: false,
      error: "Vale-presente não pode ser usado pra comprar outro vale.",
    });
  }
  const giftResult = await previewGiftCardDiscount(
    parsed.data.code,
    subtotalExGiftCardsCents,
  );
  if (!giftResult.ok) {
    return jsonResponse(200, { ok: false, error: giftResult.message });
  }
  return jsonResponse(200, {
    ok: true,
    type: "gift_card",
    code: giftResult.card.code,
    discountCents: giftResult.discountCents,
    balanceCents: giftResult.card.balance_cents,
    valueCents: giftResult.card.value_cents,
    expiresAt: giftResult.card.expires_at,
    creditedTo: "Vale-Presente",
    freeShipping: false,
    pickupLocation: null,
  });
};
