/**
 * TikTok Shop Open Platform — Categorias.
 *
 * Docs: https://partner.tiktokshop.com/docv2/page/650a6e60ce71fd02b15596c4
 *
 * Endpoint:
 *   GET /product/202309/categories → árvore completa de categorias da loja (por região)
 *
 * Uso prático aqui: as categorias do TikTok são por REGIÃO (BR), não por loja.
 * Então o `category_id` lido de qualquer loja BR (inclusive a antiga) é válido
 * pra qualquer outra loja BR — incluindo a nova (PR Tracker 02). Isso permite
 * reaproveitar no Bling os IDs de categoria que os produtos antigos já usavam.
 */

import { tiktokFetch } from "./api";

export interface TikTokCategoryNode {
  id: string;
  parent_id?: string;
  local_name?: string;
  is_leaf?: boolean;
  permission_statuses?: string[];
}

/**
 * Lista a árvore completa de categorias da loja conectada. Best-effort:
 * usado só pra resolver category_id → nome legível.
 */
export async function getCategories(): Promise<TikTokCategoryNode[]> {
  const res = await tiktokFetch<{ categories?: TikTokCategoryNode[] }>(
    "/product/202309/categories",
    { method: "GET" },
  );
  return res.categories ?? [];
}

/**
 * Monta o caminho completo de uma categoria a partir do id, subindo pelos
 * parent_id (ex: "Casa & Decoração > Decoração > Estatuetas"). Guard contra
 * ciclos/profundidade absurda.
 */
export function buildCategoryPath(
  id: string,
  byId: Map<string, TikTokCategoryNode>,
): string {
  const parts: string[] = [];
  let cur: TikTokCategoryNode | undefined = byId.get(id);
  let guard = 0;
  while (cur && guard++ < 20) {
    if (cur.local_name) parts.unshift(cur.local_name);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return parts.join(" > ");
}
