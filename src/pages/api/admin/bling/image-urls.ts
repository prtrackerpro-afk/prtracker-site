/**
 * GET /api/admin/bling/image-urls
 *
 * Gera a lista SKU → URL de imagem do site pra todo produto do Bling.
 * Read-only — NÃO grava nada. Serve pra preencher a coluna AR
 * ("URL Imagens Externas") no Importar planilha do Bling, já que a API
 * PUT /produtos não persiste imagem.
 *
 * Resposta: { total, withUrl[], withoutUrl[] }
 *
 * Auth: admin middleware. Bling deve estar conectado (OAuth).
 */
import type { APIRoute } from "astro";
import { isConnected } from "~/lib/bling/oauth";
import { listProductImageUrls } from "~/lib/bling/product-images";

export const prerender = false;

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const GET: APIRoute = async () => {
  if (!(await isConnected())) {
    return json({ error: "bling not connected" }, 503);
  }
  try {
    const report = await listProductImageUrls();
    return json(report, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[image-urls]", msg);
    return json({ error: msg }, 502);
  }
};
