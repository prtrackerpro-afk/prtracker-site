/**
 * GET /api/admin/tiktok/audit-products
 *
 * Lista todos os produtos cadastrados no TikTok Shop, classifica por
 * SKU vs. canônica esperada, e reporta inconsistências. Read-only.
 *
 * UI consome em /admin/tiktok pra mostrar tabela com botão de "Renomear SKU"
 * por produto, que chama PUT /api/admin/tiktok/repair-sku/{productId}.
 *
 * Auth: admin middleware. TikTok deve estar conectado (OAuth).
 */

import type { APIRoute } from "astro";
import { listAllProducts, type TikTokProductSummary } from "~/lib/tiktok/products";
import { isConnected } from "~/lib/tiktok/oauth";

export const prerender = false;

// SKUs canônicas que esperamos ver nas listagens TikTok. Sincronizado com
// a hierarquia atual (Mai/2026): Basic/Super/Ultra para anilhas + bundles
// equipamento+anilhas com prefixo TT-*.
const EXPECTED_CANONICAL_SKUS = new Set<string>([
  "ANILHA-MIX", // canônico site (raro em TikTok)
  "TT-ANILHA-BASIC",
  "TT-ANILHA-SUPER",
  "TT-ANILHA-ULTRA",
  "TT-BENCH-120",
  "TT-DEAD-120",
  "TT-DEAD-200",
  "TT-POWER-120",
  "TT-POWER-200",
  "TT-MEGA-600",
  "TT-MEGA-1000",
  "TT-MYPR-120",
  "TT-TEE-MASC",
  "TT-TEE-BABY",
  // Variações de tamanho (futuro):
  "TEE-MASC-P", "TEE-MASC-M", "TEE-MASC-G", "TEE-MASC-GG",
  "TEE-BABY-P", "TEE-BABY-M", "TEE-BABY-G", "TEE-BABY-GG",
]);

type AuditCategory = "canonical" | "non-canonical" | "no-sku" | "duplicate-sku";

interface AuditedSku {
  sku_id: string;
  seller_sku: string | null;
  category: AuditCategory;
  notes: string[];
}

interface AuditedProduct {
  product_id: string;
  title: string;
  status: string;
  skus: AuditedSku[];
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
      JSON.stringify({ error: "tiktok not connected" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const all = await listAllProducts("ACTIVATE");

    // Mapeia SKUs duplicadas (problema #1 que diagnosticamos hoje).
    const skuCount = new Map<string, number>();
    for (const p of all) {
      for (const s of p.skus ?? []) {
        const sku = s.seller_sku;
        if (!sku) continue;
        skuCount.set(sku, (skuCount.get(sku) ?? 0) + 1);
      }
    }

    const audited: AuditedProduct[] = all.map((p: TikTokProductSummary) => {
      const skus: AuditedSku[] = (p.skus ?? []).map((s) => {
        const category = classifySku(s.seller_sku, skuCount);
        const notes: string[] = [];
        if (category === "no-sku") notes.push("SKU vazia");
        if (category === "non-canonical")
          notes.push("SKU fora do mapeamento canônico (TT-* / *-V1)");
        if (category === "duplicate-sku")
          notes.push(`SKU '${s.seller_sku}' usada em múltiplos produtos`);
        return {
          sku_id: s.id,
          seller_sku: s.seller_sku ?? null,
          category,
          notes,
        };
      });
      return {
        product_id: p.id,
        title: p.title,
        status: p.status,
        skus,
        has_issue: skus.some((s) => s.category !== "canonical"),
      };
    });

    // Ordena: produtos com problema primeiro.
    audited.sort((a, b) => Number(b.has_issue) - Number(a.has_issue));

    const summary = {
      total: audited.length,
      with_issue: audited.filter((p) => p.has_issue).length,
      duplicate_sku_count: Array.from(skuCount.values()).filter((v) => v > 1).length,
    };

    return new Response(JSON.stringify({ summary, products: audited }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=30",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[tiktok/audit-products]", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
};
