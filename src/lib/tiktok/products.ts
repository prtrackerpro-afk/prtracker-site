/**
 * TikTok Shop Open Platform — Produtos.
 *
 * Docs: https://partner.tiktokshop.com/docv2/page/650a6e60ce71fd02b15596c4
 *
 * Endpoints principais (versão 202309 da Catalog API):
 *   GET  /product/202309/products/search    → busca/lista
 *   GET  /product/202309/products/{id}      → detalhe
 *   POST /product/202309/products           → criar
 *   PUT  /product/202309/products/{id}      → atualizar (FULL update — payload completo)
 *   POST /product/202309/products/{id}/partial_edit → partial update (cobre SKU, preço, estoque)
 *   POST /product/202309/products/recover   → restaurar deletado
 *
 * O fluxo principal pra arrumar SKUs (caso de uso atual):
 *   1) listar produtos → identificar listings com SKU canônica errada
 *   2) PARTIAL_EDIT em cada um pra trocar `seller_sku` da SKU/variation
 *   3) confirmar via search que SKU bateu
 */

import { tiktokFetch, TikTokApiError } from "./api";

/** Produto resumido vindo do search. */
export interface TikTokProductSummary {
  id: string;
  title: string;
  status: string; // "ACTIVATE" | "DEACTIVATED" | "DELETED" | "FROZEN" | etc.
  create_time?: number;
  update_time?: number;
  skus?: TikTokSku[];
}

export interface TikTokSku {
  id: string;
  /** SKU do vendedor (= código que o seller controla, mapeia pro Bling). */
  seller_sku?: string;
  /** Preço de varejo em string (ex: "119.00"). */
  price?: {
    currency: string;
    sale_price?: string;
    tax_exclusive_price?: string;
  };
  inventory?: Array<{
    warehouse_id: string;
    quantity: number;
  }>;
}

export interface TikTokProductDetail extends TikTokProductSummary {
  description?: string;
  category_id?: string;
  brand_id?: string;
  main_images?: Array<{ uri: string; url?: string }>;
  package_dimensions?: {
    length?: { value: string; unit: string };
    width?: { value: string; unit: string };
    height?: { value: string; unit: string };
    weight?: { value: string; unit: string };
  };
}

/**
 * Lista produtos por critério de busca. Paginado por `page_token` (cursor).
 *
 * `status` filtra estados:
 *   - "ALL" (default)
 *   - "ACTIVATE" (ativos)
 *   - "DEACTIVATED"
 *   - "DELETED"
 *   - "FROZEN"
 *
 * Limite máximo TikTok: page_size=100.
 */
export async function searchProducts(
  options: {
    pageSize?: number;
    pageToken?: string;
    status?: "ALL" | "ACTIVATE" | "DEACTIVATED" | "DELETED" | "FROZEN";
    keyword?: string;
    sellerSku?: string;
  } = {},
): Promise<{
  products: TikTokProductSummary[];
  next_page_token: string | null;
  total_count: number;
}> {
  const body: Record<string, unknown> = {};
  if (options.status && options.status !== "ALL") body.status = options.status;
  if (options.keyword) body.keyword = options.keyword;
  if (options.sellerSku) body.seller_sku = options.sellerSku;

  const query: Record<string, string | number> = {
    page_size: options.pageSize ?? 50,
  };
  if (options.pageToken) query.page_token = options.pageToken;

  const res = await tiktokFetch<{
    products: TikTokProductSummary[];
    next_page_token?: string;
    total_count?: number;
  }>("/product/202309/products/search", {
    method: "POST",
    query,
    body,
  });

  return {
    products: res.products ?? [],
    next_page_token: res.next_page_token ?? null,
    total_count: res.total_count ?? 0,
  };
}

/**
 * Lista TODOS os produtos (paginação automática). Pra catálogos pequenos
 * (PR Tracker tem ~13). Cap em 50 páginas pra segurança.
 */
export async function listAllProducts(
  status: "ALL" | "ACTIVATE" | "DEACTIVATED" = "ALL",
): Promise<TikTokProductSummary[]> {
  const out: TikTokProductSummary[] = [];
  let token: string | null = null;
  for (let i = 0; i < 50; i++) {
    const page = await searchProducts({
      pageSize: 100,
      pageToken: token ?? undefined,
      status,
    });
    out.push(...page.products);
    if (!page.next_page_token) break;
    token = page.next_page_token;
  }
  return out;
}

/**
 * Detalhe completo de um produto, incluindo variações/SKUs.
 */
export async function getProduct(
  productId: string,
): Promise<TikTokProductDetail | null> {
  try {
    const res = await tiktokFetch<TikTokProductDetail>(
      `/product/202309/products/${encodeURIComponent(productId)}`,
      { method: "GET" },
    );
    return res ?? null;
  } catch (err) {
    if (err instanceof TikTokApiError && err.httpStatus === 404) return null;
    throw err;
  }
}

/**
 * Atualiza parcialmente atributos de SKU — incluindo `seller_sku` (que é o
 * que precisamos pra arrumar SKUs canônicas em massa).
 *
 * Body: { skus: [{ id, seller_sku?, price?, inventory? }, ...] }
 *
 * Caveat: o endpoint EXIGE passar TODOS os SKUs do produto, não só os
 * que mudam. Use `getProduct` pra carregar todos antes do update.
 */
export async function updateProductSkus(
  productId: string,
  skus: Array<{
    id: string;
    seller_sku?: string;
    price?: { sale_price: string; currency: string };
    inventory?: Array<{ warehouse_id: string; quantity: number }>;
  }>,
): Promise<void> {
  await tiktokFetch(
    `/product/202309/products/${encodeURIComponent(productId)}/partial_edit`,
    {
      method: "POST",
      body: { skus },
    },
  );
}

/**
 * Helper de alto nível: lê o produto, atualiza só o seller_sku da SKU única
 * (produtos sem variações), preserva o resto.
 *
 * Pra produtos com múltiplas variações (camiseta P/M/G/GG), chame
 * `updateProductSkus` direto passando todas.
 */
export async function renameSellerSku(
  productId: string,
  newSellerSku: string,
): Promise<void> {
  const product = await getProduct(productId);
  if (!product) throw new TikTokApiError(`product ${productId} not found`, 404);
  if (!product.skus || product.skus.length === 0) {
    throw new TikTokApiError(
      `product ${productId} has no SKUs to rename`,
      400,
    );
  }
  if (product.skus.length > 1) {
    throw new TikTokApiError(
      `product ${productId} has ${product.skus.length} variations — use updateProductSkus directly`,
      400,
    );
  }
  await updateProductSkus(productId, [
    { id: product.skus[0]!.id, seller_sku: newSellerSku },
  ]);
}
