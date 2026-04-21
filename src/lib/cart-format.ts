/**
 * Shared formatters for rendering cart items in the drawer, /cart, and /checkout.
 * Keeping these here avoids drift (e.g. "Tam." vs "T." across pages) and fixes
 * the missing apostrophe escape that previously existed in checkout.astro.
 */

import type { CartItem } from "./cart-types";

/** Human-readable one-liner for a cart item's configuration. */
export function formatCartItemConfig(item: CartItem): string {
  const parts: string[] = [];
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
