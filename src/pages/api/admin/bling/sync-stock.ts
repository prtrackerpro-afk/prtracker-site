/**
 * POST /api/admin/bling/sync-stock
 *
 * Fixa estoque "infinito" (teto alto) nos produtos do Bling via balanço
 * (operacao "B"). Modelo PR Tracker = produção sob demanda: todo produto tem
 * estoque virtualmente infinito; o objetivo é só nunca zerar, pra os
 * marketplaces integrados via Bling manterem os anúncios ativos.
 *
 * Como o balanço grava o saldo ABSOLUTO, o sync é idempotente: rodar de novo
 * sempre resulta no mesmo saldo (nunca acumula). A mesma lógica roda no cron
 * diário (`/api/cron/ingest`) pra manter o estoque pinado sozinho.
 *
 * Body JSON (opcional):
 *   { dryRun?: boolean, target?: number, only?: string[] }
 *   - dryRun: true → monta o plano mas NÃO chama o Bling (preview).
 *   - target: saldo alvo (default 9999).
 *   - only: ["DEADLIFT-SET", ...] → restringe aos SKUs; omitido = todos físicos.
 *
 * Depósito: BLING_DEPOSITO_ID (env) ou auto-descoberto se houver só 1.
 *
 * Auth: admin middleware. Bling deve estar conectado (OAuth).
 */
import type { APIRoute } from "astro";
import { isConnected } from "~/lib/bling/oauth";
import { syncInfiniteStock } from "~/lib/bling/estoque";

export const prerender = false;

function getEnvInt(name: string): number | undefined {
  const raw = (import.meta.env as any)[name] || (process.env as any)[name];
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

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

  let body: { dryRun?: boolean; target?: number; only?: string[] } = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  try {
    const report = await syncInfiniteStock({
      dryRun: body.dryRun === true,
      target: body.target,
      only: Array.isArray(body.only) ? body.only : null,
      depositoId: getEnvInt("BLING_DEPOSITO_ID"),
    });
    return json(report, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-stock]", msg);
    // Falha de depósito (ex: vários sem padrão) é erro de config → 400.
    const status = /dep[óo]sito/i.test(msg) ? 400 : 502;
    return json({ error: msg }, status);
  }
};
