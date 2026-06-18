/**
 * POST /api/admin/bling/sync-images
 *
 * Backfill de imagens: anexa a hero do site em todo produto do Bling que está
 * SEM imagem. O Bling baixa a imagem da URL pública (campo
 * `midia.imagens.externas`). Idempotente — produto que já tem imagem é pulado.
 *
 * Body JSON (opcional):
 *   { dryRun?: boolean, only?: string[] }
 *   - dryRun: true → monta o plano mas NÃO chama o Bling (preview).
 *   - only: ["DEADLIFT-SET", ...] → restringe aos SKUs; omitido = todos.
 *
 * Resposta:
 *   { dryRun, total, applied[], planned[], skippedHasImage[], skippedNoSuggestion[], errors[] }
 *
 * Auth: admin middleware. Bling deve estar conectado (OAuth).
 */
import type { APIRoute } from "astro";
import { isConnected } from "~/lib/bling/oauth";
import { syncProductImages } from "~/lib/bling/product-images";

export const prerender = false;

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request }) => {
  if (!(await isConnected())) {
    return json({ error: "bling not connected" }, 503);
  }

  let body: { dryRun?: boolean; only?: string[] } = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  try {
    const report = await syncProductImages({
      dryRun: body.dryRun === true,
      only: Array.isArray(body.only) ? body.only : null,
    });
    return json(report, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-images]", msg);
    return json({ error: msg }, 502);
  }
};
