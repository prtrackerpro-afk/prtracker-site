/**
 * Shared cart types. The actual store lives in `src/scripts/cart.ts`
 * (client-side only — uses localStorage).
 */

import type { PlateId, BoardColor, RunDistanceKey } from "./catalog";

export interface PlateSelection {
  /** Plate id. */
  plateId: PlateId;
  /** Number of pairs (not individual plates). */
  pairs: number;
}

/** Uma barra do PR Tracker Board (2 ou 3 por produto). */
export interface BoardBarbell {
  /** Exercício escolhido (valor canônico EN — ver BOARD_EXERCISES). */
  exercise: string;
  /** Anilhas selecionadas dessa barra. */
  plates: PlateSelection[];
}

/** Tempos do Meus RPs. Cada chave omitida (ou vazia) vira cadeado no produto. */
export type RunningTimes = Partial<Record<RunDistanceKey, string>>;

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
  /** Tempos digitados pelo cliente (Meus RPs). */
  runningTimes?: RunningTimes;
  /** Cor da placa (PR Tracker Board). */
  boardColor?: BoardColor;
  /** Barras configuradas no Board (2 ou 3, top→bottom). */
  boardBarbells?: BoardBarbell[];
}

export interface CartSnapshot {
  items: CartItem[];
  /** Computed at read-time. */
  subtotalCents: number;
  pixTotalCents: number;
  itemCount: number;
}
