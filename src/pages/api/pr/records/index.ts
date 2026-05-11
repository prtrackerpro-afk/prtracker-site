import type { APIRoute } from "astro";
import { getServerSupabase, getAdminSupabase } from "../../../../lib/supabase/server";
import { isExercise } from "../../../../lib/pr/exercises";
import { insertPR } from "../../../../lib/pr/db";
import { tierForLift, TIER_META, type Tier } from "../../../../lib/pr/strength-score";
import { sendLevelUpEmail } from "../../../../lib/pr/email";
import { xpForLiftPR, xpForStreakDay } from "../../../../lib/pr/gym/xp";

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

    // XP: only for new PRs. Idempotent via unique (user_id, source, source_key).
    if (isPR && athlete.bodyWeightKg && athlete.sex) {
      void grantPRXp({
        userId: athlete.userId,
        exercise: body.exercise,
        weight,
        bodyWeightKg: athlete.bodyWeightKg,
        sex: athlete.sex,
        performedAt: record.performed_at,
      });
    }

    // Notifica coaches dos boxes onde esse atleta é membro — fire-and-forget.
    // Quando atleta bate PR, todo owner_user_id de pr_boxes onde ele é
    // membro recebe uma notificação tipo "athlete_pr".
    if (isPR) {
      void notifyCoachesOfPR({
        athleteId: athlete.userId,
        athleteName: athlete.displayName ?? "Atleta",
        exercise: body.exercise,
        weight,
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

async function grantPRXp(opts: {
  userId: string;
  exercise: import("../../../../lib/pr/exercises").ExerciseId;
  weight: number;
  bodyWeightKg: number;
  sex: "male" | "female";
  performedAt: string;
}) {
  try {
    const score = tierForLift(opts.exercise, opts.weight, opts.bodyWeightKg, opts.sex);
    const liftXp = xpForLiftPR(opts.weight, score.tier as Tier);
    if (liftXp <= 0) return;
    const day = String(opts.performedAt).slice(0, 10);
    const admin = getAdminSupabase();
    await admin.from("pr_xp_events").upsert(
      [
        {
          user_id: opts.userId,
          source: "lift_pr",
          source_key: `lift:${opts.exercise}:${opts.weight}`,
          amount: liftXp,
          payload: {
            exercise: opts.exercise,
            weight_kg: opts.weight,
            tier: score.tier,
            date: day,
          },
        },
        {
          user_id: opts.userId,
          source: "streak_day",
          source_key: `streak:${day}`,
          amount: xpForStreakDay(),
          payload: { day },
        },
      ],
      { onConflict: "user_id,source,source_key", ignoreDuplicates: true }
    );
  } catch (e) {
    console.warn("[pr:grantPRXp] failed", e);
  }
}

async function notifyCoachesOfPR(opts: {
  athleteId: string;
  athleteName: string;
  exercise: import("../../../../lib/pr/exercises").ExerciseId;
  weight: number;
  recordId: string;
}) {
  try {
    const admin = getAdminSupabase();
    // Acha boxes onde o atleta é membro
    const { data: memberships } = await admin
      .from("pr_box_members")
      .select("box_id, pr_boxes!inner(id, slug, name, owner_user_id)")
      .eq("user_id", opts.athleteId);
    if (!memberships || memberships.length === 0) return;
    const rows = memberships as Array<{
      box_id: string;
      pr_boxes: { id: string; slug: string; name: string; owner_user_id: string };
    }>;
    // Dedupe por coach (atleta pode ser membro de múltiplos boxes do mesmo coach)
    const seen = new Set<string>();
    const inserts = [] as Array<{
      user_id: string;
      type: string;
      actor_user_id: string;
      payload: Record<string, unknown>;
    }>;
    for (const m of rows) {
      const coachId = m.pr_boxes.owner_user_id;
      // Coach não recebe notificação do próprio PR (caso seja membro do próprio box)
      if (coachId === opts.athleteId) continue;
      const key = `${coachId}:${opts.recordId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      inserts.push({
        user_id: coachId,
        type: "athlete_pr",
        actor_user_id: opts.athleteId,
        payload: {
          exercise: opts.exercise,
          weight_kg: opts.weight,
          record_id: opts.recordId,
          box_id: m.pr_boxes.id,
          box_slug: m.pr_boxes.slug,
          box_name: m.pr_boxes.name,
          athlete_name: opts.athleteName,
        },
      });
    }
    if (inserts.length > 0) {
      await admin.from("pr_notifications").insert(inserts);
    }
  } catch (e) {
    console.warn("[pr:notifyCoachesOfPR] failed", e);
  }
}

function jsonError(status: number, code: string, message?: string) {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
