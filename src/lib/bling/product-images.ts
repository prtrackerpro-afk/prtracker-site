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
  /** URL externa que o produto já tinha (pra debug de 404 antigo). */
  oldImageUrl?: string | null;
  status:
    | "ok"
    | "no-op"
    | "planned"
    | "not-persisted"
    | "skip-has-internal"
    | "skip-no-suggestion"
    | "error";
  error?: string;
}

export interface SyncImagesReport {
  dryRun: boolean;
  total: number;
  applied: SyncImagesItemResult[];
  noOp: SyncImagesItemResult[];
  planned: SyncImagesItemResult[];
  /** PUT retornou 200 mas o Bling NÃO armazenou a URL (limitação da API). */
  notPersisted: SyncImagesItemResult[];
  skippedHasInternal: SyncImagesItemResult[];
  skippedNoSuggestion: SyncImagesItemResult[];
  errors: SyncImagesItemResult[];
}

/**
 * Garante a URL canônica do site (`midia.imagens.externas`) em todo produto:
 *   - sem imagem            → seta a hero do site
 *   - externas != a sugerida → SUBSTITUI (corrige URL antiga/404)
 *   - externas == a sugerida → no-op (idempotente)
 *   - tem imagem `interna` (upload manual no Bling) → pula (preserva o manual)
 *
 * Importante: o Bling tem uma config de conta "forma de inserir imagens"
 * (por arquivo vs por URL). Pra essas URLs externas APARECEREM no produto, a
 * conta precisa estar no modo "URL de imagens". Senão o Bling guarda o link
 * mas o formulário (modo arquivo) não exibe.
 *
 * Coleta erros por-produto sem abortar o lote.
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

    // A listagem não traz `midia` — precisa do produto completo.
    const full = await getProduct(p.id);
    if (!full) {
      results.push({ ...base, status: "error", error: "produto não encontrado" });
      continue;
    }

    const internas = full.midia?.imagens?.internas ?? [];
    if (internas.length > 0) {
      // Upload manual no Bling — não mexe.
      results.push({ ...base, status: "skip-has-internal" });
      continue;
    }

    const externas = full.midia?.imagens?.externas ?? [];
    const oldImageUrl = externas[0]?.link ?? null;
    const hasSuggested = externas.some((e) => e.link === imageUrl);
    if (hasSuggested) {
      results.push({ ...base, oldImageUrl, status: "no-op" });
      continue;
    }

    if (dryRun) {
      results.push({ ...base, oldImageUrl, status: "planned" });
      continue;
    }

    try {
      // Substitui as externas pela URL canônica (corrige 404 antigo / preenche).
      await updateProduct(p.id, { imagensExternas: [imageUrl] });
      // Verifica de verdade: o PUT /produtos do Bling v3 retorna 200 mas NÃO
      // persiste midia.imagens.externas (a UI usa outro caminho interno). Sem
      // re-ler, reportaríamos "ok" mentindo. Confirma lendo o produto de volta.
      const after = await getProduct(p.id);
      const stored = (after?.midia?.imagens?.externas ?? [])
        .map((e) => e.link)
        .filter((l): l is string => typeof l === "string");
      if (stored.includes(imageUrl)) {
        results.push({ ...base, oldImageUrl, status: "ok" });
      } else {
        results.push({
          ...base,
          oldImageUrl,
          status: "not-persisted",
          error:
            "Bling aceitou o PUT (200) mas não armazenou a URL externa — " +
            "use Importar via planilha no Bling (a API PUT /produtos não grava imagem).",
        });
      }
    } catch (err) {
      results.push({
        ...base,
        oldImageUrl,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    dryRun,
    total: results.length,
    applied: results.filter((r) => r.status === "ok"),
    noOp: results.filter((r) => r.status === "no-op"),
    planned: results.filter((r) => r.status === "planned"),
    notPersisted: results.filter((r) => r.status === "not-persisted"),
    skippedHasInternal: results.filter((r) => r.status === "skip-has-internal"),
    skippedNoSuggestion: results.filter((r) => r.status === "skip-no-suggestion"),
    errors: results.filter((r) => r.status === "error"),
  };
}
