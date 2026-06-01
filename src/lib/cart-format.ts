/**
 * Shared formatters for rendering cart items in the drawer, /cart, and /checkout.
 * Keeping these here avoids drift (e.g. "Tam." vs "T." across pages) and fixes
 * the missing apostrophe escape that previously existed in checkout.astro.
 */

import { BARBELL_WEIGHT_KG, plateById, BOARD_COLORS, RUN_DISTANCES } from "./catalog";
import type { CartItem, PlateSelection } from "./cart-types";

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

  // PR Tracker Board: cor + barras com exercício e anilhas
  if (item.boardBarbells && item.boardBarbells.length > 0) {
    if (item.boardColor) {
      const color = BOARD_COLORS.find((c) => c.value === item.boardColor);
      subLines.push(`Cor: ${color?.label ?? item.boardColor}`);
    }
    for (const bb of item.boardBarbells) {
      const platesDesc = describePlatesInline(bb.plates);
      subLines.push(platesDesc ? `${bb.exercise} — ${platesDesc}` : bb.exercise);
    }
    return { titleSuffix: "", subLines };
  }

  // Meus RPs: tempos por distância
  if (item.runningTimes && Object.keys(item.runningTimes).length > 0) {
    for (const dist of RUN_DISTANCES) {
      const t = item.runningTimes[dist.key];
      if (t) subLines.push(`${dist.label} — ${t}`);
    }
    if (subLines.length === 0) subLines.push("Sem tempos cadastrados");
    return { titleSuffix: "", subLines };
  }

  // Plaquinha avulsa Meus RPs: lista de 1-4 plaquinhas (distância + tempo).
  // Duplicatas são permitidas (ex: 5km × 2), então iteramos pela ordem de
  // entrada sem deduplicar.
  if (item.runningPlates && item.runningPlates.length > 0) {
    for (const p of item.runningPlates) {
      const dist = RUN_DISTANCES.find((d) => d.key === p.distance);
      subLines.push(`${dist?.label ?? p.distance} — ${p.time}`);
    }
    const suffix = item.runningPlates.length === 1 ? "" : ` — ${item.runningPlates.length} plaquinhas`;
    return { titleSuffix: suffix, subLines };
  }

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

function describePlatesInline(plates: PlateSelection[]): string {
  const active = plates.filter((p) => p.pairs > 0);
  if (active.length === 0) return "";
  return active
    .map((p) => {
      const kg = p.plateId.replace("_", ".");
      return `${p.pairs}× ${kg}kg`;
    })
    .join(", ");
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
