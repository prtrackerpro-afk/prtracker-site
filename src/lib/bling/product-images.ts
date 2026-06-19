/**
 * Bling v3 — Imagens de produto.
 *
 * Fonte única do mapa "SKU canônico → URL de imagem do site" e da heurística
 * por nome. Usado pelo audit-products (relatório) e pelo listProductImageUrls
 * (gera a lista SKU→URL pro Importar planilha do Bling).
 *
 * Como funciona: o Bling NÃO recebe upload binário aqui — ele BAIXA a imagem
 * de uma URL pública (campo `midia.imagens.externas`). Por isso as URLs
 * apontam sempre pro próprio site (`prtracker.com.br/images/...`).
 */

import { listAllProducts, type BlingProduct } from "./products";

export const SITE_URL = (
  import.meta.env.PUBLIC_SITE_URL ?? "https://prtracker.com.br"
).replace(/\/$/, "");

// Sugestão de imagem por canonical SKU (URL pública servida pelo site).
// O Bling baixa e armazena a imagem dessas URLs quando recebe via
// midia.imagens.externas.
export const CANONICAL_IMAGE_BY_SKU: Record<string, string> = {
  "DEADLIFT-SET": `${SITE_URL}/images/products/deadlift-set/hero.jpg`,
  "BENCH-SET": `${SITE_URL}/images/products/bench-press-set/hero.jpg`,
  "POWER-SET": `${SITE_URL}/images/products/power-rack-set/hero.jpg`,
  "MYPR-SET": `${SITE_URL}/images/products/my-pr-set/hero.jpg`,
  "TEE-MASC": `${SITE_URL}/images/products/camiseta-masculina/FT-C.jpg`,
  "TEE-MASC-P": `${SITE_URL}/images/products/camiseta-masculina/FT-C.jpg`,
  "TEE-MASC-M": `${SITE_URL}/images/products/camiseta-masculina/FT-C.jpg`,
  "TEE-MASC-G": `${SITE_URL}/images/products/camiseta-masculina/FT-C.jpg`,
  "TEE-MASC-GG": `${SITE_URL}/images/products/camiseta-masculina/FT-C.jpg`,
  "TEE-BABY": `${SITE_URL}/images/products/camiseta-feminina-baby-look/FT-C.jpg`,
  "TEE-BABY-P": `${SITE_URL}/images/products/camiseta-feminina-baby-look/FT-C.jpg`,
  "TEE-BABY-M": `${SITE_URL}/images/products/camiseta-feminina-baby-look/FT-C.jpg`,
  "TEE-BABY-G": `${SITE_URL}/images/products/camiseta-feminina-baby-look/FT-C.jpg`,
  "TEE-BABY-GG": `${SITE_URL}/images/products/camiseta-feminina-baby-look/FT-C.jpg`,
  "ANILHA-25": `${SITE_URL}/images/products/anilhas/Anilhas_0007_todas-anilhas-clean.jpg`,
  "ANILHA-20": `${SITE_URL}/images/products/anilhas/Anilhas_0007_todas-anilhas-clean.jpg`,
  "ANILHA-15": `${SITE_URL}/images/products/anilhas/Anilhas_0007_todas-anilhas-clean.jpg`,
  "ANILHA-10": `${SITE_URL}/images/products/anilhas/Anilhas_0007_todas-anilhas-clean.jpg`,
  "ANILHA-5": `${SITE_URL}/images/products/anilhas/Anilhas_0007_todas-anilhas-clean.jpg`,
  "ANILHA-2.5": `${SITE_URL}/images/products/anilhas/Anilhas_0007_todas-anilhas-clean.jpg`,
  "ANILHA-1.25": `${SITE_URL}/images/products/anilhas/Anilhas_0007_todas-anilhas-clean.jpg`,
  "ANILHA-MIX": `${SITE_URL}/images/products/anilhas/Anilhas_0007_todas-anilhas-clean.jpg`,
  // Boards e Runners — pastas têm hero.svg + photo-NN.jpg. Bling baixa
  // por URL e SVG dá problema; usamos photo-01.jpg em todos.
  "PRboard-2ex": `${SITE_URL}/images/products/pr-tracker-board-2/photo-01.jpg`,
  "PRboard-3ex": `${SITE_URL}/images/products/pr-tracker-board-3/photo-01.jpg`,
  "RPRUNNER-Board": `${SITE_URL}/images/products/meus-rps/photo-01.jpg`,
  "TEMPO-Runner": `${SITE_URL}/images/products/meus-rps-plaquinha/photo-01.jpg`,
};

// Heurística pra associar produtos com SKUs não-canônicos a um hero do site
// pelo nome. Útil pros listings de marketplace/legado tipo "Mini Bench Press"
// que não usam BENCH-SET mas representam o mesmo produto físico.
export function suggestImageByName(nome: string): string | null {
  const n = nome.toLowerCase();
  if (n.includes("deadlift")) return `${SITE_URL}/images/products/deadlift-set/hero.jpg`;
  if (n.includes("bench")) return `${SITE_URL}/images/products/bench-press-set/hero.jpg`;
  if (n.includes("power") || n.includes("rack")) return `${SITE_URL}/images/products/power-rack-set/hero.jpg`;
  if (n.includes("my pr") || n.includes("trofeu") || n.includes("crossfit")) return `${SITE_URL}/images/products/my-pr-set/hero.jpg`;
  if (n.includes("baby") || (n.includes("camiseta") && n.includes("femin"))) return `${SITE_URL}/images/products/camiseta-feminina-baby-look/FT-C.jpg`;
  if (n.includes("camiseta") || n.includes("masc")) return `${SITE_URL}/images/products/camiseta-masculina/FT-C.jpg`;
  if (n.includes("anilha") || n.includes("kit")) return `${SITE_URL}/images/products/anilhas/Anilhas_0007_todas-anilhas-clean.jpg`;
  return null;
}

/**
 * URL de imagem sugerida pra um produto: tenta o mapa por código canônico,
 * cai pra heurística por nome. Null se não der pra inferir.
 */
export function suggestImageFor(p: {
  codigo?: string;
  nome: string;
}): string | null {
  const byCode = p.codigo ? CANONICAL_IMAGE_BY_SKU[p.codigo] : undefined;
  return byCode ?? suggestImageByName(p.nome);
}

export interface ProductImageUrlRow {
  blingId: number;
  codigo: string | null;
  nome: string;
  /** URL canônica sugerida pro produto (null se não der pra inferir). */
  imageUrl: string | null;
}

export interface ProductImageUrlsReport {
  total: number;
  /** Produtos com URL sugerida. */
  withUrl: ProductImageUrlRow[];
  /** Produtos sem sugestão (código/nome não mapearam). */
  withoutUrl: ProductImageUrlRow[];
}

/**
 * Gera a lista SKU → URL de imagem do site pra TODO produto do Bling.
 *
 * Read-only: NÃO grava nada no Bling. A API PUT /produtos do Bling v3 não
 * persiste `midia.imagens.externas` (a UI usa outro caminho interno), então
 * imagem entra via **Importar planilha** (coluna AR "URL Imagens Externas").
 * Esta função monta a lista pronta pra essa planilha — o operador casa por
 * código (VLOOKUP) ou usa o CSV de 2 colunas.
 *
 * Rápido: só `listAllProducts` (1-2 chamadas) + heurística local, sem GET
 * por produto.
 */
export async function listProductImageUrls(): Promise<ProductImageUrlsReport> {
  const all: BlingProduct[] = await listAllProducts();
  const rows: ProductImageUrlRow[] = all.map((p) => ({
    blingId: p.id,
    codigo: p.codigo ?? null,
    nome: p.nome,
    imageUrl: suggestImageFor(p),
  }));
  return {
    total: rows.length,
    withUrl: rows.filter((r) => r.imageUrl),
    withoutUrl: rows.filter((r) => !r.imageUrl),
  };
}
