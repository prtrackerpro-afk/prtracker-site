/**
 * Bling v3 — Imagens de produto.
 *
 * Fonte única do mapa "SKU canônico → URL de imagem do site" e da heurística
 * por nome. Usado pelo audit-products (relatório) e pelo syncProductImages
 * (backfill em massa).
 *
 * Como funciona: o Bling NÃO recebe upload binário aqui — ele BAIXA a imagem
 * de uma URL pública (campo `midia.imagens.externas`). Por isso as URLs
 * apontam sempre pro próprio site (`prtracker.com.br/images/...`).
 */

import {
  listAllProducts,
  getProduct,
  updateProduct,
  type BlingProduct,
} from "./products";

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
  if (n.includes("baby") || (n.includes("camiseta") && n.includes("femin"))) return `${SITE_URL}/images/products/camiseta-feminina-baby-look/hero.jpg`;
  if (n.includes("camiseta") || n.includes("masc")) return `${SITE_URL}/images/products/camiseta-masculina/hero.jpg`;
  if (n.includes("anilha") || n.includes("kit")) return `${SITE_URL}/images/products/anilhas/hero.jpg`;
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

export interface SyncImagesOptions {
  /** true → monta o plano mas NÃO chama o Bling (preview). */
  dryRun?: boolean;
  /** Restringe aos códigos (SKU) informados. Omitido = todos. */
  only?: string[] | null;
}

export interface SyncImagesItemResult {
  blingId: number;
  codigo: string | null;
  nome: string;
  imageUrl: string | null;
  status:
    | "ok"
    | "planned"
    | "skip-has-image"
    | "skip-no-suggestion"
    | "error";
  error?: string;
}

export interface SyncImagesReport {
  dryRun: boolean;
  total: number;
  applied: SyncImagesItemResult[];
  planned: SyncImagesItemResult[];
  skippedHasImage: SyncImagesItemResult[];
  skippedNoSuggestion: SyncImagesItemResult[];
  errors: SyncImagesItemResult[];
}

/**
 * Backfill de imagens: pra cada produto SEM imagem, anexa a hero do site
 * (URL pública que o Bling baixa). Idempotente — produto que já tem qualquer
 * imagem é pulado (não empilha duplicata nem sobrescreve foto manual).
 *
 * Não toca em quem já tem imagem; preenche só as lacunas. Coleta erros
 * por-produto sem abortar o lote.
 */
export async function syncProductImages(
  opts: SyncImagesOptions = {},
): Promise<SyncImagesReport> {
  const dryRun = opts.dryRun === true;
  const onlyFilter =
    opts.only && opts.only.length > 0 ? new Set(opts.only) : null;

  const all: BlingProduct[] = await listAllProducts();
  const results: SyncImagesItemResult[] = [];

  for (const p of all) {
    if (onlyFilter && !(p.codigo && onlyFilter.has(p.codigo))) continue;

    const imageUrl = suggestImageFor(p);
    const base = {
      blingId: p.id,
      codigo: p.codigo ?? null,
      nome: p.nome,
      imageUrl,
    };

    if (!imageUrl) {
      results.push({ ...base, status: "skip-no-suggestion" });
      continue;
    }

    // A listagem não traz `midia` — precisa do produto completo pra saber
    // se já tem imagem.
    const full = await getProduct(p.id);
    if (!full) {
      results.push({ ...base, status: "error", error: "produto não encontrado" });
      continue;
    }
    const externas = full.midia?.imagens?.externas ?? [];
    const internas = full.midia?.imagens?.internas ?? [];
    if (externas.length + internas.length > 0) {
      results.push({ ...base, status: "skip-has-image" });
      continue;
    }

    if (dryRun) {
      results.push({ ...base, status: "planned" });
      continue;
    }

    try {
      await updateProduct(p.id, { imagensExternas: [imageUrl] });
      results.push({ ...base, status: "ok" });
    } catch (err) {
      results.push({
        ...base,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    dryRun,
    total: results.length,
    applied: results.filter((r) => r.status === "ok"),
    planned: results.filter((r) => r.status === "planned"),
    skippedHasImage: results.filter((r) => r.status === "skip-has-image"),
    skippedNoSuggestion: results.filter((r) => r.status === "skip-no-suggestion"),
    errors: results.filter((r) => r.status === "error"),
  };
}
