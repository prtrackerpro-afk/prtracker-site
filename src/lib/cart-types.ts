/**
 * Shared cart types. The actual store lives in `src/scripts/cart.ts`
 * (client-side only — uses localStorage).
 */

import type { PlateId } from "./catalog";

export interface PlateSelection {
  /** Plate id. */
  plateId: PlateId;
  /** Number of pairs (not individual plates). */
  pairs: number;
}

export interface CartItem {
  /** Stable id — hash of product slug + config so repeats merge into one line. */
  id: string;
  /** Product slug. */
  productSlug: string;
  /** Display title of the item (includes variant info when relevant). */
  title: string;
  /** Image src for the cart drawer thumbnail. */
  image: string;
  /** Unit price in cents (base + config surcharges). */
  unitPriceCents: number;
  /** Quantity. Always >= 1. */
  quantity: number;
  /** Plate selections if the product has a configurator. */
  plates?: PlateSelection[];
  /** Exercise name for My PR Set. */
  exercise?: string;
  /** T-shirt size for camisetas. */
  size?: string;
}

export interface CartSnapshot {
  items: CartItem[];
  /** Computed at read-time. */
  subtotalCents: number;
  pixTotalCents: number;
  itemCount: number;
}
