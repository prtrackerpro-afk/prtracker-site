import type { APIRoute } from "astro";
import { getServerSupabase, getAdminSupabase } from "../../../../lib/supabase/server";
import { isExercise } from "../../../../lib/pr/exercises";
import { insertPR } from "../../../../lib/pr/db";
import { tierForLift, TIER_META, type Tier } from "../../../../lib/pr/strength-score";
import { sendLevelUpEmail } from "../../../../lib/pr/email";

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
    const { record, previousBestKg, isPR } = await insertPR(supabase, {
      userId: athlete.userId,
      exercise: body.exercise,
      weightKg: weight,
      performedAt: body.performed_at,
      notes: body.notes ?? null,
      photoUrl: body.photo_url ?? null,
      boxId: body.box_id ?? null,
    });

    // Side-effects: level-up notification + email. Best-effort, never
    // block the response — the celebrate page reads tier directly from
    // the record + body data, so the user UX doesn't depend on these.
    if (isPR && athlete.bodyWeightKg && athlete.sex && previousBestKg != null) {
      void notifyLevelUp({
        userId: athlete.userId,
        toEmail: athlete.email,
        athleteName: athlete.displayName ?? "Atleta",
        exercise: body.exercise,
        weight,
        previousBestKg: Number(previousBestKg),
        bodyWeightKg: athlete.bodyWeightKg,
        sex: athlete.sex,
        recordId: record.id,
      });
    }

    return new Response(JSON.stringify(record), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Falha ao salvar PR.";
    return jsonError(500, "insert_failed", message);
  }
};

async function notifyLevelUp(opts: {
  userId: string;
  toEmail: string;
  athleteName: string;
  exercise: import("../../../../lib/pr/exercises").ExerciseId;
  weight: number;
  previousBestKg: number;
  bodyWeightKg: number;
  sex: "male" | "female";
  recordId: string;
}) {
  try {
    const newScore = tierForLift(opts.exercise, opts.weight, opts.bodyWeightKg, opts.sex);
    const oldScore = tierForLift(opts.exercise, opts.previousBestKg, opts.bodyWeightKg, opts.sex);
    if (TIER_META[newScore.tier].rank <= TIER_META[oldScore.tier].rank) return;

    // In-app notification (service-role; trigger doesn't fire for level_up).
    const admin = getAdminSupabase();
    await admin.from("pr_notifications").insert({
      user_id: opts.userId,
      type: "level_up",
      payload: {
        tier: newScore.tier as Tier,
        previous_tier: oldScore.tier as Tier,
        exercise: opts.exercise,
        weight_kg: opts.weight,
        record_id: opts.recordId,
      },
    });

    // Email (best-effort, silent if Resend unavailable).
    await sendLevelUpEmail({
      toEmail: opts.toEmail,
      athleteName: opts.athleteName,
      newTier: newScore.tier as Tier,
      previousTier: oldScore.tier as Tier,
      exerciseId: opts.exercise,
      weightKg: opts.weight,
      recordId: opts.recordId,
    });
  } catch (e) {
    console.warn("[pr:notifyLevelUp] failed", e);
  }
}

function jsonError(status: number, code: string, message?: string) {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
