/**
 * Formatting helpers. Prices stored as integer cents everywhere —
 * never do floating math on BRL values in JS.
 */

import { PIX_DISCOUNT } from "./catalog";

/** Convert integer cents to a formatted BRL string (e.g. 14990 -> "R$ 149,90"). */
export function formatBRL(cents: number): string {
  const reais = cents / 100;
  return reais.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Format a number as kg ("120 kg", "2.5 kg"). */
export function formatKg(kg: number): string {
  const rounded = Math.round(kg * 100) / 100;
  const formatted = Number.isInteger(rounded)
    ? rounded.toString()
    : rounded.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return `${formatted} kg`;
}

/** Compute the Pix price in cents, rounded to nearest cent (banker-safe). */
export function applyPix(cents: number): number {
  return Math.round(cents * (1 - PIX_DISCOUNT));
}

/** Convert integer cents to a plain number of reais (for schema.org Offer.price). */
export function centsToReaisString(cents: number): string {
  return (cents / 100).toFixed(2);
}
