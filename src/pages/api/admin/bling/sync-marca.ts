/**
 * POST /api/admin/bling/sync-marca
 *
 * Carimba a marca "PR Tracker" em todos os produtos do Bling. Todo produto do
 * catálogo é da marca PR Tracker; produtos novos já nascem com a marca via
 * createProduct, este endpoint é o backfill dos existentes.
 *
 * Idempotente: lê a marca atual de cada produto e só faz PUT em quem está
 * divergente (no-op nos que já estão certos).
 *
 * Body JSON (opcional):
 *   { dryRun?: boolean, marca?: string, only?: string[] }
 *   - dryRun: true → monta o plano mas NÃO chama o Bling (preview).
 *   - marca: sobrescreve a marca alvo (default "PR Tracker").
 *   - only: ["DEADLIFT-SET", ...] → restringe aos SKUs; omitido = todos.
 *
 * Resposta:
 *   { dryRun, marca, total, applied[], noOp[], planned[], errors[] }
 *
 * Auth: admin middleware. Bling deve estar conectado (OAuth).
 */
import type { APIRoute } from "astro";
import { isConnected } from "~/lib/bling/oauth";
import { syncMarca } from "~/lib/bling/products";

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

  let body: { dryRun?: boolean; marca?: string; only?: string[] } = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  try {
    const report = await syncMarca({
      dryRun: body.dryRun === true,
      marca: typeof body.marca === "string" ? body.marca : undefined,
      only: Array.isArray(body.only) ? body.only : null,
    });
    return json(report, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-marca]", msg);
    return json({ error: msg }, 502);
  }
};
