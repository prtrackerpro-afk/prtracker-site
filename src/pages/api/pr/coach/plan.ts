import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../lib/supabase/server";

export const prerender = false;

// POST: cria plano novo (header + exercises)
// PATCH: atualiza exercises do plano existente
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.athlete) return jsonError(401, "unauthorized");

  let body: {
    athlete_id?: string;
    name?: string;
    week_start_date?: string;
    notes?: string;
    exercises?: Array<{
      day_index: number;
      order_idx: number;
      exercise_name: string;
      sets?: number;
      reps?: string;
      weight_kg?: number;
      rpe?: number;
      rest_sec?: number;
      notes?: string;
    }>;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_body");
  }

  if (!body.athlete_id || !body.name || !body.week_start_date) {
    return jsonError(400, "missing_fields");
  }

  const supabase = getServerSupabase({ headers: request.headers, cookies });

  // Confirma que é coach approved
  const { data: coach } = await supabase
    .from("pr_coaches")
    .select("status, coach_type")
    .eq("user_id", locals.athlete.userId)
    .maybeSingle();

  if (!coach || coach.status !== "approved" || coach.coach_type !== "personal_trainer") {
    return jsonError(403, "not_pt", "Apenas Personal Trainers aprovados podem criar planos.");
  }

  const { data: plan, error: planErr } = await supabase
    .from("pr_workout_plans")
    .insert({
      coach_id: locals.athlete.userId,
      athlete_id: body.athlete_id,
      name: body.name,
      week_start_date: body.week_start_date,
      notes: body.notes ?? null,
      status: "active",
    })
    .select("id")
    .single();

  if (planErr) return jsonError(500, "plan_insert_failed", planErr.message);

  if (body.exercises && body.exercises.length > 0) {
    const rows = body.exercises.map((ex) => ({
      plan_id: plan.id,
      day_index: ex.day_index,
      order_idx: ex.order_idx,
      exercise_name: ex.exercise_name,
      sets: ex.sets ?? null,
      reps: ex.reps ?? null,
      weight_kg: ex.weight_kg ?? null,
      rpe: ex.rpe ?? null,
      rest_sec: ex.rest_sec ?? null,
      notes: ex.notes ?? null,
    }));
    const { error: exErr } = await supabase
      .from("pr_workout_exercises")
      .insert(rows);
    if (exErr) {
      // Rollback do plano
      await supabase.from("pr_workout_plans").delete().eq("id", plan.id);
      return jsonError(500, "exercises_insert_failed", exErr.message);
    }
  }

  return new Response(JSON.stringify({ id: plan.id }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};

function jsonError(status: number, code: string, message?: string) {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
