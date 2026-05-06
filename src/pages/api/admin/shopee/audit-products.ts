/**
 * GET /api/admin/shopee/audit-products
 *
 * Lista todos os items ativos no shop Shopee, classifica `item_sku` /
 * `model_sku` (SKU canonical) vs canonical Bling, e reporta inconsistências.
 * Read-only.
 *
 * UI consome em /admin/shopee.
 *
 * Auth: admin middleware. Shopee deve estar conectado (OAuth).
 */

import type { APIRoute } from "astro";
import { isConnected } from "~/lib/shopee/oauth";
import { listAllItems, type ShopeeItem } from "~/lib/shopee/products";

export const prerender = false;

// SKUs canônicas esperadas em listings Shopee.
// Sincronizar com sync-marketplace-skus.ts. Bundles SP-* são criados
// on-demand quando primeira venda chegar.
const EXPECTED_CANONICAL_SKUS = new Set<string>([
  // Cross-channel (mesmo produto site/marketplace)
  "TEE-MASC-P", "TEE-MASC-M", "TEE-MASC-G", "TEE-MASC-GG",
  "TEE-BABY-P", "TEE-BABY-M", "TEE-BABY-G",
  "ANILHA-25", "ANILHA-20", "ANILHA-15", "ANILHA-10",
  "ANILHA-5", "ANILHA-2.5", "ANILHA-1.25",
  "ANILHA-MIX",
  // SP-* bundles (futuro — adicionar à medida que catálogo Shopee expandir).
]);

type AuditCategory = "canonical" | "non-canonical" | "no-sku" | "duplicate-sku";

interface AuditedSku {
  level: "item" | "model";
  id: number;
  seller_sku: string | null;
  category: AuditCategory;
  notes: string[];
}

interface AuditedItem {
  item_id: number;
  item_name: string;
  item_status: string;
  item_sku: string | null;
  category: AuditCategory;
  models: AuditedSku[];
  has_issue: boolean;
}

function classifySku(
  sku: string | null | undefined,
  duplicateMap: Map<string, number>,
): AuditCategory {
  if (!sku) return "no-sku";
  if ((duplicateMap.get(sku) ?? 0) > 1) return "duplicate-sku";
  if (EXPECTED_CANONICAL_SKUS.has(sku)) return "canonical";
  return "non-canonical";
}

export const GET: APIRoute = async () => {
  if (!(await isConnected())) {
    return new Response(
      JSON.stringify({ error: "shopee not connected" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const items = await listAllItems(["NORMAL"]);

    // Mapeia SKUs duplicadas
    const skuCount = new Map<string, number>();
    for (const it of items) {
      if (it.item_sku) {
        skuCount.set(it.item_sku, (skuCount.get(it.item_sku) ?? 0) + 1);
      }
      for (const m of it.models ?? []) {
        if (m.model_sku) {
          skuCount.set(m.model_sku, (skuCount.get(m.model_sku) ?? 0) + 1);
        }
      }
    }

    const audited: AuditedItem[] = items.map((it: ShopeeItem) => {
      const itemCategory = classifySku(it.item_sku, skuCount);
      const itemNotes: string[] = [];
      if (itemCategory === "no-sku") itemNotes.push("item_sku vazio");
      if (itemCategory === "non-canonical") itemNotes.push("SKU fora do mapeamento canônico");
      if (itemCategory === "duplicate-sku")
        itemNotes.push(`SKU '${it.item_sku}' usada em múltiplos items`);

      const models: AuditedSku[] = (it.models ?? []).map((m) => {
        const cat = classifySku(m.model_sku, skuCount);
        const notes: string[] = [];
        if (cat === "no-sku") notes.push("model_sku vazio");
        if (cat === "non-canonical") notes.push("SKU fora do canônico");
        if (cat === "duplicate-sku") notes.push(`SKU '${m.model_sku}' duplicada`);
        return {
          level: "model" as const,
          id: m.model_id,
          seller_sku: m.model_sku ?? null,
          category: cat,
          notes,
        };
      });

      const hasIssue =
        itemCategory !== "canonical" || models.some((m) => m.category !== "canonical");

      return {
        item_id: it.item_id,
        item_name: it.item_name,
        item_status: it.item_status,
        item_sku: it.item_sku ?? null,
        category: itemCategory,
        models,
        has_issue: hasIssue,
      };
    });

    audited.sort((a, b) => Number(b.has_issue) - Number(a.has_issue));

    const summary = {
      total: audited.length,
      with_issue: audited.filter((a) => a.has_issue).length,
      duplicate_sku_count: Array.from(skuCount.values()).filter((v) => v > 1).length,
    };

    return new Response(JSON.stringify({ summary, items: audited }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=30",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[shopee/audit-products]", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
};
