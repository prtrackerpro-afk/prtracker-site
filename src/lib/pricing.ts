/**
 * Server-side price recomputation. Never trust the client-sent price.
 *
 * Takes a cart item payload and the catalog (from Astro content collection),
 * returns the authoritative unit price in cents — or throws if the item
 * configuration is invalid (unknown product, over max pairs, exceeds physical
 * space, etc.).
 */

import type { CollectionEntry } from "astro:content";
import {
  PLATES,
  MAX_SIDE_SPACE_MM,
  BARBELL_WEIGHT_KG,
  type PlateId,
} from "./catalog";
import type { CartItem } from "./cart-types";

const platesById = new Map(PLATES.map((p) => [p.id, p]));

export interface Priced {
  /** Authoritative unit price in cents. */
  unitPriceCents: number;
  /** Authoritative line total in cents (unit * quantity). */
  lineTotalCents: number;
  /** Display title to show at MP checkout AND in the order confirmation
   *  email. Includes exercise + plate summary + total weight so it's clear
   *  to the shop owner exactly what to assemble.
   *  Example:
   *    "My PR Set — Back Squat · 120 kg (2× 25 kg + 1× 10 kg)"
   *    "Camiseta Masculina — Tam. M"
   */
  title: string;
  /** Product image for the preference item. */
  picture_url: string;
}

/** Build "2× 25 kg + 1× 10 kg"-style summary of the plate selection. */
function describePlates(
  plates: Array<{ plateId: string; pairs: number }>,
): string {
  return plates
    .slice()
    .sort((a, b) => {
      const ka = platesById.get(a.plateId as PlateId)?.kg ?? 0;
      const kb = platesById.get(b.plateId as PlateId)?.kg ?? 0;
      return kb - ka;
    })
    .filter((p) => p.pairs > 0)
    .map((p) => {
      const plate = platesById.get(p.plateId as PlateId);
      return plate ? `${p.pairs}× ${plate.label}` : `${p.pairs}× ?`;
    })
    .join(" + ");
}

/** Total weight = barbell + all plates (2 sides). Anilhas-only skips bar. */
function totalWeightKg(
  plates: Array<{ plateId: string; pairs: number }>,
  includeBarbell: boolean,
): number {
  let kg = includeBarbell ? BARBELL_WEIGHT_KG : 0;
  for (const p of plates) {
    const plate = platesById.get(p.plateId as PlateId);
    if (!plate) continue;
    kg += plate.kg * 2 * p.pairs;
  }
  return kg;
}

function formatKg(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const str = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(".", ",");
  return `${str} kg`;
}

export function recomputeLine(
  input: CartItem,
  product: CollectionEntry<"products">,
): Priced {
  const { configurator, priceBase, images, sizes, title } = product.data;

  if (!images[0]) throw new Error(`Product ${product.data.slug} has no images`);
  const picture_url = images[0].src;

  if (configurator.enabled) {
    const plates = input.plates ?? [];
    const platesCents = sumPlatesCents(plates);
    const spaceUsed = sumPlatesSpace(plates);

    if (spaceUsed > MAX_SIDE_SPACE_MM) {
      throw new Error(`Espaço físico excedido (${spaceUsed}mm > ${MAX_SIDE_SPACE_MM}mm)`);
    }
    if (configurator.isAnilhasOnly && platesCents === 0) {
      throw new Error("Anilhas-only: selecione ao menos um par de anilhas");
    }
    if (configurator.hasExerciseSelector && !input.exercise) {
      throw new Error(`${title}: selecione um exercício antes de finalizar.`);
    }

    const base = configurator.isAnilhasOnly ? 0 : priceBase;
    const unit = base + platesCents;

    // Build an informative title that a human reader (owner email) can
    // parse at a glance: exercise + total weight + plate breakdown.
    const parts: string[] = [title];
    if (input.exercise) parts[0] += ` — ${input.exercise}`;

    const platesDesc = describePlates(plates);
    const weight = totalWeightKg(plates, !configurator.isAnilhasOnly);
    const detailBits: string[] = [];
    if (!configurator.isAnilhasOnly && weight > 0) {
      detailBits.push(formatKg(weight));
    }
    if (platesDesc) {
      // For anilhas-only, the plate list IS the product; for sets it's the
      // configuration detail in parens.
      detailBits.push(configurator.isAnilhasOnly ? platesDesc : `(${platesDesc})`);
    }
    if (detailBits.length > 0) {
      parts.push(detailBits.join(" "));
    }

    const lineTitle = parts.join(" · ");
    return { unitPriceCents: unit, lineTotalCents: unit * input.quantity, title: lineTitle, picture_url };
  }

  if (sizes.length > 0 && (!input.size || !sizes.includes(input.size))) {
    throw new Error(`Tamanho inválido para ${title}: ${input.size ?? "(vazio)"}`);
  }
  const lineTitle = input.size ? `${title} — Tam. ${input.size}` : title;
  return {
    unitPriceCents: priceBase,
    lineTotalCents: priceBase * input.quantity,
    title: lineTitle,
    picture_url,
  };
}

function sumPlatesCents(
  selected: Array<{ plateId: string; pairs: number }>,
): number {
  let total = 0;
  for (const s of selected) {
    const plate = platesById.get(s.plateId as PlateId);
    if (!plate) throw new Error(`Anilha desconhecida: ${s.plateId}`);
    const pairs = Math.floor(s.pairs);
    if (pairs < 0 || pairs > plate.maxPairs) {
      throw new Error(`Pares fora do limite para ${plate.label}: ${pairs} (max ${plate.maxPairs})`);
    }
    total += pairs * plate.pricePerPairCents;
  }
  return total;
}

function sumPlatesSpace(
  selected: Array<{ plateId: string; pairs: number }>,
): number {
  let mm = 0;
  for (const s of selected) {
    const plate = platesById.get(s.plateId as PlateId);
    if (!plate) continue;
    mm += Math.floor(s.pairs) * plate.thicknessMm;
  }
  return mm;
}
