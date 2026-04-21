/**
 * Server-side price recomputation. Never trust the client-sent price.
 *
 * Takes a cart item payload and the catalog (from Astro content collection),
 * returns the authoritative unit price in cents — or throws if the item
 * configuration is invalid (unknown product, over max pairs, exceeds physical
 * space, etc.).
 */

import type { CollectionEntry } from "astro:content";
import { PLATES, MAX_SIDE_SPACE_MM, type PlateId } from "./catalog";
import type { CartItem } from "./cart-types";

const platesById = new Map(PLATES.map((p) => [p.id, p]));

export interface Priced {
  /** Authoritative unit price in cents. */
  unitPriceCents: number;
  /** Authoritative line total in cents (unit * quantity). */
  lineTotalCents: number;
  /** Display title to show at MP checkout. */
  title: string;
  /** Product image for the preference item. */
  picture_url: string;
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

    const base = configurator.isAnilhasOnly ? 0 : priceBase;
    const unit = base + platesCents;
    const lineTitle = input.exercise ? `${title} — ${input.exercise}` : title;
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
