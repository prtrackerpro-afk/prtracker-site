/**
 * Shopee — gestão de items (produtos).
 *
 * Endpoints principais:
 *   GET /api/v2/product/get_item_list      — lista IDs de items do shop
 *   GET /api/v2/product/get_item_base_info — detalhes em batch (até 50 items)
 *   POST /api/v2/product/update_item       — atualizar campos do item
 *
 * Shopee usa `item_sku` (parent SKU) e `model_sku` (variation SKU) — equivalente
 * ao TikTok seller_sku ou ML seller_custom_field. É onde guardamos a SKU
 * canônica que cruza com Bling.
 */

import { shopeeFetch } from "./api";

export interface ShopeeItemSummary {
  item_id: number;
  item_status: "NORMAL" | "BANNED" | "UNLIST" | "DELETED";
  update_time?: number;
}

export interface ShopeeItem {
  item_id: number;
  item_name: string;
  item_sku: string; // SKU principal (parent)
  item_status: string;
  category_id: number;
  price?: number;
  stock?: number;
  has_model: boolean; // true = produto com variações
  models?: ShopeeItemModel[];
}

export interface ShopeeItemModel {
  model_id: number;
  model_sku: string;
  tier_index?: number[];
  price_info?: { current_price: number; original_price: number };
  stock_info?: Array<{ stock_type: number; current_stock: number }>;
}

/**
 * Lista IDs dos items do shop. Shopee paga: 100 por página.
 */
export async function getItemList(opts: {
  offset?: number;
  pageSize?: number;
  itemStatus?: Array<"NORMAL" | "BANNED" | "UNLIST" | "DELETED">;
}): Promise<{ items: ShopeeItemSummary[]; total: number; hasNextPage: boolean }> {
  const query: Record<string, string | number> = {
    offset: opts.offset ?? 0,
    page_size: opts.pageSize ?? 100,
  };
  if (opts.itemStatus) query.item_status = opts.itemStatus.join(",");

  const res = await shopeeFetch<{
    response?: {
      item: ShopeeItemSummary[];
      total_count: number;
      has_next_page: boolean;
    };
  }>("/api/v2/product/get_item_list", { query });

  return {
    items: res.response?.item ?? [],
    total: res.response?.total_count ?? 0,
    hasNextPage: res.response?.has_next_page ?? false,
  };
}

/**
 * Busca detalhes em batch (máx 50 items por chamada).
 */
export async function getItemBaseInfo(itemIds: number[]): Promise<ShopeeItem[]> {
  if (itemIds.length === 0) return [];
  if (itemIds.length > 50) {
    throw new Error("getItemBaseInfo: máx 50 IDs por chamada");
  }
  const res = await shopeeFetch<{
    response?: { item_list: ShopeeItem[] };
  }>("/api/v2/product/get_item_base_info", {
    query: { item_id_list: itemIds.join(",") },
  });
  return res.response?.item_list ?? [];
}

/**
 * Lista TODOS items do shop com detalhes (paginado automaticamente).
 */
export async function listAllItems(
  status: Array<"NORMAL" | "BANNED" | "UNLIST"> = ["NORMAL"],
): Promise<ShopeeItem[]> {
  const allIds: number[] = [];
  let offset = 0;
  const pageSize = 100;

  while (true) {
    const { items, hasNextPage } = await getItemList({
      offset,
      pageSize,
      itemStatus: status,
    });
    allIds.push(...items.map((i) => i.item_id));
    if (!hasNextPage) break;
    offset += pageSize;
    if (offset > 5000) break; // safety cap
  }

  // Buscar detalhes em batches de 50
  const all: ShopeeItem[] = [];
  for (let i = 0; i < allIds.length; i += 50) {
    const batch = allIds.slice(i, i + 50);
    const detailed = await getItemBaseInfo(batch);
    all.push(...detailed);
  }
  return all;
}

/**
 * Atualiza item_sku de um produto (sem variações). Pra produtos com
 * variações, usar update_model.
 */
export async function updateItemSku(
  itemId: number,
  newSku: string,
): Promise<void> {
  await shopeeFetch("/api/v2/product/update_item", {
    method: "POST",
    body: { item_id: itemId, item_sku: newSku },
  });
}
