/**
 * GET /api/pr/gym/layout — retorna layout salvo do atleta (ou null)
 * POST /api/pr/gym/layout — salva layout {version, objects[]}
 *
 * Persistência da planta baixa do ginásio virtual. Schema em
 * src/lib/pr/gym/layout.ts. Coluna pr_athletes.gym_layout JSONB
 * (migration 0015).
 *
 * Auth: middleware popula locals.athlete.
 */

import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../lib/supabase/server";
import { OBJECT_META } from "../../../../lib/pr/gym/layout";

export const prerender = false;

// Whitelist derivada do OBJECT_META pra nunca desincronizar com o
// schema do client. Bug histórico: lista hardcoded com tipos antigos
// rejeitava silenciosamente saves de equipamentos novos (V15).
const VALID_TYPES = new Set(Object.keys(OBJECT_META));

export const GET: APIRoute = async ({ request, cookies, locals }) => {
  const athlete = locals.athlete;
  if (!athlete) return jsonError(401, "unauthorized");

  const supabase = getServerSupabase({ headers: request.headers, cookies });
  const { data, error } = await supabase
    .from("pr_athletes")
    .select("gym_layout")
    .eq("user_id", athlete.userId)
    .maybeSingle();

  if (error) return jsonError(500, "fetch_failed", error.message);

  return new Response(
    JSON.stringify({ layout: data?.gym_layout ?? null }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const athlete = locals.athlete;
  if (!athlete) return jsonError(401, "unauthorized");

  let body: { layout?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_body");
  }

  const layout = body.layout as
    | { version?: number; objects?: unknown[] }
    | undefined;
  if (!layout || typeof layout !== "object") {
    return jsonError(400, "invalid_layout");
  }
  if (layout.version !== 1) {
    return jsonError(400, "invalid_version", "Versão de layout não suportada.");
  }
  if (!Array.isArray(layout.objects)) {
    return jsonError(400, "invalid_objects");
  }

  // Sanity: tamanho razoável (anti-payload bomb)
  if (layout.objects.length > 100) {
    return jsonError(400, "too_many_objects", "Máximo 100 objetos.");
  }

  // Validar shape de cada objeto
  for (const obj of layout.objects) {
    if (
      !obj ||
      typeof obj !== "object" ||
      typeof (obj as { id?: unknown }).id !== "string" ||
      typeof (obj as { type?: unknown }).type !== "string" ||
      !VALID_TYPES.has((obj as { type: string }).type) ||
      !Number.isFinite((obj as { x?: unknown }).x as number) ||
      !Number.isFinite((obj as { z?: unknown }).z as number) ||
      !Number.isFinite((obj as { rot?: unknown }).rot as number)
    ) {
      return jsonError(400, "invalid_object_shape");
    }
  }

  const supabase = getServerSupabase({ headers: request.headers, cookies });
  const { error } = await supabase
    .from("pr_athletes")
    .update({ gym_layout: layout, updated_at: new Date().toISOString() })
    .eq("user_id", athlete.userId);

  if (error) return jsonError(500, "save_failed", error.message);

  return new Response(JSON.stringify({ ok: true }), {
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
