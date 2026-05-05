/**
 * GET /api/admin/ml/audit-products
 *
 * Lista todos os items ativos do seller no Mercado Livre, classifica
 * `seller_custom_field` (SKU canonical) vs canonical Bling, e reporta
 * inconsistências. Read-only.
 *
 * UI consome em /admin/ml pra mostrar tabela com botão de "Renomear SKU"
 * por item, que chama PUT /api/admin/ml/repair-sku/{itemId}.
 *
 * Auth: admin middleware. ML deve estar conectado (OAuth).
 */

import type { APIRoute } from "astro";
import { isConnected, getValidAccess } from "~/lib/ml/oauth";
import { listAllSellerItems, type MLItem } from "~/lib/ml/products";

export const prerender = false;

// SKUs canônicas esperadas em listings ML.
// Sincronizar com sync-marketplace-skus.ts e audit-products do TikTok.
// Quando ML virar canal real, criar bundles ML-* (peso fixo) similar ao TT-*.
const EXPECTED_CANONICAL_SKUS = new Set<string>([
  // Cross-channel (mesmo produto site/marketplace)
  "TEE-MASC-P", "TEE-MASC-M", "TEE-MASC-G", "TEE-MASC-GG",
  "TEE-BABY-P", "TEE-BABY-M", "TEE-BABY-G",
  "ANILHA-25", "ANILHA-20", "ANILHA-15", "ANILHA-10",
  "ANILHA-5", "ANILHA-2.5", "ANILHA-1.25",
  "ANILHA-MIX",
  // ML-only bundles (futuro — quando tiver listings com peso fixo).
  // Adicionar à medida que catálogo ML expandir, ex:
  // "ML-BENCH-120", "ML-DEAD-200", etc.
]);

type AuditCategory = "canonical" | "non-canonical" | "no-sku" | "duplicate-sku";

interface AuditedItem {
  item_id: string;
  title: string;
  status: string;
  seller_sku: string | null;
  category: AuditCategory;
  notes: string[];
  variations: Array<{
    variation_id: number;
    seller_sku: string | null;
    category: AuditCategory;
    attributes: string;
  }>;
  has_issue: boolean;
}

function classifySku(
  sellerSku: string | null | undefined,
  duplicateMap: Map<string, number>,
): AuditCategory {
  if (!sellerSku) return "no-sku";
  if ((duplicateMap.get(sellerSku) ?? 0) > 1) return "duplicate-sku";
  if (EXPECTED_CANONICAL_SKUS.has(sellerSku)) return "canonical";
  return "non-canonical";
}

export const GET: APIRoute = async () => {
  if (!(await isConnected())) {
    return new Response(
      JSON.stringify({ error: "ml not connected" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const { sellerId } = await getValidAccess();
    const items = await listAllSellerItems(sellerId, "active");

    // Mapeia SKUs duplicadas (1 SKU em múltiplos items é ruim — quebra dedup).
    const skuCount = new Map<string, number>();
    for (const it of items) {
      if (it.seller_custom_field) {
        skuCount.set(it.seller_custom_field, (skuCount.get(it.seller_custom_field) ?? 0) + 1);
      }
      for (const v of it.variations ?? []) {
        if (v.seller_custom_field) {
          skuCount.set(v.seller_custom_field, (skuCount.get(v.seller_custom_field) ?? 0) + 1);
        }
      }
    }

    const audited: AuditedItem[] = items.map((it: MLItem) => {
      const itemCategory = classifySku(it.seller_custom_field, skuCount);
      const itemNotes: string[] = [];
      if (itemCategory === "no-sku") itemNotes.push("seller_custom_field vazio");
      if (itemCategory === "non-canonical")
        itemNotes.push("SKU fora do mapeamento canônico");
      if (itemCategory === "duplicate-sku")
        itemNotes.push(`SKU '${it.seller_custom_field}' usada em múltiplos items`);

      const variations = (it.variations ?? []).map((v) => {
        const vCategory = classifySku(v.seller_custom_field, skuCount);
        const attrs = (v.attribute_combinations ?? [])
          .map((a) => `${a.name}: ${a.value_name}`)
          .join(", ");
        return {
          variation_id: v.id,
          seller_sku: v.seller_custom_field ?? null,
          category: vCategory,
          attributes: attrs,
        };
      });

      const hasIssue =
        itemCategory !== "canonical" ||
        variations.some((v) => v.category !== "canonical");

      return {
        item_id: it.id,
        title: it.title,
        status: it.status,
        seller_sku: it.seller_custom_field ?? null,
        category: itemCategory,
        notes: itemNotes,
        variations,
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
    console.error("[ml/audit-products]", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
};
