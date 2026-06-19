/**
 * GET /api/admin/tiktok/categories
 *
 * Lê a categoria de cada produto da loja TikTok CONECTADA (atualmente a loja
 * antiga) e agrupa por categoria. Read-only.
 *
 * Na API 202309, a categoria do produto vem em `category_chains` (o caminho da
 * raiz até a folha), NÃO num campo `category_id` plano. Pegamos a folha
 * (is_leaf) — esse id é o que vai no campo "ID na loja" do de-para do Bling.
 * Categorias do TikTok são por região (BR), então o id vale pra loja nova.
 *
 * Auth: admin middleware. TikTok deve estar conectado (OAuth).
 */

import type { APIRoute } from "astro";
import { isConnected } from "~/lib/tiktok/oauth";
import { listAllProducts, getProduct } from "~/lib/tiktok/products";

export const prerender = false;

interface CategoryChainNode {
  id?: string;
  parent_id?: string;
  local_name?: string;
  is_leaf?: boolean;
}

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
    const products = await listAllProducts("ALL");
    const perProduct: Array<{
      seller_sku: string | null;
      title: string;
      status: string;
      category_id: string | null;
      category_path: string;
    }> = [];

    for (const p of products) {
      const detail = (await getProduct(p.id)) as
        | { skus?: Array<{ seller_sku?: string }>; category_chains?: CategoryChainNode[] }
        | null;
      const chains = detail?.category_chains ?? [];
      const leaf = chains.find((c) => c.is_leaf) ?? chains[chains.length - 1];
      const sku =
        detail?.skus?.[0]?.seller_sku ?? p.skus?.[0]?.seller_sku ?? null;
      perProduct.push({
        seller_sku: sku,
        title: p.title,
        status: p.status,
        category_id: leaf?.id ?? null,
        category_path: chains
          .map((c) => c.local_name)
          .filter(Boolean)
          .join(" > "),
      });
    }

    // Agrupa por category_id (é isso que vai pro Bling).
    const groups = new Map<
      string,
      { category_id: string; category_path: string; skus: string[] }
    >();
    for (const r of perProduct) {
      if (!r.category_id) continue;
      const g = groups.get(r.category_id) ?? {
        category_id: r.category_id,
        category_path: r.category_path,
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
