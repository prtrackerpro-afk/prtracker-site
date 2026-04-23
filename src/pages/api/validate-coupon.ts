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

export const prerender = false;

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
  const products = await getCollection("products");
  const bySlug = new Map(products.map((p) => [p.data.slug, p]));

  let subtotalCents = 0;
  for (const input of parsed.data.items) {
    const product = bySlug.get(input.productSlug);
    if (!product) continue;
    try {
      subtotalCents += recomputeLine(input, product).lineTotalCents;
    } catch {
      // Ignore invalid lines for this preview; /create-preference will
      // reject them at submit time with a clear error.
    }
  }

  const result = validateCoupon(parsed.data.code, subtotalCents);
  if (!result.ok) {
    return jsonResponse(200, { ok: false, error: result.message });
  }

  return jsonResponse(200, {
    ok: true,
    code: result.coupon.code,
    discountCents: result.discountCents,
    discountType: result.coupon.discount_type,
    amount: result.coupon.amount,
    creditedTo: result.creditedTo,
    freeShipping: result.freeShipping,
  });
};
