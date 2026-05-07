/**
 * GET /api/pr/gym/visit/[handle] — retorna dados do gym de outro atleta.
 *
 * Acesso controlado pela function pr_get_visitable_gym (SECURITY DEFINER):
 *   - public  → qualquer atleta logado
 *   - friends → quem é seguido pelo dono
 *   - private → ninguém (404)
 *
 * Retorno: profile + layout + xp + best_lifts + skills + runs.
 */

import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../../lib/supabase/server";

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies, locals, params }) => {
  const athlete = locals.athlete;
  if (!athlete) return jsonError(401, "unauthorized");

  const handle = String(params.handle ?? "").trim();
  if (!handle) return jsonError(400, "missing_handle");

  const supabase = getServerSupabase({ headers: request.headers, cookies });
  const { data, error } = await supabase
    .rpc("pr_get_visitable_gym", { p_handle: handle })
    .maybeSingle();

  if (error) return jsonError(500, "fetch_failed", error.message);
  if (!data) return jsonError(404, "not_found_or_private");

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

function jsonError(status: number, code: string, message?: string) {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
