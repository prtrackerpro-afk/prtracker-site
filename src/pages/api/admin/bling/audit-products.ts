/**
 * GET /api/admin/bling/audit-products
 *
 * Lista todos os produtos cadastrados no Bling, classifica por estratégia
 * (canônico do site, candidato a bundle marketplace, legado), e reporta
 * estado de imagem. Read-only — não muta nada.
 *
 * UI em /admin/bling consome isso pra mostrar tabela com botões de
 * "anexar imagem" por produto, que chamam /api/admin/bling/repair-product/{id}.
 *
 * Auth: admin middleware. Bling deve estar conectado (OAuth).
 */

import type { APIRoute } from "astro";
import { listAllProducts, getProduct, type BlingProduct } from "~/lib/bling/products";
import { isConnected } from "~/lib/bling/oauth";
import {
  CANONICAL_IMAGE_BY_SKU,
  suggestImageByName,
} from "~/lib/bling/product-images";

export const prerender = false;

// SKUs canônicos que o webhook do site cria automaticamente (ver sku-map.ts).
// Manter sincronizado: se sku-map mudar, este array também.
const CANONICAL_SITE_SKUS = new Set<string>([
  "DEADLIFT-SET",
  "BENCH-SET",
  "POWER-SET",
  "MYPR-SET",
  // Boards e PR Runners (cadastrados no Bling em jun/2026 pelo sócio).
  // Cor/config no `nome`, não no código — 1 SKU por produto.
  "PRboard-2ex",
  "PRboard-3ex",
  "RPRUNNER-Board",
  "TEMPO-Runner",
  // Camisetas pais (não vendem sozinhos — só pra organizar variações no Bling)
  "TEE-MASC", "TEE-BABY",
  "TEE-MASC-P", "TEE-MASC-M", "TEE-MASC-G", "TEE-MASC-GG",
  "TEE-BABY-P", "TEE-BABY-M", "TEE-BABY-G", "TEE-BABY-GG",
  "ANILHA-25", "ANILHA-20", "ANILHA-15", "ANILHA-10",
  "ANILHA-5", "ANILHA-2.5", "ANILHA-1.25",
  "ANILHA-MIX",
]);

type AuditCategory = "canonical-site" | "marketplace-legacy" | "unknown";

interface AuditedProduct {
  id: number;
  codigo: string | undefined;
  nome: string;
  preco: number | undefined;
  situacao: string | undefined;
  category: AuditCategory;
  hasImage: boolean;
  imageCount: number;
  suggestedImageUrl: string | null;
  notes: string[];
}

export const GET: APIRoute = async () => {
  if (!(await isConnected())) {
    return new Response(
      JSON.stringify({ error: "bling not connected" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const all = await listAllProducts();

    // Bling /produtos (list) NÃO traz `midia`. Pra saber se tem imagem,
    // precisamos GET /produtos/{id} pra cada um. Pra catálogo pequeno
    // (~14 produtos) isso é OK em sequência (~5s no total respeitando
    // o rate-limit de 350ms/req do api.ts).
    const detailed: BlingProduct[] = [];
    for (const p of all) {
      const full = await getProduct(p.id);
      if (full) detailed.push(full);
    }

    const audited: AuditedProduct[] = detailed.map((p) => {
      const codigo = p.codigo ?? "";
      const externas = p.midia?.imagens?.externas ?? [];
      const internas = p.midia?.imagens?.internas ?? [];
      const imageCount = externas.length + internas.length;
      const hasImage = imageCount > 0;

      let category: AuditCategory;
      if (CANONICAL_SITE_SKUS.has(codigo)) {
        category = "canonical-site";
      } else if (codigo) {
        category = "marketplace-legacy";
      } else {
        category = "unknown";
      }

      const suggestedImageUrl =
        CANONICAL_IMAGE_BY_SKU[codigo] ?? suggestImageByName(p.nome);

      const notes: string[] = [];
      if (!hasImage) notes.push("sem imagem");
      if (category === "canonical-site" && !CANONICAL_IMAGE_BY_SKU[codigo]) {
        notes.push("canônico sem mapping de imagem (atualizar audit-products.ts)");
      }
      if (p.situacao !== "A" && p.situacao != null) notes.push(`situação=${p.situacao}`);

      return {
        id: p.id,
        codigo: p.codigo,
        nome: p.nome,
        preco: p.preco,
        situacao: p.situacao,
        category,
        hasImage,
        imageCount,
        suggestedImageUrl,
        notes,
      };
    });

    // Ordena: canônicos sem imagem primeiro (alta prioridade de fix),
    // depois marketplace-legacy sem imagem, depois OK no fim.
    audited.sort((a, b) => {
      const score = (x: AuditedProduct) =>
        (x.category === "canonical-site" ? 0 : x.category === "marketplace-legacy" ? 1 : 2) * 10 +
        (x.hasImage ? 1 : 0);
      return score(a) - score(b);
    });

    const summary = {
      total: audited.length,
      canonical_site: audited.filter((a) => a.category === "canonical-site").length,
      marketplace_legacy: audited.filter((a) => a.category === "marketplace-legacy").length,
      unknown: audited.filter((a) => a.category === "unknown").length,
      missing_image: audited.filter((a) => !a.hasImage).length,
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
    console.error("[audit-products]", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
};
