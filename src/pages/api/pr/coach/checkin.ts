import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../lib/supabase/server";

export const prerender = false;

// Athlete marca exercicio do plano como feito (toggle)
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.athlete) return jsonError(401, "unauthorized");

  let body: { exercise_id?: string; done?: boolean; rpe?: number };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_body");
  }

  if (!body.exercise_id) return jsonError(400, "missing_exercise_id");

  const supabase = getServerSupabase({ headers: request.headers, cookies });

  // Confirma que o exercicio pertence a um plano do athlete
  const { data: ex } = await supabase
    .from("pr_workout_exercises")
    .select("id, plan_id, pr_workout_plans!inner(athlete_id)")
    .eq("id", body.exercise_id)
    .maybeSingle();

  if (!ex) return jsonError(404, "exercise_not_found");
  const planAthleteId = (ex.pr_workout_plans as { athlete_id: string }).athlete_id;
  if (planAthleteId !== locals.athlete.userId) {
    return jsonError(403, "not_your_plan");
  }

  const { error } = await supabase
    .from("pr_workout_exercises")
    .update({
      done_at: body.done ? new Date().toISOString() : null,
      done_rpe: body.rpe ?? null,
    })
    .eq("id", body.exercise_id);

  if (error) return jsonError(500, "update_failed", error.message);

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
