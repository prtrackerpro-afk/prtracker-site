/**
 * SKU map: site product slug (+ variant) → Bling código + display name + NCM.
 *
 * Canonical Bling SKUs (alinhadas com sync-marketplace-skus.ts em mai/2026):
 *   deadlift-set                   → DEADLIFT-SET
 *   bench-press-set                → BENCH-SET
 *   power-rack-set                 → POWER-SET
 *   my-pr-set                      → MYPR-SET
 *   camiseta-masculina + size      → TEE-MASC-{P|M|G|GG}
 *   camiseta-feminina-baby-look + size → TEE-BABY-{P|M|G|GG}
 *   anilhas + plates[]             → expandido em ANILHA-{plateId} por par
 *
 * Os kits-base do site são "Monte sua barra" — sem peso pré-fixo. Bundles
 * com peso fixo (TT-BENCH-120, TT-DEAD-200, etc.) são SKUs separadas só
 * usadas em marketplace (ver sync-marketplace-skus.ts).
 *
 * `getOrCreateProduct` in Bling will create products on first encounter
 * with the metadata defined here (NCM, peso, etc).
 */

import { PLATES } from "~/lib/catalog";

export interface SkuLine {
  /** Bling código (SKU). */
  codigo: string;
  /** Display name (used as Bling produto.nome on first creation). */
  nome: string;
  /** Quantity. */
  qty: number;
  /** Unit price in BRL (decimals, e.g. 119.90). */
  unitPrice: number;
  /** NCM for tax classification. */
  ncm: string;
  /** Peso em kg (informativo, ajuda no frete automático). */
  pesoKg?: number;
}

const NCM_KIT = "39264000"; // estatuetas plástico — same as the company default
const NCM_TEE = "61091000"; // T-shirt de algodão (a confirmar com contador)
const NCM_ANILHA = "39264000"; // mesma classificação dos kits

export interface ItemSku {
  slug: string;
  qty: number;
  title: string;
  unit_price_cents: number;
  size?: string;
  exercise?: string;
  plates?: Array<{ plateId: string; pairs: number }>;
}

/**
 * Expand a single cart line into one or more Bling line items.
 *
 * Most items are 1:1. Exception: anilhas avulsas (slug='anilhas') is one
 * cart line that can contain multiple plate weights — Bling tracks each
 * weight as a separate SKU, so we explode into N lines.
 */
export function explodeLineToBling(item: ItemSku): SkuLine[] {
  switch (item.slug) {
    case "deadlift-set":
      return [
        {
          codigo: "DEADLIFT-SET",
          nome: "Deadlift Set — PR Tracker",
          qty: item.qty,
          unitPrice: item.unit_price_cents / 100,
          ncm: NCM_KIT,
        },
      ];
    case "bench-press-set":
      return [
        {
          codigo: "BENCH-SET",
          nome: "Bench Press Set — PR Tracker",
          qty: item.qty,
          unitPrice: item.unit_price_cents / 100,
          ncm: NCM_KIT,
        },
      ];
    case "power-rack-set":
      return [
        {
          codigo: "POWER-SET",
          nome: "Power Rack Set — PR Tracker",
          qty: item.qty,
          unitPrice: item.unit_price_cents / 100,
          ncm: NCM_KIT,
        },
      ];
    case "my-pr-set": {
      const exerciseSuffix = item.exercise ? ` (${item.exercise})` : "";
      return [
        {
          codigo: "MYPR-SET",
          nome: `My PR Set — PR Tracker${exerciseSuffix}`,
          qty: item.qty,
          unitPrice: item.unit_price_cents / 100,
          ncm: NCM_KIT,
        },
      ];
    }
    case "camiseta-masculina": {
      const size = (item.size ?? "").toUpperCase() || "UN";
      return [
        {
          codigo: `TEE-MASC-${size}`,
          nome: `Camiseta Masculina — PR Tracker — Tam ${size}`,
          qty: item.qty,
          unitPrice: item.unit_price_cents / 100,
          ncm: NCM_TEE,
        },
      ];
    }
    case "camiseta-feminina-baby-look": {
      const size = (item.size ?? "").toUpperCase() || "UN";
      return [
        {
          codigo: `TEE-BABY-${size}`,
          nome: `Camiseta Baby Look — PR Tracker — Tam ${size}`,
          qty: item.qty,
          unitPrice: item.unit_price_cents / 100,
          ncm: NCM_TEE,
        },
      ];
    }
    case "anilhas": {
      // Explode each plate selection into its own Bling line. The MP cart
      // line had a single unit_price representing the sum of all plate
      // pairs * pricePerPair, so we re-derive per-plate prices from the
      // catalog (canonical source). Sum should match within rounding.
      const out: SkuLine[] = [];
      for (const sel of item.plates ?? []) {
        if (sel.pairs <= 0) continue;
        const spec = PLATES.find((p) => p.id === sel.plateId);
        if (!spec) continue;
        const pretty = spec.label; // e.g. "25 kg"
        out.push({
          codigo: `ANILHA-${spec.id.replace("_", ".")}`, // "2_5" → "2.5"
          nome: `Anilha ${pretty} (par) — PR Tracker`,
          qty: sel.pairs * item.qty,
          unitPrice: spec.pricePerPairCents / 100,
          ncm: NCM_ANILHA,
        });
      }
      // Defensive fallback: if no plates were captured (shouldn't happen,
      // checkout requires at least 1), keep the order from breaking by
      // sending one generic line.
      if (out.length === 0) {
        out.push({
          codigo: "ANILHA-MIX",
          nome: "Anilhas Avulsas — PR Tracker",
          qty: item.qty,
          unitPrice: item.unit_price_cents / 100,
          ncm: NCM_ANILHA,
        });
      }
      return out;
    }
    default: {
      // Unknown slug: still create something so the order goes through;
      // log + flag for cleanup. Códigos limited to 30 chars (Bling rule).
      const fallbackCode = item.slug
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, "-")
        .slice(0, 30);
      return [
        {
          codigo: fallbackCode,
          nome: item.title || fallbackCode,
          qty: item.qty,
          unitPrice: item.unit_price_cents / 100,
          ncm: NCM_KIT,
        },
      ];
    }
  }
}
