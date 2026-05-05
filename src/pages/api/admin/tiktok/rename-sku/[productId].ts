/**
 * POST /api/admin/tiktok/rename-sku/{productId}
 *
 * Renomeia o seller_sku de um produto TikTok. Se o produto tem múltiplas
 * variações, body deve incluir mapping por sku_id; senão, aplica em qualquer
 * SKU única.
 *
 * Body (single SKU):
 *   { "newSellerSku": "TT-BENCH-120" }
 *
 * Body (multi variation):
 *   { "skuMap": { "<sku_id_1>": "TEE-MASC-P", "<sku_id_2>": "TEE-MASC-M", ... } }
 *
 * Auth: admin middleware. TikTok deve estar conectado.
 */

import type { APIRoute } from "astro";
import {
  getProduct,
  updateProductSkus,
  renameSellerSku,
} from "~/lib/tiktok/products";
import { isConnected } from "~/lib/tiktok/oauth";
import { TikTokApiError } from "~/lib/tiktok/api";

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
  if (!(await isConnected())) {
    return new Response(
      JSON.stringify({ error: "tiktok not connected" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const productId = params.productId;
  if (!productId) {
    return new Response(
      JSON.stringify({ error: "productId é obrigatório" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: { newSellerSku?: unknown; skuMap?: unknown } = {};
  try {
    body = (await request.json()) as { newSellerSku?: unknown; skuMap?: unknown };
  } catch {
    return new Response(
      JSON.stringify({ error: "body JSON inválido" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    if (typeof body.newSellerSku === "string") {
      // Caminho simples: produto sem variações.
      await renameSellerSku(productId, body.newSellerSku);
      return new Response(
        JSON.stringify({
          ok: true,
          productId,
          updated: { single_sku: body.newSellerSku },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (body.skuMap && typeof body.skuMap === "object" && !Array.isArray(body.skuMap)) {
      const map = body.skuMap as Record<string, string>;
      // Carrega produto pra preservar SKUs não mencionados.
      const product = await getProduct(productId);
      if (!product) {
        return new Response(
          JSON.stringify({ error: `produto ${productId} não encontrado` }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        );
      }
      // Bling-style: precisa enviar TODOS os SKUs no PUT, não só os que mudaram.
      const skusPayload = (product.skus ?? []).map((s) => ({
        id: s.id,
        seller_sku: typeof map[s.id] === "string" ? map[s.id] : s.seller_sku,
      }));
      await updateProductSkus(productId, skusPayload);
      return new Response(
        JSON.stringify({ ok: true, productId, updated: { skuMap: map } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        error: "informe `newSellerSku` (string) ou `skuMap` (objeto sku_id→novo_sku)",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const status = err instanceof TikTokApiError ? err.httpStatus : 502;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[tiktok/rename-sku]", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status, headers: { "Content-Type": "application/json" } },
    );
  }
};
