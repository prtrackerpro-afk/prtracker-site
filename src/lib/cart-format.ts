/**
 * Shared formatters for rendering cart items in the drawer, /cart, and /checkout.
 * Keeping these here avoids drift (e.g. "Tam." vs "T." across pages) and fixes
 * the missing apostrophe escape that previously existed in checkout.astro.
 */

import { BARBELL_WEIGHT_KG, plateById } from "./catalog";
import type { CartItem } from "./cart-types";

/**
 * Total represented weight (barbell + plates) in kg, for items that model a
 * lift. Returns 0 when plates are absent or zero, or for standalone anilhas
 * (no barbell involved — customer is adding to an existing set they already
 * own).
 */
export function totalRepresentedKg(item: CartItem): number {
  if (!item.plates?.length) return 0;
  const platesKg = item.plates.reduce(
    (sum, p) => sum + plateById(p.plateId).kg * p.pairs * 2,
    0,
  );
  if (platesKg === 0) return 0;
  const includesBarbell = item.productSlug !== "anilhas";
  return platesKg + (includesBarbell ? BARBELL_WEIGHT_KG : 0);
}

/** Pretty-print a kg value dropping trailing ".00". */
function formatKg(kg: number): string {
  return Number.isInteger(kg)
    ? `${kg} kg`
    : `${kg.toFixed(2).replace(/\.?0+$/, "")} kg`;
}

/** Human-readable one-liner for a cart item's configuration. */
export function formatCartItemConfig(item: CartItem): string {
  const parts: string[] = [];
  const totalKg = totalRepresentedKg(item);
  if (totalKg > 0) parts.push(`Total ${formatKg(totalKg)}`);
  if (item.plates?.length) {
    const plateStr = item.plates
      .filter((p) => p.pairs > 0)
      .map((p) => `${p.pairs * 2}× ${p.plateId.replace("_", ".")} kg`)
      .join(" · ");
    if (plateStr) parts.push(plateStr);
  }
  if (item.exercise) parts.push(item.exercise);
  if (item.size) parts.push(`Tam. ${item.size}`);
  return parts.join(" · ");
}

/** HTML-escape user-controlled strings before interpolating into innerHTML. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
