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

export const prerender = false;

const SITE_URL = (
  import.meta.env.PUBLIC_SITE_URL ?? "https://prtracker.com.br"
).replace(/\/$/, "");

// SKUs canônicos que o webhook do site cria automaticamente (ver sku-map.ts).
// Manter sincronizado: se sku-map mudar, este array também.
const CANONICAL_SITE_SKUS = new Set<string>([
  "DEADLIFT-SET",
  "BENCH-SET",
  "POWER-SET",
  "MYPR-SET",
  // Camisetas pais (não vendem sozinhos — só pra organizar variações no Bling)
  "TEE-MASC", "TEE-BABY",
  "TEE-MASC-P", "TEE-MASC-M", "TEE-MASC-G", "TEE-MASC-GG",
  "TEE-BABY-P", "TEE-BABY-M", "TEE-BABY-G", "TEE-BABY-GG",
  "ANILHA-25", "ANILHA-20", "ANILHA-15", "ANILHA-10",
  "ANILHA-5", "ANILHA-2.5", "ANILHA-1.25",
  "ANILHA-MIX",
]);

// Sugestão de imagem por canonical SKU (URL pública servida pelo site).
// O Bling baixa e armazena a imagem dessas URLs quando recebe via
// midia.imagens.externas.
const CANONICAL_IMAGE_BY_SKU: Record<string, string> = {
  "DEADLIFT-SET": `${SITE_URL}/images/products/deadlift-set/hero.jpg`,
  "BENCH-SET": `${SITE_URL}/images/products/bench-press-set/hero.jpg`,
  "POWER-SET": `${SITE_URL}/images/products/power-rack-set/hero.jpg`,
  "MYPR-SET": `${SITE_URL}/images/products/my-pr-set/hero.jpg`,
  "TEE-MASC": `${SITE_URL}/images/products/camiseta-masculina/hero.jpg`,
  "TEE-MASC-P": `${SITE_URL}/images/products/camiseta-masculina/hero.jpg`,
  "TEE-MASC-M": `${SITE_URL}/images/products/camiseta-masculina/hero.jpg`,
  "TEE-MASC-G": `${SITE_URL}/images/products/camiseta-masculina/hero.jpg`,
  "TEE-MASC-GG": `${SITE_URL}/images/products/camiseta-masculina/hero.jpg`,
  "TEE-BABY": `${SITE_URL}/images/products/camiseta-feminina-baby-look/hero.jpg`,
  "TEE-BABY-P": `${SITE_URL}/images/products/camiseta-feminina-baby-look/hero.jpg`,
  "TEE-BABY-M": `${SITE_URL}/images/products/camiseta-feminina-baby-look/hero.jpg`,
  "TEE-BABY-G": `${SITE_URL}/images/products/camiseta-feminina-baby-look/hero.jpg`,
  "TEE-BABY-GG": `${SITE_URL}/images/products/camiseta-feminina-baby-look/hero.jpg`,
  "ANILHA-25": `${SITE_URL}/images/products/anilhas/hero.jpg`,
  "ANILHA-20": `${SITE_URL}/images/products/anilhas/hero.jpg`,
  "ANILHA-15": `${SITE_URL}/images/products/anilhas/hero.jpg`,
  "ANILHA-10": `${SITE_URL}/images/products/anilhas/hero.jpg`,
  "ANILHA-5": `${SITE_URL}/images/products/anilhas/hero.jpg`,
  "ANILHA-2.5": `${SITE_URL}/images/products/anilhas/hero.jpg`,
  "ANILHA-1.25": `${SITE_URL}/images/products/anilhas/hero.jpg`,
  "ANILHA-MIX": `${SITE_URL}/images/products/anilhas/hero.jpg`,
};

// Heurística pra associar produtos com SKUs não-canônicos a um hero do site
// pelo nome. Útil pros listings de marketplace/legado tipo "Mini Bench Press"
// que não usam BENCH-SET mas representam o mesmo produto físico.
function suggestImageByName(nome: string): string | null {
  const n = nome.toLowerCase();
  if (n.includes("deadlift")) return `${SITE_URL}/images/products/deadlift-set/hero.jpg`;
  if (n.includes("bench")) return `${SITE_URL}/images/products/bench-press-set/hero.jpg`;
  if (n.includes("power") || n.includes("rack")) return `${SITE_URL}/images/products/power-rack-set/hero.jpg`;
  if (n.includes("my pr") || n.includes("trofeu") || n.includes("crossfit")) return `${SITE_URL}/images/products/my-pr-set/hero.jpg`;
  if (n.includes("baby") || (n.includes("camiseta") && n.includes("femin"))) return `${SITE_URL}/images/products/camiseta-feminina-baby-look/hero.jpg`;
  if (n.includes("camiseta") || n.includes("masc")) return `${SITE_URL}/images/products/camiseta-masculina/hero.jpg`;
  if (n.includes("anilha") || n.includes("kit")) return `${SITE_URL}/images/products/anilhas/hero.jpg`;
  return null;
}

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
