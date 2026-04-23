/**
 * Shared coupon validation logic — used by `/api/validate-coupon` (real-time
 * UX feedback when the customer pastes a code) and by `/api/create-preference`
 * (the server-authoritative check that actually applies the discount to the
 * MP order).
 */
import couponsData from "~/data/coupons.json";

export interface Coupon {
  code: string;
  discount_type: "percent" | "fixed_cart" | "fixed_product";
  amount: number;
  date_expires: string | null;
  usage_count: number;
  usage_limit: number | null;
  usage_limit_per_user: number | null;
  individual_use: boolean;
  free_shipping: boolean;
  minimum_amount_cents: number;
  maximum_amount_cents: number;
  product_ids: number[];
  excluded_product_ids: number[];
  product_categories: number[];
  excluded_product_categories: number[];
  exclude_sale_items: boolean;
  first_order_only: boolean;
  affiliate: { id: number; name?: string; slug?: string | null } | null;
}

const COUPONS: Coupon[] = (couponsData as { coupons: Coupon[] }).coupons;

export function findCoupon(code: string): Coupon | null {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return null;
  return COUPONS.find((c) => c.code === normalized) ?? null;
}

export type CouponError =
  | "not_found"
  | "expired"
  | "limit_reached"
  | "below_minimum"
  | "above_maximum";

export interface CouponValidation {
  ok: true;
  coupon: Coupon;
  discountCents: number;
  /** True when this coupon also grants free shipping (caller handles). */
  freeShipping: boolean;
  /** Display name: affiliate attribution or the brand itself. */
  creditedTo: string;
}
export interface CouponRejection {
  ok: false;
  error: CouponError;
  message: string;
}

/**
 * Validate a code against the current cart subtotal (in cents). Doesn't
 * mutate anything — returns a decision. The caller applies the discount.
 *
 * The `subtotalCents` arg should be the PRODUCT subtotal only, excluding
 * shipping, so percentage discounts land on the merch total (same as WC).
 */
export function validateCoupon(
  code: string,
  subtotalCents: number,
): CouponValidation | CouponRejection {
  const coupon = findCoupon(code);
  if (!coupon) {
    return { ok: false, error: "not_found", message: "Cupom não encontrado." };
  }

  if (coupon.date_expires) {
    const expiresAt = new Date(coupon.date_expires).getTime();
    if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
      return {
        ok: false,
        error: "expired",
        message: "Cupom expirado.",
      };
    }
  }

  if (
    coupon.usage_limit != null &&
    coupon.usage_count >= coupon.usage_limit
  ) {
    return {
      ok: false,
      error: "limit_reached",
      message: "Cupom atingiu o limite de usos.",
    };
  }

  if (
    coupon.minimum_amount_cents > 0 &&
    subtotalCents < coupon.minimum_amount_cents
  ) {
    const brl = (coupon.minimum_amount_cents / 100).toFixed(2).replace(".", ",");
    return {
      ok: false,
      error: "below_minimum",
      message: `Valor mínimo para este cupom: R$ ${brl}.`,
    };
  }

  if (
    coupon.maximum_amount_cents > 0 &&
    subtotalCents > coupon.maximum_amount_cents
  ) {
    const brl = (coupon.maximum_amount_cents / 100).toFixed(2).replace(".", ",");
    return {
      ok: false,
      error: "above_maximum",
      message: `Valor máximo para este cupom: R$ ${brl}.`,
    };
  }

  // Compute discount in cents. We treat fixed_product the same as fixed_cart
  // for the MVP since our product catalog is small and every coupon in the
  // imported data is either percent or fixed_cart — can refine later if a
  // per-product restriction becomes common.
  let discountCents: number;
  if (coupon.discount_type === "percent") {
    discountCents = Math.round((subtotalCents * coupon.amount) / 100);
  } else {
    discountCents = Math.round(coupon.amount * 100);
  }
  // Never discount more than the subtotal (avoids negative total).
  discountCents = Math.min(discountCents, subtotalCents);

  const creditedTo =
    coupon.affiliate?.name && !coupon.affiliate.name.startsWith("User ")
      ? coupon.affiliate.name
      : coupon.code;

  return {
    ok: true,
    coupon,
    discountCents,
    freeShipping: coupon.free_shipping,
    creditedTo,
  };
}
