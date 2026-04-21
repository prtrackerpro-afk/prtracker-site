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
  const { configurator, priceBase, images, sizes } = product.data;

  if (!images[0]) throw new Error(`Product ${product.data.slug} has no images`);
  const picture_url = images[0].src;

  // Validate configured items
  if (configurator.enabled) {
    if (configurator.isAnilhasOnly) {
      // Anilhas-only: no base price, at least one plate pair required.
      const platesCents = sumPlatesCents(input.plates ?? []);
      if (platesCents === 0) throw new Error("Anilhas-only: selecione ao menos um par de anilhas");
      const spaceUsed = sumPlatesSpace(input.plates ?? []);
      if (spaceUsed > MAX_SIDE_SPACE_MM) {
        throw new Error(`Espaço físico excedido (${spaceUsed}mm > ${MAX_SIDE_SPACE_MM}mm)`);
      }
      const unit = platesCents;
      return {
        unitPriceCents: unit,
        lineTotalCents: unit * input.quantity,
        title: product.data.title,
        picture_url,
      };
    }

    // PR Tracker set with configurator
    const platesCents = sumPlatesCents(input.plates ?? []);
    const spaceUsed = sumPlatesSpace(input.plates ?? []);
    if (spaceUsed > MAX_SIDE_SPACE_MM) {
      throw new Error(`Espaço físico excedido (${spaceUsed}mm > ${MAX_SIDE_SPACE_MM}mm)`);
    }
    const unit = priceBase + platesCents;
    const title = input.exercise
      ? `${product.data.title} — ${input.exercise}`
      : product.data.title;
    return {
      unitPriceCents: unit,
      lineTotalCents: unit * input.quantity,
      title,
      picture_url,
    };
  }

  // Simple product (e.g., camiseta)
  if (sizes.length > 0) {
    if (!input.size || !sizes.includes(input.size)) {
      throw new Error(`Tamanho inválido para ${product.data.title}: ${input.size ?? "(vazio)"}`);
    }
  }
  const title = input.size ? `${product.data.title} — Tam. ${input.size}` : product.data.title;
  return {
    unitPriceCents: priceBase,
    lineTotalCents: priceBase * input.quantity,
    title,
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
