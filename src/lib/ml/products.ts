/**
 * Mercado Livre — gestão de items (produtos).
 *
 * Endpoints principais:
 *   GET /users/me                        — info do seller logado
 *   GET /users/{seller_id}/items/search  — listar items do seller
 *   GET /items/{id}                      — detalhe de um item
 *   POST /items                          — criar item
 *   PUT /items/{id}                      — atualizar item
 *
 * `seller_custom_field` é o campo equivalente a `seller_sku` no TikTok —
 * é onde guardamos a SKU canônica que cruza com Bling.
 */

import { mlFetch } from "./api";

export interface MLItem {
  id: string;
  title: string;
  price: number;
  available_quantity: number;
  status: "active" | "paused" | "closed" | "under_review";
  seller_custom_field?: string | null; // SKU canônica (cross-channel)
  category_id?: string;
  permalink?: string;
  thumbnail?: string;
  variations?: MLItemVariation[];
}

export interface MLItemVariation {
  id: number;
  price?: number;
  available_quantity?: number;
  attribute_combinations?: Array<{ id: string; name: string; value_name: string }>;
  seller_custom_field?: string | null;
}

export interface MLUserMe {
  id: number;
  nickname: string;
  email?: string;
  site_id: string;
  status?: { user_type: string };
}

export async function getUserMe(accessToken?: string): Promise<MLUserMe> {
  return mlFetch<MLUserMe>("/users/me", { accessToken });
}

/**
 * Lista IDs dos items do seller. ML paga: por padrão retorna 50 IDs por página.
 * Pra detalhes, faz GET /items/{id} pra cada (pode ser feito em batches via
 * /items?ids=id1,id2,id3 — máx 20).
 */
export async function searchSellerItems(opts: {
  sellerId: number;
  status?: "active" | "paused" | "closed";
  offset?: number;
  limit?: number;
}): Promise<{ results: string[]; total: number }> {
  const query: Record<string, string | number> = {
    offset: opts.offset ?? 0,
    limit: opts.limit ?? 50,
  };
  if (opts.status) query.status = opts.status;

  const res = await mlFetch<{ results: string[]; paging: { total: number } }>(
    `/users/${opts.sellerId}/items/search`,
    { query },
  );
  return { results: res.results, total: res.paging.total };
}

/**
 * Busca detalhes de até 20 items por chamada. ML retorna array com
 * { code: 200, body: MLItem } ou { code: 404, body: ... }.
 */
export async function getItemsBatch(ids: string[]): Promise<MLItem[]> {
  if (ids.length === 0) return [];
  if (ids.length > 20) {
    throw new Error("getItemsBatch: máx 20 IDs por chamada");
  }
  const res = await mlFetch<Array<{ code: number; body: MLItem }>>(
    `/items?ids=${ids.join(",")}`,
  );
  return res.filter((r) => r.code === 200).map((r) => r.body);
}

/**
 * Lista TODOS items do seller (paginado automaticamente). Cuidado com
 * catálogos grandes — máx 1000 IDs total via search por seller.
 */
export async function listAllSellerItems(
  sellerId: number,
  status: "active" | "paused" | "closed" = "active",
): Promise<MLItem[]> {
  const allIds: string[] = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const { results, total } = await searchSellerItems({
      sellerId,
      status,
      offset,
      limit,
    });
    allIds.push(...results);
    if (allIds.length >= total) break;
    offset += limit;
    if (offset > 1000) break; // safety cap
  }

  // Buscar detalhes em batches de 20
  const items: MLItem[] = [];
  for (let i = 0; i < allIds.length; i += 20) {
    const batch = allIds.slice(i, i + 20);
    const detailed = await getItemsBatch(batch);
    items.push(...detailed);
  }
  return items;
}

/**
 * Atualiza seller_custom_field de um item (renomeia SKU). Útil pra
 * alinhar listings ML com SKUs canônicas Bling.
 */
export async function updateItemSku(
  itemId: string,
  newSku: string,
): Promise<MLItem> {
  return mlFetch<MLItem>(`/items/${itemId}`, {
    method: "PUT",
    body: { seller_custom_field: newSku },
  });
}
