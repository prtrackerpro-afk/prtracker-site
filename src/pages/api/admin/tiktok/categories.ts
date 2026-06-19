/**
 * GET /api/admin/tiktok/categories
 *
 * Lê o `category_id` de cada produto da loja TikTok CONECTADA (atualmente a
 * loja antiga) e agrupa por categoria, resolvendo o nome legível. Read-only.
 *
 * Objetivo: descobrir os IDs de categoria do TikTok que os produtos já usavam,
 * pra colar no campo "ID na loja" do de-para de categorias do Bling (PR Tracker
 * 02). Categorias do TikTok são por região (BR), então o ID serve pra loja nova.
 *
 * Auth: admin middleware. TikTok deve estar conectado (OAuth).
 */

import type { APIRoute } from "astro";
import { isConnected } from "~/lib/tiktok/oauth";
import { listAllProducts, getProduct } from "~/lib/tiktok/products";
import {
  getCategories,
  buildCategoryPath,
  type TikTokCategoryNode,
} from "~/lib/tiktok/categories";

export const prerender = false;

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const GET: APIRoute = async () => {
  if (!(await isConnected())) {
    return json({ error: "tiktok not connected" }, 503);
  }

  try {
    // 1) Produtos da loja conectada + category_id de cada um.
    const products = await listAllProducts("ALL");
    const perProduct: Array<{
      seller_sku: string | null;
      title: string;
      status: string;
      category_id: string | null;
    }> = [];

    for (const p of products) {
      const detail = await getProduct(p.id);
      const sku =
        detail?.skus?.[0]?.seller_sku ?? p.skus?.[0]?.seller_sku ?? null;
      perProduct.push({
        seller_sku: sku,
        title: p.title,
        status: p.status,
        category_id: detail?.category_id ?? null,
      });
    }

    // 2) Resolve nome das categorias (best-effort — não quebra se falhar).
    let byId = new Map<string, TikTokCategoryNode>();
    try {
      const cats = await getCategories();
      byId = new Map(cats.map((c) => [c.id, c]));
    } catch {
      /* segue sem nomes — o category_id já é o que importa */
    }

    // 3) Agrupa por category_id (é isso que vai pro Bling).
    const groups = new Map<
      string,
      { category_id: string; category_name: string; skus: string[] }
    >();
    for (const r of perProduct) {
      if (!r.category_id) continue;
      const g = groups.get(r.category_id) ?? {
        category_id: r.category_id,
        category_name: byId.size ? buildCategoryPath(r.category_id, byId) : "",
        skus: [],
      };
      g.skus.push(r.seller_sku ?? r.title);
      groups.set(r.category_id, g);
    }

    return json(
      {
        connected_shop_note:
          "category_id é por região (BR) — vale pra qualquer loja BR, inclusive PR Tracker 02",
        byCategory: Array.from(groups.values()),
        perProduct,
      },
      200,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[tiktok/categories]", msg);
    return json({ error: msg }, 502);
  }
};
