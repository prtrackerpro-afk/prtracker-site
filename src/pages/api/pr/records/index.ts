import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../lib/supabase/server";
import { isExercise } from "../../../../lib/pr/exercises";
import { insertPR } from "../../../../lib/pr/db";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const athlete = locals.athlete;
  if (!athlete) return jsonError(401, "unauthorized");

  let body: {
    exercise?: string;
    weight_kg?: number;
    performed_at?: string;
    notes?: string | null;
    photo_url?: string | null;
    box_id?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_body");
  }

  if (!isExercise(body.exercise)) {
    return jsonError(400, "invalid_exercise", "Movimento inválido.");
  }
  const weight = Number(body.weight_kg);
  if (!Number.isFinite(weight) || weight <= 0 || weight >= 1000) {
    return jsonError(400, "invalid_weight", "Peso fora do intervalo aceito.");
  }
  if (body.performed_at && !/^\d{4}-\d{2}-\d{2}$/.test(body.performed_at)) {
    return jsonError(400, "invalid_date");
  }

  const supabase = getServerSupabase({ headers: request.headers, cookies });

  try {
    const { record } = await insertPR(supabase, {
      userId: athlete.userId,
      exercise: body.exercise,
      weightKg: weight,
      performedAt: body.performed_at,
      notes: body.notes ?? null,
      photoUrl: body.photo_url ?? null,
      boxId: body.box_id ?? null,
    });
    return new Response(JSON.stringify(record), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Falha ao salvar PR.";
    return jsonError(500, "insert_failed", message);
  }
};

function jsonError(status: number, code: string, message?: string) {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
