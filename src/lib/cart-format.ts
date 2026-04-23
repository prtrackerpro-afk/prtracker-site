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

/** Structured display fields for a cart line — title suffix + sub lines. */
export interface CartItemDisplay {
  /** Append to title (e.g. " — 120 kg"). Empty when item has no barbell/plates. */
  titleSuffix: string;
  /** Lines to render below the title, each on its own line. */
  subLines: string[];
}

/**
 * Build the display fields for a cart item:
 *
 *   Power Rack Set — 120 kg
 *   Anilhas:
 *   25 kg — 2 pares
 *   Back Squat
 *   Tam. M
 */
export function formatCartItemDisplay(item: CartItem): CartItemDisplay {
  const subLines: string[] = [];
  const totalKg = totalRepresentedKg(item);
  const titleSuffix = totalKg > 0 ? ` — ${formatKg(totalKg)}` : "";

  const activePlates = (item.plates ?? []).filter((p) => p.pairs > 0);
  if (activePlates.length > 0) {
    subLines.push("Anilhas:");
    for (const p of activePlates) {
      const kg = p.plateId.replace("_", ".");
      const pares = p.pairs === 1 ? "par" : "pares";
      subLines.push(`${kg} kg — ${p.pairs} ${pares}`);
    }
  }
  if (item.exercise) subLines.push(item.exercise);
  if (item.size) subLines.push(`Tam. ${item.size}`);

  return { titleSuffix, subLines };
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
