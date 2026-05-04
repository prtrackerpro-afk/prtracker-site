/**
 * GET /api/admin/bling/naturezas
 *
 * Lists all "naturezas de operação" cadastradas no Bling do operador.
 * Helper UI on /admin/bling uses this to surface IDs so Felipe can copy
 * the right one into BLING_NATUREZA_OPERACAO_ID env var without hunting
 * through the Bling dashboard (which doesn't expose IDs in a discoverable
 * way for admin users).
 *
 * Auth: admin middleware. No state mutated.
 */

import type { APIRoute } from "astro";
import { blingFetch } from "~/lib/bling/api";
import { isConnected } from "~/lib/bling/oauth";

export const prerender = false;

interface BlingNaturezaOperacao {
  id: number;
  descricao?: string;
  cfop?: string;
  tipo?: number; // 0 = entrada, 1 = saída
  situacao?: number; // 1 = ativa
}

export const GET: APIRoute = async () => {
  if (!(await isConnected())) {
    return new Response(
      JSON.stringify({ error: "bling not connected" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const result = await blingFetch<BlingNaturezaOperacao[]>(
      "/naturezas-operacoes",
      { method: "GET" },
    );
    // Bling sometimes wraps in { data: [...] } and sometimes returns the array
    // directly — blingFetch already unwraps `data`. Defensive check anyway.
    const items = Array.isArray(result) ? result : [];

    // Sort: saída + ativa first (most likely the one Felipe wants), then rest.
    const sorted = items
      .filter((n) => n && typeof n.id === "number")
      .sort((a, b) => {
        const aPriority = (a.tipo === 1 ? 0 : 1) + (a.situacao === 1 ? 0 : 2);
        const bPriority = (b.tipo === 1 ? 0 : 1) + (b.situacao === 1 ? 0 : 2);
        if (aPriority !== bPriority) return aPriority - bPriority;
        return (a.descricao ?? "").localeCompare(b.descricao ?? "");
      });

    return new Response(JSON.stringify({ naturezas: sorted }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
};
